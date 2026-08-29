// Huawei AH100 / CH100 Web Bluetooth interoperability.
// Wire facts and clean-room reference implementation adapted from
// https://github.com/lvxiangyu11/faa0-body-scale-protocol (MIT, © 2026).
// See the matching notice in the repository root NOTICE.md.

export const SERVICE_UUID = '0000faa0-0000-1000-8000-00805f9b34fb'
export const WRITE_UUID = '0000faa1-0000-1000-8000-00805f9b34fb'
export const NOTIFY_UUID = '0000faa2-0000-1000-8000-00805f9b34fb'

const INITIAL_KEY = Uint8Array.from([0x3D, 0xA2, 0x78, 0x4A, 0xFB, 0x87, 0xB1, 0x2A, 0x98, 0x0F, 0xDE, 0x34, 0x56, 0x73, 0x21, 0x56])
const INITIAL_IV = Uint8Array.from([0x4E, 0xF7, 0x64, 0x32, 0x2F, 0xDA, 0x76, 0x32, 0x12, 0x3D, 0xEB, 0x87, 0x90, 0xFE, 0xA2, 0x19])

const CMD_SET_UNIT = 0x02
const CMD_SET_TIME = 0x08
const CMD_USER_INFO = 0x09
const CMD_FAT_ACK = 0x13
const CMD_AUTH = 0x24
const CMD_BIND = 0x25

const NTFY_WAKE = 0x00
const NTFY_SLEEP = 0x01
const NTFY_MEASUREMENT = 0x0E
const NTFY_OVERLOAD = 0x13
const NTFY_LOW_POWER = 0x14
const NTFY_MEASUREMENT_ERROR = 0x15
const NTFY_LIST_UPDATE = 0x20
const NTFY_AUTH = 0x26
const NTFY_BIND = 0x27
const NTFY_MEASUREMENT2 = 0x8E

const asBytes = value => value instanceof Uint8Array
  ? value
  : new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength)
const concat = (...arrays) => Uint8Array.from(arrays.flatMap(a => Array.from(a)))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export function parseMac(value) {
  const text = String(value || '').trim().replaceAll('-', ':').toUpperCase()
  if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(text)) throw new Error('Invalid Bluetooth MAC address')
  return Uint8Array.from(text.split(':'), part => parseInt(part, 16))
}

export const formatMac = mac => {
  const bytes = asBytes(mac)
  if (bytes.length !== 6) throw new Error('Invalid Bluetooth MAC address')
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(':')
}

export const bytesToHex = value => Array.from(asBytes(value), byte => byte.toString(16).padStart(2, '0')).join('')
export function hexToBytes(value, expectedLength) {
  const text = String(value || '').replace(/[^0-9a-f]/gi, '')
  if (!text || text.length % 2 || !/^[0-9a-f]+$/i.test(text)) throw new Error('Invalid hexadecimal value')
  const out = Uint8Array.from(text.match(/../g), part => parseInt(part, 16))
  if (expectedLength && out.length !== expectedLength) throw new Error(`Expected ${expectedLength} bytes`)
  return out
}

export function xorMac(value, mac, start = 0) {
  const data = asBytes(value), key = asBytes(mac)
  if (key.length !== 6) throw new Error('MAC key must be 6 bytes')
  return Uint8Array.from(data, (byte, index) => byte ^ key[(start + index) % 6])
}

export function xorChecksum(value) {
  return asBytes(value).reduce((checksum, byte) => checksum ^ byte, 0)
}

export function makeToken(userId = 0, seed) {
  if (!Number.isInteger(userId) || userId < 0 || userId > 255) throw new Error('Scale user ID must be 0..255')
  const prefix = seed ? asBytes(seed) : globalThis.crypto.getRandomValues(new Uint8Array(5))
  if (prefix.length !== 5) throw new Error('Token seed must be 5 bytes')
  const token = Uint8Array.from([...prefix, 0, userId])
  token[5] = xorChecksum(token)
  return token
}

