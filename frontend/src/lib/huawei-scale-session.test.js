import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HuaweiScaleSession, SERVICE_UUID, WRITE_UUID, NOTIFY_UUID,
  parseMac, xorChecksum, xorMac,
} from './huawei-scale.js'

const config = {
  mac: 'AA:BB:CC:DD:EE:FF', token: '0123456789AB00', age: 38,
  heightCm: 177, male: true, referenceWeightKg: 82,
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function notification(opcode, data = []) {
  const mac = parseMac(config.mac)
  const ll = data.length + 1
  const checksum = ll ^ opcode ^ xorChecksum(Uint8Array.from(data))
  const decoded = Uint8Array.from([...data, checksum])
  const tail = ll === 1 ? decoded : xorMac(decoded, mac)
  const frame = Uint8Array.from([0xBD, ll, opcode, ...tail])
  return { target: { value: new DataView(frame.buffer) } }
}

function fakeBluetooth() {
  const writes = []
  const characteristicListeners = new Set()
  const disconnectListeners = new Set()
  const tx = {
    writeValueWithResponse: async frame => { writes.push(Uint8Array.from(frame)) },
  }
  const rx = {
    addEventListener: (type, listener) => { if (type === 'characteristicvaluechanged') characteristicListeners.add(listener) },
    removeEventListener: (_, listener) => characteristicListeners.delete(listener),
    startNotifications: async () => rx,
    stopNotifications: async () => rx,
  }
  const service = {
    getCharacteristic: async uuid => uuid === WRITE_UUID ? tx : uuid === NOTIFY_UUID ? rx : Promise.reject(new Error('wrong characteristic')),
  }
  const server = { getPrimaryService: async uuid => uuid === SERVICE_UUID ? service : Promise.reject(new Error('wrong service')) }
  const gatt = {
    connected: false,
    connect: async () => { gatt.connected = true; return server },
    disconnect: () => { gatt.connected = false; disconnectListeners.forEach(listener => listener()) },
  }
  const device = {
    name: 'HUAWEI Body Fat Scale', gatt,
    addEventListener: (type, listener) => { if (type === 'gattserverdisconnected') disconnectListeners.add(listener) },
    removeEventListener: (_, listener) => disconnectListeners.delete(listener),
  }
  let requestOptions
  const bluetooth = {
    requestDevice: async options => { requestOptions = options; return device },
  }
  return { bluetooth, writes, device, rx, requestOptions: () => requestOptions }
}

let fake
beforeEach(() => {
  fake = fakeBluetooth()
  Object.defineProperty(globalThis, 'window', { value: { isSecureContext: true }, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: fake.bluetooth }, configurable: true })
})
afterEach(() => {
  delete globalThis.window
  delete globalThis.navigator
  vi.restoreAllMocks()
})

describe('HuaweiScaleSession', () => {
  it('filters the Bluetooth chooser and starts with AUTH, never BIND', async () => {
    const statuses = []
    const session = new HuaweiScaleSession(config, { onStatus: status => statuses.push(status) })
    await session.connect()

    const options = fake.requestOptions()
    expect(options.acceptAllDevices).toBeUndefined()
    expect(options.optionalServices).toEqual([SERVICE_UUID])
    expect(options.filters.some(filter => filter.services?.includes(SERVICE_UUID))).toBe(true)
    expect(fake.writes).toHaveLength(1)
    expect(Array.from(fake.writes[0].slice(0, 3))).toEqual([0xDB, 0x08, 0x24])
    expect(statuses).toEqual(['requesting', 'connecting', 'authenticating'])
    await session.disconnect()
  })

  it('requires an explicit bind after AUTH failure, then authenticates again', async () => {
    let bindRequired = 0
    const session = new HuaweiScaleSession(config, { onBindRequired: () => bindRequired++ })
    await session.connect()
    await session.handleNotification(notification(0x26, [0]))
    expect(bindRequired).toBe(1)
    expect(fake.writes).toHaveLength(1)

    await session.bind()
    expect(Array.from(fake.writes[1].slice(0, 3))).toEqual([0xDB, 0x08, 0x25])
    await session.handleNotification(notification(0x27, [1]))
    expect(Array.from(fake.writes[2].slice(0, 3))).toEqual([0xDB, 0x08, 0x24])
    await session.disconnect()
  })

  it('turns an error into one terminal cleanup and ignores later notifications', async () => {
    const errors = [], statuses = []
    const session = new HuaweiScaleSession(config, {
      onError: error => errors.push(error.code),
      onStatus: status => statuses.push(status),
    })
    await session.connect()
    const overload = Object.assign(new Error('overload'), { code: 'scale-overload' })
    session.fail(overload)
    session.fail(overload)
    await settle()

    expect(errors).toEqual(['scale-overload'])
    expect(statuses.at(-1)).toBe('error')
    expect(fake.device.gatt.connected).toBe(false)
    const writesAfterFailure = fake.writes.length
    await session.handleNotification(notification(0x00))
    expect(fake.writes).toHaveLength(writesAfterFailure)
  })
})
