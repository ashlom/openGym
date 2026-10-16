import { describe, expect, it } from 'vitest'
import { EXDB, EXIDX } from './exercises.js'
import { movementOf, isCompound, skillOf, smartSwaps, swapScore, swapConfig } from './swaps.js'

const byName = n => EXDB.find(e => e.n === n)

describe('movementOf', () => {
  it('reads the movement and bench angle off the name', () => {
    expect(movementOf({ n: 'lever chest press' })).toEqual({ pattern: 'press', angle: 'flat' })
    expect(movementOf({ n: 'dumbbell incline bench press' })).toEqual({ pattern: 'press', angle: 'incline' })
    expect(movementOf({ n: 'cable seated row' }).pattern).toBe('row')
    expect(movementOf({ n: 'barbell upright row' }).pattern).toBe('upright')
    expect(movementOf({ n: 'lever lying leg curl' }).pattern).toBe('legcurl')
    expect(movementOf({ n: 'dumbbell hammer curl' }).pattern).toBe('curl')
    expect(movementOf({ n: 'dumbbell rear delt reverse fly' }).pattern).toBe('reardelt')
    expect(movementOf({ n: 'smith shoulder press' }).pattern).toBe('ohpress')
    expect(movementOf({ n: 'something unheard of' }).pattern).toBe('other')
  })
  it('classes multi-joint patterns as compound', () => {
    expect(isCompound({ n: 'barbell bench press' })).toBe(true)
    expect(isCompound({ n: 'cable fly' })).toBe(false)
  })
})

describe('skillOf', () => {
  it('rates guided equipment as low skill and balance work as high', () => {
    expect(skillOf({ eq: 'leverage machine' })).toBe('low')
    expect(skillOf({ eq: 'dumbbell' })).toBe('medium')
    expect(skillOf({ eq: 'stability ball' })).toBe('high')
  })
})

describe('smartSwaps', () => {
  it('suggests other chest presses first for a machine chest press', () => {
    const base = EXIDX['0577'] // lever chest press
    const top = smartSwaps(base, EXDB, { limit: 8 })
    expect(top.length).toBe(8)
    for (const { ex } of top.slice(0, 5)) {
      expect(ex.tg).toBe('pectorals')
      expect(movementOf(ex).pattern).toBe('press')
    }
  })
  it('never suggests the exercise itself, duplicates by name, or excluded ids', () => {
    const base = EXIDX['0577']
    const other = EXIDX['0576'] // the second "lever chest press" in the catalogue
    const top = smartSwaps(base, EXDB, { limit: 40, exclude: ['1299'] })
    const ids = top.map(x => x.ex.id)
    expect(ids).not.toContain('0577')
    expect(ids).not.toContain(other.id)
    expect(ids).not.toContain('1299')
    const names = top.map(x => x.ex.n.replace(/\s+v\.\s*\d+$/, ''))
    expect(new Set(names).size).toBe(names.length)
  })
  it('keeps rows with rows', () => {
    const base = byName('lever seated row')
    const top = smartSwaps(base, EXDB, { limit: 5 })
    for (const { ex } of top) expect(movementOf(ex).pattern).toBe('row')
  })
  it('only swaps cardio for cardio', () => {
    const base = EXDB.find(e => e.bp === 'cardio')
    expect(smartSwaps(base, EXDB, { limit: 50 }).every(x => x.ex.bp === 'cardio')).toBe(true)
    expect(swapScore(EXIDX['0577'], base)).toBeNull()
  })
  it('nudges exercises you already use up the list', () => {
    const base = EXIDX['0577']
    const plain = smartSwaps(base, EXDB, { limit: 30 })
    const pick = plain[plain.length - 1].ex.id
    const nudged = smartSwaps(base, EXDB, { limit: 30, usage: { [pick]: 3 } })
    expect(nudged.findIndex(x => x.ex.id === pick)).toBeLessThan(plain.length - 1)
  })
})

describe('swapConfig', () => {
  it('keeps the amount of work and drops what described the old exercise', () => {
    const old = { id: '0577', sets: 4, reps: 8, weight: 60, inc: 5, prog: 'double', repsMin: 6, warm: 2, note: 'seat on 4', side: true }
    const cfg = swapConfig(old, '1299')
    expect(cfg).toMatchObject({ sets: 4, reps: 8, mode: 'reps', prog: 'double', repsMin: 6, warm: 2, weight: 0 })
    expect(cfg.inc).toBeUndefined()
    expect(cfg.note).toBeUndefined()
    expect(cfg.side).toBeUndefined()
  })
  it('takes the new exercise’s own bodyweight flag', () => {
    const pushup = EXDB.find(e => e.eq === 'body weight' && movementOf(e).pattern === 'press')
    expect(swapConfig({ sets: 3, reps: 10, weight: 50 }, pushup.id).bodyweight).toBe(true)
  })
  it('becomes a cardio config when swapped to cardio', () => {
    const run = EXDB.find(e => e.bp === 'cardio')
    expect(swapConfig({ sets: 3, reps: 10 }, run.id)).toEqual({ sets: 1, min: 20, speed: 8 })
  })
})