export function deriveMagicKey(token, mac) {
  const auth = asBytes(token)
  if (auth.length !== 7) throw new Error('Auth token must be 7 bytes')
  return concat(xorMac(auth, mac), INITIAL_KEY.slice(7))
}

export async function aesCtr(value, rawKey) {
  const data = asBytes(value), keyBytes = asBytes(rawKey)
  if (keyBytes.length !== 16) throw new Error('AES key must be 16 bytes')
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is not available')
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, 'AES-CTR', false, ['encrypt'])
  const result = await globalThis.crypto.subtle.encrypt({ name: 'AES-CTR', counter: INITIAL_IV.slice(), length: 128 }, key, data)
  return new Uint8Array(result)
}

export function pkcs7Pad(value, blockSize = 16) {
  const data = asBytes(value)
  const amount = blockSize - (data.length % blockSize) || blockSize
  return concat(data, new Uint8Array(amount).fill(amount))
}

export function pkcs7Unpad(value, blockSize = 16) {
  const data = asBytes(value)
  if (!data.length) throw new Error('Empty PKCS#7 buffer')
  const amount = data[data.length - 1]
  if (amount < 1 || amount > blockSize || amount > data.length) throw new Error('Invalid PKCS#7 padding')
  for (let index = data.length - amount; index < data.length; index++) {
    if (data[index] !== amount) throw new Error('Invalid PKCS#7 padding')
  }
  return data.slice(0, -amount)
}

export function buildPlain(command, payload = new Uint8Array(), mac) {
  const data = asBytes(payload)
  return concat(Uint8Array.from([0xDB, data.length + 1, command & 0xFF]), xorMac(data, mac))
}

export async function buildUserInfo({ token, mac, key, age, male, heightCm, weightTenthKg, resistance = 0xFFFF }) {
  if (!Number.isInteger(age) || age < 10 || age > 127) throw new Error('Age must be 10..127')
  if (!Number.isInteger(heightCm) || heightCm < 80 || heightCm > 250) throw new Error('Height must be 80..250 cm')
  if (!Number.isInteger(weightTenthKg) || weightTenthKg < 10 || weightTenthKg > 3000) throw new Error('Reference weight is out of range')
  const logical = new Uint8Array(14), view = new DataView(logical.buffer)
  logical.set(asBytes(token), 0)
  logical[7] = age | (male ? 0 : 0x80)
  logical[8] = heightCm
  logical[9] = 0
  view.setUint16(10, weightTenthKg, true)
  view.setUint16(12, resistance, true)
  const cipher = await aesCtr(pkcs7Pad(xorMac(logical, mac)), key)
  return concat(Uint8Array.from([0xDC, 0x0E, CMD_USER_INFO]), cipher)
}

export function normalizeFrame(value) {
  const raw = asBytes(value)
  if (raw.length < 3) return null
  const expected = raw[0] === 0xBD ? raw[1] + 3 : raw[0] === 0xBC ? raw[1] + 2 : raw.length
  if (raw.length < expected) return null
  return raw.slice(0, expected)
}

export function decodePlainNotification(frameValue, mac) {
  const frame = normalizeFrame(frameValue)
  if (!frame || frame.length < 4 || frame[0] !== 0xBD) throw new Error('Not a plain scale notification')
  const tail = frame.slice(3)
  const decoded = frame[1] === 1 ? tail : xorMac(tail, mac)
  if (!decoded.length) throw new Error('Notification has no checksum')
  const data = decoded.slice(0, -1), checksum = decoded[decoded.length - 1]
  const expected = frame[1] ^ frame[2] ^ xorChecksum(data)
  return { opcode: frame[2], data, checksum, checksumOk: checksum === expected }
}

