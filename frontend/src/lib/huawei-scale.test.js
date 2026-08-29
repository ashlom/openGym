import { describe, expect, it } from 'vitest'
import {
  aesCtr,
  buildPlain,
  buildUserInfo,
  decodeMeasurementPair,
  deriveMagicKey,
  formatMac,
  makeToken,
  normalizeFrame,
  parseMac,
  pkcs7Pad,
  loadHuaweiScaleConfig,
  saveHuaweiScaleConfig,
  deleteHuaweiScaleConfig,
  toProfileWeight,
  xorChecksum,
  xorMac,
} from './huawei-scale.js'

const hex = s => Uint8Array.from(s.trim().split(/\s+/), x => parseInt(x, 16))
const bytes = a => Array.from(a)

describe('Huawei AH100 wire primitives', () => {
  it('parses and formats a Bluetooth MAC without accepting partial values', () => {
    expect(bytes(parseMac('5c:ca:d3:08:7b:4f'))).toEqual(bytes(hex('5C CA D3 08 7B 4F')))
    expect(formatMac(parseMac('5C-CA-D3-08-7B-4F'))).toBe('5C:CA:D3:08:7B:4F')
    expect(() => parseMac('5C:CA:D3')).toThrow(/MAC/i)
    expect(() => parseMac('5C:CA:D3:08:7B:GG')).toThrow(/MAC/i)
  })

  it('creates the documented token, session key and AUTH frame', () => {
    const mac = parseMac('5C:CA:D3:08:7B:4F')
    const token = makeToken(1, hex('11 22 33 44 55'))
    expect(bytes(token)).toEqual(bytes(hex('11 22 33 44 55 10 01')))
    expect(xorChecksum(token)).toBe(0)
    expect(bytes(deriveMagicKey(token, mac))).toEqual(bytes(hex('4D E8 E0 4C 2E 5F 5D 2A 98 0F DE 34 56 73 21 56')))
    expect(bytes(buildPlain(0x24, token, mac))).toEqual(bytes(hex('DB 08 24 4D E8 E0 4C 2E 5F 5D')))
  })

  it('round-trips MAC XOR and trims padded notifications to their declared frame', () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const data = hex('01 02 03 04 05 06 07 08')
    expect(bytes(xorMac(xorMac(data, mac), mac))).toEqual(bytes(data))
    expect(bytes(normalizeFrame(hex('BD 01 00 01 DE AD')))).toEqual(bytes(hex('BD 01 00 01')))
    expect(normalizeFrame(hex('BC 11 0E 00'))).toBeNull()
  })
})

