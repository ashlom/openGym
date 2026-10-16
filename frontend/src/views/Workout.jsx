import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, lastEntryFor, bestWeightFor, buildSets, setsDoneActive, supersetUnits, unitOf, setLabel, modeOf, isBw, isPerSide, sideReps, repStep, EFFORT, effortOf, stepEffort, capEffort, cleanupSg } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep, vibrate } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import Media, { Thumb } from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, finishWorkout, workoutCompleteSheet, confirmSheet, swapSheet, noteSheet, exerciseHistorySheet, initialWarmups, warmLabel } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Check, NumberField, Row } from '../components/ui.jsx'
import { swapConfig } from '../lib/swaps.js'
import { nextWarmup, warmupSets } from '../lib/warmup.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'
import { restAfterSet } from '../lib/workout-rest.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div></div>
    {todayR && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <h2 className="accent">{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div><div className="big">{todayR.name}</div><div className="muted small">{exCount(todayR.ex.length)}</div></div>
        <span className="lrow-i" style={{ width: 38, height: 38, borderRadius: 9, fontSize: 22 }}><Icon name={glyphOf(todayR.emoji)} /></span>
      </div>
      <Button variant="primary" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </div>}
    {others.length > 0 && <><h4 className="sec">{t('Other routines')}</h4>
      <div className="list">{others.map(r => <div key={r.id} className="item" onClick={() => startFlow(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <span className="tag acc">{t('Start')}</span></div>)}</div></>}
    <div style={{ height: 14 }} />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div style={{ height: 10 }} /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- one exercise block (reps: weight×reps · time: a held duration · cardio: duration+speed) ---------- */
function ExerciseBlock({ entryIdx, compact, onToggle, onField, onAddSet, onRemoveSet, onStartTimed, onWarmToggle, onWarmField, onSetTap, onMenu, onNote, onAddWarm }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastEntryFor(S, entry.id)
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = cardio ? 0 : Math.max(bestWeightFor(S, entry.id), (S.exWeights[entry.id] || {}).w || 0)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // stepper instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit) }
  // The reps column is the total in every mode, unilateral included — the stepper walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, hd: t('Speed (km/h)') }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third stepper to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, hd: t(eff.hd) } : null
  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  // `put(field, value)` writes into whichever list the row belongs to — working sets or
  // warm-ups — so both kinds of row share one stepper.
  const bump = (s, col, dir, put) => {
    if (col.eff) return put(col.f, stepEffort(col.eff, s[col.f], dir))
    put(col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  // Uses the shared stepper markup so a set row picks up the same control styling
  // as every other +/- field in the app.
  const cell = (s, i, col, cls, put = (f, v) => onField(i, f, v)) => (
    <div className={'stp ' + cls}>
      <button aria-label="Decrease" onClick={() => bump(s, col, -1, put)}><Icon name="minus" /></button>
      {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
      <span className="val"><NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
        onChange={v => put(col.f, col.eff ? capEffort(col.eff, v) : v)} /></span>
      <button aria-label="Increase" onClick={() => bump(s, col, 1, put)}><Icon name="plus" /></button>
    </div>
  )
  const warm = mode === 'reps' ? (entry.warm || []) : []
  const planNote = entry.target && entry.target.note
  return <>
    <Media ex={ex} key={entry.id} compact={compact} minimizable />
    <div className="row between" style={{ marginBottom: 6 }}>
      <div style={{ fontSize: compact ? 17 : 20, fontWeight: 600, letterSpacing: '-.02em', textTransform: 'capitalize', lineHeight: 1.2 }}>{ex.n}</div>
      <div className="row" style={{ gap: 6, flex: 'none' }}>
        <button className="iconbtn" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}><Icon name="info" /></button>
        <button className="iconbtn" aria-label={t('More')} onClick={onMenu}><Icon name="ellipsis" /></button>
      </div>
    </div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {cardio && <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>}
      {/* You log the total; this is the split, so the set in front of you is unambiguous
          without the rep count having to mean two different things (issue #31). */}
      {!cardio && !timed && isPerSide(cfg) && <span className="tag acc nocap"><Icon name="shuffle" />{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
      {(ex.tg || ex.bp) && <span className="tag">{t(ex.tg || ex.bp)}</span>}
      {ex.eq && <span className="tag">{t(ex.eq)}</span>}
      {best > 0 && <span className="tag nocap">{t('Best:')} {fmtNum(best)} {S.unit}</span>}
    </div>
    {/* the routine's standing note for this exercise, then what you wrote about it today */}
    {planNote && <div className="note-line plan"><Icon name="clipboard" />{planNote}</div>}
    {entry.note && <button className="note-line mine" onClick={onNote}><Icon name="note" />{entry.note}</button>}
    {last && <div className="small dim" style={{ marginBottom: 4 }}>{t('Last time')} ({fmtDate(last.d)}): {last.sets.map(s => setLabel(entry.id, s, last.target)).join(', ')}</div>}
    {last && last.note && last.note !== entry.note && <div className="note-line small dim"><Icon name="history" />{last.note}</div>}
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : '')}>
      <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />
      <span>{t(...plan.why)}</span>
    </div>}
    <div className="card" style={{ marginTop: 10, marginBottom: 0 }}>
      {/* the header carries the same eff3 sizing as the rows, or the labels drift off their columns */}
      <div className={'sethead' + (col3 ? ' eff3' : '')}><span className="n-sp" /><span className="w-sp">{col1.hd}</span>{col2 && <span className="r-sp">{col2.hd}</span>}{col3 && <span className="eff-sp">{col3.hd}</span>}{timed && <span className="ck-sp" />}<span className="ck-sp" /></div>
      {/* Warm-ups sit above the work, labelled W1, W2… — same steppers, no effort rating,
          and kept in their own list so nothing that measures the session counts them. */}
      {/* where W1 would go: one tap to ramp up, offered until the exercise is under way */}
      {mode === 'reps' && !warm.length && !entry.sets.some(s => s.done) && <button className="warm-add" onClick={onAddWarm}><Icon name="flame" />{t('Add warm-up set')}</button>}
      {warm.map((s, i) => <div key={'w' + i} className="setgrp">
        <div className={'setrow warm' + (s.done ? ' done' : '') + (col3 ? ' eff3' : '')}>
          <button className={'n' + (s.note ? ' noted' : '')} aria-label={t('Warm-up set options')} onClick={() => onSetTap('warm', i)}>{warmLabel(i)}</button>
          {cell(s, i, col1, 'w', (f, v) => onWarmField(i, f, v))}
          {col2 && cell(s, i, col2, 'r', (f, v) => onWarmField(i, f, v))}
          {col3 && <span className="stp eff spacer" />}
          <Check checked={s.done} onChange={() => onWarmToggle(i)} />
        </div>
        {s.note && <div className="set-note">{s.note}</div>}
      </div>)}
      {entry.sets.map((s, i) => <div key={i} className="setgrp">
        <div className={'setrow' + (s.done ? ' done' : '') + (col3 ? ' eff3' : '')}>
          {/* the set number opens that set's note (and removal) */}
          <button className={'n' + (s.note ? ' noted' : '')} aria-label={t('Set options')} onClick={() => onSetTap('set', i)}>{i + 1}</button>
          {cell(s, i, col1, 'w')}
          {col2 && cell(s, i, col2, 'r')}
          {col3 && cell(s, i, col3, 'eff')}
          {/* A timed set is started, not typed: the timer counts the hold down and checks the
              set off itself. The checkbox stays for anyone who timed it on their own watch. */}
          {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
            onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
          <Check checked={s.done} onChange={() => onToggle(i)} />
        </div>
        {s.note && <div className="set-note">{s.note}</div>}
      </div>)}
      <div style={{ height: 8 }} />
      <div className="row">
        <Button size="sm" icon="minus" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
        <Button size="sm" icon="plus" onClick={onAddSet}>{t('Add set')}</Button>
      </div>
    </div>
  </>
}

/* ---------- the routine's notes ("coach notes"), folded to a few lines until opened ---------- */
function RoutineNotes({ text }) {
  const [open, setOpen] = useState(false)
  const body = String(text || '').trim()
  if (!body) return null
  const long = body.length > 160 || body.split('\n').length > 3
  return <div className="card rnotes">
    <div className="row" style={{ gap: 8, marginBottom: 6 }}><Icon name="clipboard" className="accent" /><b>{t('Routine notes')}</b></div>
    <div className={'rnotes-b' + (open || !long ? '' : ' folded')}>{body}</div>
    {long && <button className="accent small" style={{ marginTop: 6, fontWeight: 600 }} onClick={() => setOpen(o => !o)}>{open ? t('Show less') : t('Show more')}</button>}
  </div>
}

/* ---------- every exercise of the session at a glance, to jump straight to one ---------- */
function ExerciseNav({ onPick }) {
  const A = useStore(s => s.S.active)
  if (!A) return null
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  return <div className="exnav">
    {units.map((u, k) => <button key={u[0]} className={'exnav-u' + (u.includes(cur) ? ' on' : '') + (u.length > 1 ? ' ss' : '')} onClick={() => onPick(u[0])}>
      <span className="exnav-k">{k + 1}</span>
      <span className="exnav-l">{u.map(idx => {
        const e = A.entries[idx]
        const ex = exOr(e.id)
        const n = e.sets.filter(s => s.done).length
        const all = e.sets.length > 0 && n === e.sets.length
        return <span key={idx} className="exnav-e">
          <Thumb ex={ex} />
          <span className="grow">
            <span className="tt capitalize">{ex.n}</span>
            <span className={'ss' + (all ? ' ok' : '')}>{all ? <><Icon name="check" />{t('Done')}</> : t('{0} sets', n + '/' + e.sets.length)}</span>
          </span>
        </span>
      })}</span>
    </button>)}
  </div>
}

/* ---------- active workout ---------- */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const { startRest, stopRest } = useUI()
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)
  const isSuperset = unit.length > 1

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)

  const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
    // An exercise with no history (or one just swapped in) starts its warm-ups at 0 kg.
    // The first working weight you enter is what they were waiting for — fill them in from
    // it, as long as none has been touched or done yet.
    if (field === 'w' && i === 0 && v > 0 && e.warm && e.warm.length && e.warm.every(s => !s.done && !(s.w > 0))) {
      const fresh = warmupSets(v, e.warm.length, S.unit)
      e.warm = e.warm.map((s, k) => ({ ...s, w: fresh[k].w }))
    }
  })
  const modeAt = idx => modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const addSet = idx => mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const m = modeOf({ ...(e.target || {}), id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (e.target.min || 20), speed: l ? l.speed : (e.target.speed || 8), done: false })
    else if (m === 'time') e.sets.push({ sec: l ? l.sec : (e.target.sec || 45), w: l ? (l.w || 0) : (e.target.weight || 0), done: false })
    else e.sets.push({ w: l ? l.w : 0, r: l ? l.r : e.target.reps, done: false })
  })
  const removeSet = idx => mutEntry(idx, e => { if (e.sets.length > 1) e.sets.pop() })

  // A timed set is held, not typed. The work timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      mutEntry(idx, en => { en.sets[i].sec = elapsed })
      if (!useStore.getState().S.active.entries[idx].sets[i].done) toggle(idx, i)
    })
  }

  const toggle = (idx, i) => {
    const m = modeAt(idx)
    const cardioEntry = m === 'cardio'
    const isLastUnit = unitIdx >= units.length - 1
    let askTop = false, exJustDone = false, workoutDone = false
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      if (e.sets[i].done) {
        beep(S.sound, 1040, 0.12); vibrate(30)
        const isLastExInUnit = idx === unit[unit.length - 1]
        const unitDone = unit.every(ui => (ui === idx ? e : A.entries[ui]).sets.every(x => x.done))
        const rest = restAfterSet({ lastInUnit: isLastExInUnit, unitDone, lastUnit: isLastUnit })
        if (rest === 'start') startRest(S.restSec)
        else if (rest === 'stop') stopRest()
        if (unitDone && isLastUnit) workoutDone = true      // last exercise's last set → done
        // Only loaded reps training has a "working weight" worth confirming — a bodyweight
        // plank has nothing to put in that slider, and neither does a set of push-ups
        // (issue #32: the fewest taps that still record what happened).
        const loaded = m === 'reps' && !(isBw({ ...(e.target || {}), id: e.id }) && !e.sets.some(x => x.w > 0))
        if (e.sets.every(x => x.done)) { exJustDone = true; if (loaded && !e.asked) { e.asked = true; askTop = true } }
      }
    })
    // reps: topWeight first (it chains into the finish/continue prompt on the last unit).
    // cardio/timed or already-confirmed: go straight to the prompt.
    if (askTop) topWeightSheet(idx)
    else if (workoutDone) workoutCompleteSheet()
    else if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
    else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
  }

  /* ---- warm-ups: their own list, a short rest, never part of the session's progress ---- */
  const warmToggle = (idx, i) => mutEntry(idx, e => {
    const s = e.warm[i]
    s.done = !s.done
    if (s.done) { beep(S.sound, 1040, 0.12); vibrate(30); startRest(Math.min(S.restSec, 60)) }
  })
  const warmField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.warm[i][field]; else e.warm[i][field] = v
  })
  const addWarm = idx => mutEntry(idx, e => {
    const workW = (e.sets.find(s => !s.done) || e.sets[0] || {}).w || 0
    e.warm = [...(e.warm || []), nextWarmup(e.warm, workW, S.unit)]
  })

  /* ---- notes: one per exercise and one per set, kept with the workout ---- */
  const toast = m => useUI.getState().toast(m)
  const editEntryNote = idx => noteSheet({
    title: t('Exercise note'), subtitle: exOr(A.entries[idx].id).n, value: A.entries[idx].note,
    placeholder: t('How it went, seat position, what to change next time…'),
    onSave: v => mutEntry(idx, e => { if (v) e.note = v; else delete e.note })
  })
  const setTap = (idx, kind, i) => {
    const e = A.entries[idx]
    const list = kind === 'warm' ? e.warm : e.sets
    const s = list[i]
    const label = kind === 'warm' ? warmLabel(i) : t('Set {0}', i + 1)
    const editNote = () => noteSheet({
      title: t('Note for {0}', label), subtitle: exOr(e.id).n, value: s.note,
      placeholder: t('e.g. felt easy, grip slipped, left side weaker…'),
      onSave: v => mutEntry(idx, en => { const x = (kind === 'warm' ? en.warm : en.sets)[i]; if (v) x.note = v; else delete x.note })
    })
    const remove = () => mutEntry(idx, en => {
      if (kind === 'warm') { en.warm.splice(i, 1); if (!en.warm.length) delete en.warm }
      else if (en.sets.length > 1) en.sets.splice(i, 1)
    })
    const canRemove = kind === 'warm' || e.sets.length > 1
    useUI.getState().openSheet(close => <>
      <h3>{label}</h3>
      <div className="muted small capitalize" style={{ marginBottom: 12 }}>{exOr(e.id).n}</div>
      <div className="sect-b">
        <Row icon="note" iconTint="var(--acc)" title={s.note ? t('Edit note') : t('Add note')} subtitle={s.note || null} accessory="chevron" onClick={() => { close(); editNote() }} />
        {canRemove && <Row icon="trash" iconTint="var(--red)" danger title={kind === 'warm' ? t('Remove this warm-up set') : t('Remove this set')} onClick={() => { close(); remove() }} />}
      </div>
      <div style={{ height: 8 }} />
    </>)
  }

  /* ---- swap: smart suggestions, optionally written back to the routine ---- */
  const swapEntry = idx => {
    const e = A.entries[idx]
    const base = exOr(e.id)
    const oldId = e.id
    const r = S.routines.find(x => x.id === A.routineId)
    const inRoutine = !!r && r.ex.some(x => x.id === oldId)
    const pickSwap = () => swapSheet(base, (ex, persist) => {
      update(s => {
        const en = s.active.entries[idx]
        if (!en || en.id !== oldId) return
        const rr = s.routines.find(x => x.id === s.active.routineId)
        // The new exercise gets the old one's amount of work and a fresh prescription from its
        // own history — the old weight means nothing on a different movement.
        const cfg = { ...swapConfig(en.target, ex.id), id: ex.id, ...(en.sg ? { sg: en.sg } : {}) }
        const plan = nextPrescription(s, cfg, rr)
        const sets = applyPrescription(buildSets(s, cfg), plan)
        const warm = initialWarmups(cfg, sets, s.unit)
        en.id = ex.id; en.target = cfg; en.plan = plan; en.sets = sets
        if (warm) en.warm = warm; else delete en.warm
        delete en.topW; delete en.asked; delete en.note
        if (persist && rr) {
          const k = rr.ex.findIndex(x => x.id === oldId)
          if (k >= 0) {
            const old = rr.ex[k]
            rr.ex[k] = { ...swapConfig(old, ex.id), id: ex.id, ...(old.sg ? { sg: old.sg } : {}) }
          }
        }
      }, true)
      toast(persist ? t('Swapped — “{0}” updated for next time', r.name) : t('Swapped for today'))
    }, { exclude: A.entries.map(x => x.id), persist: inRoutine ? { name: r.name } : null })
    if (e.sets.some(s => s.done) || (e.warm || []).some(s => s.done)) {
      confirmSheet({ title: t('Swap “{0}”?', base.n), message: t('The sets you already checked off for it will be discarded.'), confirmText: t('Choose a swap'), onConfirm: pickSwap })
    } else pickSwap()
  }

  const removeEntry = idx => {
    const e = A.entries[idx]
    confirmSheet({
      title: t('Remove “{0}”?', exOr(e.id).n),
      message: t('Only from this workout — your routine stays as it is.'),
      confirmText: t('Remove'), danger: true,
      onConfirm: () => update(s => {
        s.active.entries.splice(idx, 1)
        cleanupSg(s.active.entries)
        s.active.cur = Math.max(0, Math.min(s.active.cur > idx ? s.active.cur - 1 : s.active.cur, s.active.entries.length - 1))
      }, true)
    })
  }

  const entryMenu = idx => {
    const e = A.entries[idx]
    const reps = modeAt(idx) === 'reps'
    useUI.getState().openSheet(close => <>
      <h3 className="capitalize">{exOr(e.id).n}</h3>
      <div className="sect-b">
        {reps && <Row icon="flame" iconTint="var(--orange)" title={t('Add warm-up set')} subtitle={t('Ramps toward your working weight')} onClick={() => { close(); addWarm(idx) }} />}
        <Row icon="swap" iconTint="var(--acc)" title={t('Swap exercise')} subtitle={t('Smart suggestions for the same muscles')} accessory="chevron" onClick={() => { close(); swapEntry(idx) }} />
        <Row icon="note" iconTint="var(--yellow)" title={e.note ? t('Edit exercise note') : t('Add exercise note')} accessory="chevron" onClick={() => { close(); editEntryNote(idx) }} />
        <Row icon="history" iconTint="var(--blue)" title={t('Exercise history')} accessory="chevron" onClick={() => { close(); exerciseHistorySheet(e.id) }} />
        <Row icon="trash" iconTint="var(--red)" danger title={t('Remove from this workout')} onClick={() => { close(); removeEntry(idx) }} />
      </div>
      <div style={{ height: 8 }} />
    </>)
  }
  // Jumping goes to the first exercise of a superset, like Prev/Next, and back to the top of
  // the page so the new exercise opens on its name rather than wherever the old one was scrolled.
  const goTo = idx => {
    update(s => { s.active.cur = idx })
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60)
  }
  const openNav = () => useUI.getState().openSheet(close => <>
    <h3>{t('Exercises')}</h3>
    <ExerciseNav onPick={idx => { close(); goTo(idx) }} />
  </>, { kind: 'drawer' })

  // Everything an ExerciseBlock needs beyond the sets themselves, bound to one entry.
  const extra = idx => ({
    onWarmToggle: i => warmToggle(idx, i), onWarmField: (i, f, v) => warmField(idx, i, f, v),
    onSetTap: (kind, i) => setTap(idx, kind, i), onMenu: () => entryMenu(idx), onNote: () => editEntryNote(idx), onAddWarm: () => addWarm(idx)
  })

  // Live-presence heartbeat so the admin dashboard can show who's training now. Signed-in only —
  // guests have no server session. Reads fresh state each tick so progress stays current.
  useEffect(() => {
    if (!useStore.getState().user) return
    let stopped = false
    const ping = active => {
      const A2 = useStore.getState().S.active
      if (!A2) return
      const u = supersetUnits(A2.entries)
      const c = Math.min(A2.cur, Math.max(0, A2.entries.length - 1))
      const ui = u.findIndex(x => x.includes(c))
      const tot = A2.entries.reduce((n, e) => n + e.sets.length, 0)
      api('/api/activity', { method: 'POST', body: JSON.stringify({
        active, name: A2.name, exIdx: ui + 1, exTotal: u.length,
        setsDone: setsDoneActive(A2), setsTotal: tot, startedAt: A2.start
      }) }).catch(() => {})
    }
    ping(true)
    const iv = setInterval(() => { if (!stopped) ping(true) }, 20000)
    return () => {
      stopped = true; clearInterval(iv)
      // best-effort "left" signal: sendBeacon survives a tab close, fetch covers in-app nav
      try { navigator.sendBeacon?.('/api/activity', new Blob([JSON.stringify({ active: false })], { type: 'application/json' })) } catch { /* */ }
      api('/api/activity', { method: 'POST', body: JSON.stringify({ active: false }) }).catch(() => {})
    }
  }, [])

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" aria-label={t('Discard')} onClick={() => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { update(s => { s.active = null }); stopRest(); nav('/home') } })}><Icon name="xmark" /></button>
      <div style={{ textAlign: 'center' }}><div style={{ fontWeight: 600 }}>{A.name}</div><div className="sub"><Elapsed start={A.start} /> · {t('{0} sets', done + '/' + total)}</div></div>
      <button className="iconbtn" style={{ color: 'var(--acc)' }} aria-label={t('Finish')} onClick={finishWorkout}><Icon name="check" /></button>
    </div>
    <div className="wprog"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></div>
    <RoutineNotes text={(S.routines.find(r => r.id === A.routineId) || {}).notes} />
    {/* on a wide screen the list just stays open beside the session */}
    {A.entries.length > 1 && <aside className="wk-side"><div className="wk-side-h">{t('Exercises')}</div><ExerciseNav onPick={goTo} /></aside>}

    {A.entries.length ? <>
      {/* the counter opens the list of every exercise, so the 4th → 1st is one tap, not three */}
      <button className="exnav-btn" onClick={openNav}><Icon name="list" />{isSuperset ? t('Superset {0} / {1}', unitIdx + 1, units.length) : t('Exercise {0} / {1}', unitIdx + 1, units.length)}<Icon name="chevronDown" /></button>
      {isSuperset ? (
        <div className="ss-card">
          <div className="ss-hd"><Icon name="link" />{t('Superset · do these back-to-back, rest after both')}</div>
          {unit.map((idx, k) => <div key={idx} className="ss-ex">
            {k > 0 && <div className="ss-amp">+</div>}
            <ExerciseBlock entryIdx={idx} compact
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)} onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onStartTimed={i => startTimed(idx, i)} {...extra(idx)} />
          </div>)}
        </div>
      ) : (
        <ExerciseBlock entryIdx={cur} onToggle={i => toggle(cur, i)} onField={(i, f, v) => setField(cur, i, f, v)} onAddSet={() => addSet(cur)} onRemoveSet={() => removeSet(cur)} onStartTimed={i => startTimed(cur, i)} {...extra(cur)} />
      )}
    </> : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div style={{ height: 12 }} />
    <div className="row">
      <Button icon="chevronLeft" disabled={unitIdx <= 0} onClick={() => update(s => { s.active.cur = units[unitIdx - 1][0] })}>{t('Prev')}</Button>
      <Button trailingIcon="chevronRight" disabled={unitIdx < 0 || unitIdx >= units.length - 1} onClick={() => update(s => { s.active.cur = units[unitIdx + 1][0] })}>{t('Next')}</Button>
    </div>
    <div style={{ height: 10 }} />
    <Button onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
      const full = { ...cfg, id: ex.id }
      const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
      const sets = applyPrescription(buildSets(s, full), plan)
      const warm = initialWarmups(full, sets, s.unit)
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets, ...(warm ? { warm } : {}) })
      s.active.cur = s.active.entries.length - 1
    }), null, S.routines.find(r => r.id === A.routineId)))} icon="plus">{t('Add exercise')}</Button>
    <div style={{ height: 10 }} />
    {(() => {
      const exDone = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
      const allDone = A.entries.length > 0 && exDone === A.entries.length
      return <button className={allDone ? 'btn primary' : 'btn ghost dim'} onClick={finishWorkout}>
        {allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', exDone + '/' + A.entries.length)}
      </button>
    })()}
    <div style={{ height: 40 }} />
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