export async function decodeMeasurementPair(firstValue, secondValue, key, mac) {
  const first = normalizeFrame(firstValue), second = normalizeFrame(secondValue)
  if (!first || !second || first.length < 19 || second.length < 19) throw new Error('Incomplete encrypted measurement pair')
  if (first[0] !== 0xBC || second[0] !== 0xBC || first[2] !== NTFY_MEASUREMENT || second[2] !== NTFY_MEASUREMENT2) {
    throw new Error('Mismatched encrypted measurement pair')
  }
  const firstPart = pkcs7Unpad(await aesCtr(first.slice(3), key))
  const secondPart = pkcs7Unpad(await aesCtr(second.slice(3), key))
  const payload = xorMac(concat(firstPart, secondPart), mac)
  if (payload.length !== first[1] || payload.length !== 17) throw new Error('Invalid decoded measurement length')
  const data = payload.slice(0, -1), checksum = payload[payload.length - 1]
  const expected = first[1] ^ first[2] ^ xorChecksum(data)
  if (checksum !== expected) throw new Error('Invalid measurement checksum')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const year = view.getUint16(5, true), month = data[7], day = data[8]
  const hour = data[9], minute = data[10], secondOfMinute = data[11]
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || secondOfMinute > 59) {
    throw new Error('Invalid measurement timestamp')
  }
  const measuredAt = new Date(year, month - 1, day, hour, minute, secondOfMinute)
  if (measuredAt.getFullYear() !== year || measuredAt.getMonth() !== month - 1 || measuredAt.getDate() !== day ||
      measuredAt.getHours() !== hour || measuredAt.getMinutes() !== minute || measuredAt.getSeconds() !== secondOfMinute) {
    throw new Error('Invalid measurement timestamp')
  }
  const weightKg = view.getUint16(1, true) / 10
  const fatRaw = view.getUint16(3, true) / 10
  const resistanceRaw = view.getUint16(13, true)
  if (weightKg < 1 || weightKg > 300 || fatRaw < 0 || fatRaw > 100) throw new Error('Measurement is outside valid ranges')
  const resistanceOhm = resistanceRaw > 0 && resistanceRaw < 4000 ? resistanceRaw : null
  const fatPct = fatRaw > 0 && resistanceOhm !== null ? fatRaw : null
  return {
    profileUid: data[0], weightKg, fatPct, resistanceOhm, measuredAt,
    weekday: data[12], flag: data[15], checksum, checksumOk: true,
    suspectedData: data[15] === 0xAA, rawPayload: payload,
  }
}

export function toProfileWeight(weightKg, unit) {
  const value = unit === 'lb' ? weightKg / 0.45359237 : weightKg
  return Math.round(value * 10) / 10
}

const scaleConfigKey = userId => `opengym_huawei_scale_v1:${String(userId || 'guest')}`

function normalizedScaleConfig(config) {
  const mac = formatMac(parseMac(config?.mac))
  const token = bytesToHex(hexToBytes(config?.token, 7))
  const age = Number(config?.age), heightCm = Number(config?.heightCm)
  if (!Number.isInteger(age) || age < 10 || age > 127) throw new Error('Invalid scale profile age')
  if (!Number.isInteger(heightCm) || heightCm < 80 || heightCm > 250) throw new Error('Invalid scale profile height')
  if (typeof config?.male !== 'boolean') throw new Error('Invalid scale profile sex')
  return { mac, token, age, heightCm, male: config.male }
}

export function loadHuaweiScaleConfig(userId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(scaleConfigKey(userId))
    return raw ? normalizedScaleConfig(JSON.parse(raw)) : null
  } catch { return null }
}

export function saveHuaweiScaleConfig(userId, config, storage = globalThis.localStorage) {
  const normalized = normalizedScaleConfig(config)
  storage?.setItem(scaleConfigKey(userId), JSON.stringify(normalized))
  return normalized
}

export function deleteHuaweiScaleConfig(userId, storage = globalThis.localStorage) {
  storage?.removeItem(scaleConfigKey(userId))
}

export const huaweiScaleSupported = () => !!(
  typeof window !== 'undefined' && window.isSecureContext &&
  typeof navigator !== 'undefined' && navigator.bluetooth && globalThis.crypto?.subtle
)

const statusError = code => Object.assign(new Error(code), { code })