describe('Huawei AH100 encrypted data', () => {
  it('builds a 19-byte USER_INFO frame with its documented header', async () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const token = makeToken(0, hex('01 23 45 67 89'))
    const key = deriveMagicKey(token, mac)
    const frame = await buildUserInfo({ token, mac, key, age: 30, male: true, heightCm: 180, weightTenthKg: 800 })
    expect(bytes(frame.slice(0, 3))).toEqual([0xDC, 0x0E, 0x09])
    expect(frame).toHaveLength(19)
    expect(bytes(frame)).toEqual(bytes(hex('DC 0E 09 14 40 9A B4 83 60 41 8B 98 4D 29 67 A9 AA F9 5F')))
  })

  it('decodes a complete encrypted measurement and verifies its checksum', async () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const token = makeToken(0, hex('01 23 45 67 89'))
    const key = deriveMagicKey(token, mac)
    const data = new Uint8Array(16)
    const view = new DataView(data.buffer)
    data[0] = 0
    view.setUint16(1, 823, true)
    view.setUint16(3, 215, true)
    view.setUint16(5, 2026, true)
    data.set([8, 25, 6, 30, 0, 2], 7)
    view.setUint16(13, 420, true)
    data[15] = 0
    const ll = 17
    const checksum = ll ^ 0x0E ^ xorChecksum(data)
    const payload = Uint8Array.from([...data, checksum])
    const obfuscated = xorMac(payload, mac)
    const firstCipher = await aesCtr(pkcs7Pad(obfuscated.slice(0, 15)), key)
    const secondCipher = await aesCtr(pkcs7Pad(obfuscated.slice(15)), key)
    const first = Uint8Array.from([0xBC, ll, 0x0E, ...firstCipher])
    const second = Uint8Array.from([0xBC, ll, 0x8E, ...secondCipher])

    const result = await decodeMeasurementPair(first, second, key, mac)
    expect(result).toMatchObject({
      profileUid: 0,
      weightKg: 82.3,
      fatPct: 21.5,
      resistanceOhm: 420,
      checksumOk: true,
      suspectedData: false,
    })
    expect(result.measuredAt.getFullYear()).toBe(2026)
    expect(result.measuredAt.getMonth()).toBe(7)
    expect(result.measuredAt.getDate()).toBe(25)
  })

  it('rejects a measurement whose checksum was corrupted before encryption', async () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const token = makeToken(0, hex('01 23 45 67 89'))
    const key = deriveMagicKey(token, mac)
    const payload = new Uint8Array(17)
    payload.set([0, 0x37, 0x03, 0xC8, 0, 0xEA, 0x07, 8, 25, 6, 30, 0, 2, 0xA4, 1, 0, 0xFF])
    const obfuscated = xorMac(payload, mac)
    const first = Uint8Array.from([0xBC, 17, 0x0E, ...await aesCtr(pkcs7Pad(obfuscated.slice(0, 15)), key)])
    const second = Uint8Array.from([0xBC, 17, 0x8E, ...await aesCtr(pkcs7Pad(obfuscated.slice(15)), key)])
    await expect(decodeMeasurementPair(first, second, key, mac)).rejects.toThrow(/checksum/i)
  })
  it('keeps weight but marks missing body-composition values as unavailable', async () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const token = makeToken(0, hex('01 23 45 67 89'))
    const key = deriveMagicKey(token, mac)
    const data = new Uint8Array(16), view = new DataView(data.buffer)
    view.setUint16(1, 705, true)
    view.setUint16(3, 0, true)
    view.setUint16(5, 2026, true)
    data.set([8, 25, 6, 30, 0, 2], 7)
    view.setUint16(13, 0xFFFF, true)
    const payload = Uint8Array.from([...data, 17 ^ 0x0E ^ xorChecksum(data)])
    const obfuscated = xorMac(payload, mac)
    const first = Uint8Array.from([0xBC, 17, 0x0E, ...await aesCtr(pkcs7Pad(obfuscated.slice(0, 15)), key)])
    const second = Uint8Array.from([0xBC, 17, 0x8E, ...await aesCtr(pkcs7Pad(obfuscated.slice(15)), key)])
    const result = await decodeMeasurementPair(first, second, key, mac)
    expect(result).toMatchObject({ weightKg: 70.5, fatPct: null, resistanceOhm: null })
  })

  it('rejects calendar dates JavaScript would otherwise normalize silently', async () => {
    const mac = parseMac('AA:BB:CC:DD:EE:FF')
    const token = makeToken(0, hex('01 23 45 67 89'))
    const key = deriveMagicKey(token, mac)
    const data = new Uint8Array(16), view = new DataView(data.buffer)
    view.setUint16(1, 705, true)
    view.setUint16(5, 2026, true)
    data.set([2, 31, 6, 30, 0, 2], 7)
    const payload = Uint8Array.from([...data, 17 ^ 0x0E ^ xorChecksum(data)])
    const obfuscated = xorMac(payload, mac)
    const first = Uint8Array.from([0xBC, 17, 0x0E, ...await aesCtr(pkcs7Pad(obfuscated.slice(0, 15)), key)])
    const second = Uint8Array.from([0xBC, 17, 0x8E, ...await aesCtr(pkcs7Pad(obfuscated.slice(15)), key)])
    await expect(decodeMeasurementPair(first, second, key, mac)).rejects.toThrow(/timestamp/i)
  })
})

describe('local scale configuration', () => {
  it('keeps the device token outside the synced gym profile and validates it on load', () => {
    const values = new Map()
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
    const config = {
      mac: '5c-ca-d3-08-7b-4f', token: '11223344551001', age: 38,
      heightCm: 177, male: true,
    }
    saveHuaweiScaleConfig('rafa-profile', config, storage)
    expect(loadHuaweiScaleConfig('rafa-profile', storage)).toEqual({ ...config, mac: '5C:CA:D3:08:7B:4F' })
    expect(loadHuaweiScaleConfig('other-profile', storage)).toBeNull()
    deleteHuaweiScaleConfig('rafa-profile', { removeItem: key => values.delete(key) })
    expect(loadHuaweiScaleConfig('rafa-profile', storage)).toBeNull()
    values.set('opengym_huawei_scale_v1:rafa-profile', '{"mac":"bad"}')
    expect(loadHuaweiScaleConfig('rafa-profile', storage)).toBeNull()
  })
})

describe('profile unit conversion', () => {
  it('keeps kg and converts to lb before storing in a pound profile', () => {
    expect(toProfileWeight(82.34, 'kg')).toBe(82.3)
    expect(toProfileWeight(82.34, 'lb')).toBe(181.5)
  })
})