/** One explicitly user-started Web Bluetooth session. It never binds without bind(). */
export class HuaweiScaleSession {
  constructor(config, callbacks = {}) {
    this.config = config
    this.callbacks = callbacks
    this.mac = parseMac(config.mac)
    this.token = typeof config.token === 'string' ? hexToBytes(config.token, 7) : asBytes(config.token)
    this.key = deriveMagicKey(this.token, this.mac)
    this.device = null
    this.tx = null
    this.rx = null
    this.pendingFirst = null
    this.authorized = false
    this.authPending = false
    this.initializing = false
    this.closed = false
    this.failed = false
    this.completed = false
    this.writeQueue = Promise.resolve()
    this.phaseTimer = null
    this.onNotification = event => {
      if (!this.terminal) this.handleNotification(event).catch(error => this.fail(error))
    }
    this.onDisconnected = () => {
      if (this.terminal) return
      this.callbacks.onStatus?.('disconnected')
      this.closed = true
      this.clearPhaseTimeout()
      this.cleanup(false).catch(() => {})
    }
  }

  get terminal() { return this.closed || this.failed || this.completed }
  status(name, detail) { if (!this.closed) this.callbacks.onStatus?.(name, detail) }
  clearPhaseTimeout() { clearTimeout(this.phaseTimer); this.phaseTimer = null }
  armPhaseTimeout(ms, code) {
    this.clearPhaseTimeout()
    this.phaseTimer = setTimeout(() => this.fail(statusError(code)), ms)
  }
  async within(promise, ms, code) {
    let timer
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(statusError(code)), ms) }),
      ])
    } finally { clearTimeout(timer) }
  }
  fail(error) {
    if (this.terminal) return
    this.failed = true
    this.clearPhaseTimeout()
    this.callbacks.onError?.(error)
    this.callbacks.onStatus?.('error', error)
    this.cleanup(true).catch(() => {})
  }

  async connect() {
    if (!huaweiScaleSupported()) throw statusError('bluetooth-unsupported')
    this.status('requesting')
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [SERVICE_UUID] },
        { namePrefix: 'AH100' }, { namePrefix: 'CH100' }, { namePrefix: 'CH18' },
        { namePrefix: 'HUAWEI' }, { namePrefix: 'Huawei' },
      ],
      optionalServices: [SERVICE_UUID],
    })
    if (/CH100S/i.test(this.device.name || '')) throw statusError('unsupported-scale-model')
    this.device.addEventListener('gattserverdisconnected', this.onDisconnected)
    this.status('connecting', this.device.name || 'Huawei AH100')
    const server = await this.within(this.device.gatt.connect(), 15000, 'connection-timeout')
    const service = await this.within(server.getPrimaryService(SERVICE_UUID), 8000, 'connection-timeout')
    ;[this.tx, this.rx] = await this.within(Promise.all([
      service.getCharacteristic(WRITE_UUID),
      service.getCharacteristic(NOTIFY_UUID),
    ]), 8000, 'connection-timeout')
    this.rx.addEventListener('characteristicvaluechanged', this.onNotification)
    await this.within(this.rx.startNotifications(), 8000, 'connection-timeout')
    await delay(60)
    await this.authenticate()
  }

  write(frame) {
    this.writeQueue = this.writeQueue.then(async () => {
      if (!this.tx || !this.device?.gatt?.connected || this.failed || this.closed) throw statusError('scale-disconnected')
      if (typeof this.tx.writeValueWithResponse === 'function') await this.tx.writeValueWithResponse(frame)
      else await this.tx.writeValue(frame)
    })
    return this.writeQueue
  }

  sendPlain(command, payload = new Uint8Array()) { return this.write(buildPlain(command, payload, this.mac)) }

  async authenticate() {
    if (this.terminal || this.authPending || this.authorized) return
    this.authPending = true
    this.status('authenticating')
    this.armPhaseTimeout(10000, 'authentication-timeout')
    await this.sendPlain(CMD_AUTH, this.token)
  }

  async bind() {
    if (this.terminal || !this.tx || !this.device?.gatt?.connected) throw statusError('scale-disconnected')
    this.status('binding')
    this.authPending = false
    this.armPhaseTimeout(10000, 'binding-timeout')
    await this.sendPlain(CMD_BIND, this.token)
  }

  async sendUserInfo() {
    const userInfo = await buildUserInfo({
      token: this.token, mac: this.mac, key: this.key,
      age: this.config.age, male: this.config.male, heightCm: this.config.heightCm,
      weightTenthKg: Math.round(this.config.referenceWeightKg * 10),
    })
    await this.write(userInfo)
  }

  async initialize() {
    if (this.terminal || this.initializing) return
    this.initializing = true
    this.clearPhaseTimeout()
    try {
      this.status('configuring')
      await this.sendPlain(CMD_SET_UNIT, Uint8Array.of(1))
      await delay(80)
      const now = new Date()
      const clock = new Uint8Array(8), view = new DataView(clock.buffer)
      view.setUint16(0, now.getFullYear(), true)
      clock.set([now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), ((now.getDay() + 6) % 7) + 1], 2)
      await this.sendPlain(CMD_SET_TIME, clock)
      await delay(80)
      await this.sendUserInfo()
      if (!this.terminal) {
        this.status('waiting')
        this.armPhaseTimeout(90000, 'measurement-timeout')
      }
    } finally { this.initializing = false }
  }

  async handleNotification(event) {
    if (this.terminal) return
    const view = event?.target?.value
    if (!view) return
    const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    const frame = normalizeFrame(raw)
    if (!frame) return
    const opcode = frame[2]

    if (frame[0] === 0xBD) {
      const note = decodePlainNotification(frame, this.mac)
      if (!note.checksumOk) return
      if (opcode === NTFY_WAKE && !this.authorized) { this.authPending = false; await this.authenticate(); return }
      if (opcode === NTFY_AUTH) {
        this.clearPhaseTimeout()
        this.authPending = false
        if (note.data[0] === 1) {
          this.authorized = true
          await this.initialize()
        } else {
          this.status('bind-required')
          this.callbacks.onBindRequired?.()
        }
        return
      }
      if (opcode === NTFY_BIND) { this.clearPhaseTimeout(); this.authPending = false; await this.authenticate(); return }
      if (opcode === NTFY_LIST_UPDATE && this.authorized && !this.initializing) { await this.sendUserInfo(); return }
      if (opcode === NTFY_SLEEP) { this.status('sleeping'); return }
      if (opcode === NTFY_LOW_POWER) { this.status('low-battery'); return }
      if (opcode === NTFY_OVERLOAD) throw statusError('scale-overload')
      if (opcode === NTFY_MEASUREMENT_ERROR) throw statusError('measurement-error')
      return
    }

    if (frame[0] === 0xBC && opcode === NTFY_MEASUREMENT) {
      this.pendingFirst = frame
      return
    }
    if (frame[0] === 0xBC && opcode === NTFY_MEASUREMENT2) {
      if (!this.pendingFirst || !this.authorized) return
      const first = this.pendingFirst
      this.pendingFirst = null
      const measurement = await decodeMeasurementPair(first, frame, this.key, this.mac)
      if (measurement.suspectedData) throw statusError('suspected-measurement')
      this.clearPhaseTimeout()
      try { await this.sendPlain(CMD_FAT_ACK, Uint8Array.of(0)) } catch { /* reading is still valid */ }
      this.completed = true
      this.callbacks.onStatus?.('received', measurement)
      this.callbacks.onMeasurement?.(measurement)
    }
  }

  async cleanup(disconnect = true) {
    this.clearPhaseTimeout()
    this.pendingFirst = null
    if (this.rx) {
      this.rx.removeEventListener('characteristicvaluechanged', this.onNotification)
      try { await this.rx.stopNotifications() } catch { /* already gone */ }
    }
    if (this.device) this.device.removeEventListener('gattserverdisconnected', this.onDisconnected)
    if (disconnect && this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.tx = this.rx = null
  }

  async disconnect() {
    if (this.closed) return
    this.closed = true
    await this.cleanup(true)
  }
}
