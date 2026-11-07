import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Pause, Play, Plus, Replace, SkipForward, Timer, Trash2, Trophy, X } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { ExercisePicker } from '../components/ExercisePicker'
import { Badge, Button, Card, cx, ErrorNote, Modal, NumberInput, SectionTitle, Spinner, Stat, useAsync } from '../components/ui'
import { addLogs, deleteSession, finishSession, getSession, listDoneSets, listRecords, listSessions, loadLibrary, updateLog, updateSession, type Library } from '../lib/data'
import { alternatives, availableEquipment } from '../lib/recommend'
import { fmtDuration, fmtKg, fmtVolume, prescription, SET_TYPES } from '../lib/training'
import type { DoneSet, Exercise, LogRow, PersonalRecord, Session } from '../lib/types'

export default function SessionPage() {
  const { id = '' } = useParams()
  const { data, error, reload } = useAsync(async () => {
    const [lib, s, history] = await Promise.all([loadLibrary(), getSession(id), listDoneSets(400)])
    return { lib, ...s, history: history.filter((h) => h.session_id !== id) }
  }, [id])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Spinner />
  return data.session.status === 'completed'
    ? <Summary lib={data.lib} session={data.session} logs={data.logs} history={data.history} />
    : <Runner lib={data.lib} session={data.session} initialLogs={data.logs} history={data.history} onFinished={reload} />
}

// ── Live workout ────────────────────────────────────────────────────────
function Runner({ lib, session, initialLogs, history, onFinished }: { lib: Library; session: Session; initialLogs: LogRow[]; history: DoneSet[]; onFinished: () => void }) {
  const { profile } = useProfile()
  const nav = useNavigate()
  const [logs, setLogs] = useState(initialLogs)
  const [idx, setIdx] = useState(() => {
    const positions = [...new Set(initialLogs.map((l) => l.position))].sort((a, b) => a - b)
    const firstOpen = positions.findIndex((p) => initialLogs.some((l) => l.position === p && !l.completed))
    return Math.max(0, firstOpen)
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [replacing, setReplacing] = useState(false)

  // Duration: base seconds + time since the clock was last resumed.
  const clock = useRef({
    base: session.duration_seconds || Math.min(3 * 3600, Math.max(0, (Date.now() - new Date(session.started_at).getTime()) / 1000)),
    since: Date.now() as number | null,
  })
  const [, tick] = useState(0)
  const elapsed = () => Math.floor(clock.current.base + (clock.current.since ? (Date.now() - clock.current.since) / 1000 : 0))
  const paused = clock.current.since === null

  const [rest, setRest] = useState<{ ends: number; total: number } | null>(null)

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  const persist = useCallback(() => updateSession(session.id, { duration_seconds: elapsed() }).catch(() => {}), [session.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => { if (clock.current.since) persist() }, 20000); return () => clearInterval(t) }, [persist])

  useEffect(() => {
    if (!rest) return
    if (Date.now() >= rest.ends) {
      setRest(null)
      navigator.vibrate?.(300)
      try {
        const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain()
        o.frequency.value = 880; g.gain.value = 0.08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25)
      } catch { /* audio unavailable */ }
    }
  })

  const positions = useMemo(() => [...new Set(logs.map((l) => l.position))].sort((a, b) => a - b), [logs])
  const pos = positions[Math.min(idx, positions.length - 1)]
  const current = logs.filter((l) => l.position === pos)
  const exerciseId = current.find((l) => !l.completed)?.exercise_id ?? current[0]?.exercise_id
  const ex = exerciseId ? lib.byId.get(exerciseId) : undefined

  const last = useMemo(() => {
    if (!exerciseId) return null
    const sets = history.filter((h) => h.exercise_id === exerciseId)
    const lastSession = sets.at(-1)?.session_id
    return lastSession ? sets.filter((s) => s.session_id === lastSession) : null
  }, [history, exerciseId])

  function togglePause() {
    const c = clock.current
    if (c.since) { c.base += (Date.now() - c.since) / 1000; c.since = null; persist() }
    else c.since = Date.now()
    tick((n) => n + 1)
  }

  function setLocal(id: string, patch: Partial<LogRow>) {
    setLogs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function complete(l: LogRow) {
    const done = !l.completed
    const patch: Partial<LogRow> = {
      completed: done,
      completed_at: done ? new Date().toISOString() : null,
      actual_reps: l.actual_reps ?? l.planned_reps ?? 0,
      actual_weight: l.actual_weight ?? l.planned_weight ?? 0,
    }
    if (done && (patch.actual_reps! < 0 || patch.actual_reps! > 500 || patch.actual_weight! < 0)) return setError('Enter valid reps (0–500) and weight (0 or more).')
    setError(null)
    setLocal(l.id, patch)
    try {
      await updateLog(l.id, patch)
      if (done && l.rest_seconds > 0) setRest({ ends: Date.now() + l.rest_seconds * 1000, total: l.rest_seconds })
      if (done) persist()
    } catch (e) { setLocal(l.id, { completed: l.completed }); setError((e as Error).message) }
  }

  async function saveValue(l: LogRow, patch: Partial<LogRow>) {
    setLocal(l.id, patch)
    try { await updateLog(l.id, patch) } catch (e) { setError((e as Error).message) }
  }

  async function addSet() {
    const lastSet = current.at(-1)!
    setBusy('set')
    try {
      const [row] = await addLogs([{ session_id: session.id, exercise_id: exerciseId!, position: pos, set_number: lastSet.set_number + 1, set_type: lastSet.set_type,
        rest_seconds: lastSet.rest_seconds, planned_reps: lastSet.planned_reps, planned_weight: lastSet.actual_weight ?? lastSet.planned_weight }])
      setLogs((ls) => [...ls, row])
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function addExercise(e: Exercise) {
    const p = prescription(profile.goal, e.classification)
    const position = (positions.at(-1) ?? -1) + 1
    try {
      const rows = await addLogs(Array.from({ length: p.sets }, (_, i) => ({ session_id: session.id, exercise_id: e.id, position, set_number: i + 1, set_type: 'straight' as const, rest_seconds: p.rest, planned_reps: p.reps, planned_weight: 0 })))
      setLogs((ls) => [...ls, ...rows])
      setIdx(positions.length)
    } catch (err) { setError((err as Error).message) }
  }

  async function replaceWith(e: Exercise) {
    const open = current.filter((l) => !l.completed)
    setReplacing(false)
    setLogs((ls) => ls.map((l) => (open.some((o) => o.id === l.id) ? { ...l, exercise_id: e.id } : l)))
    try { await Promise.all(open.map((l) => updateLog(l.id, { exercise_id: e.id }))) } catch (err) { setError((err as Error).message) }
  }

  async function finish() {
    const open = logs.filter((l) => !l.completed).length
    if (open && !confirm(`${open} set${open > 1 ? 's are' : ' is'} not marked complete and will count as missed. Finish anyway?`)) return
    setBusy('finish')
    try { await finishSession(session.id, elapsed()); onFinished() } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  async function discard() {
    if (!confirm('Discard this workout? Logged sets will be deleted.')) return
    await deleteSession(session.id).catch(() => {})
    nav('/', { replace: true })
  }

  const doneSets = logs.filter((l) => l.completed).length
  const restLeft = rest ? Math.max(0, Math.ceil((rest.ends - Date.now()) / 1000)) : 0
  const alts = ex ? alternatives(lib.exercises, ex, profile.active_env, availableEquipment(profile, profile.active_env)) : []

  return (
    <div className="pb-32">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" /> Dashboard</Link>
        <div className="flex items-center gap-2">
          <span className={cx('display num text-3xl', paused ? 'text-faint' : 'text-fg')} aria-label="Workout duration">{fmtDuration(elapsed())}</span>
          <Button size="sm" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <Play className="size-4" /> : <Pause className="size-4" />}{paused ? 'Resume' : 'Pause'}</Button>
        </div>
      </div>

      <p className="eyebrow">Workout in progress · {doneSets}/{logs.length} sets</p>
      <h1 className="display mt-1 text-4xl">{session.name}</h1>
      <div className="mt-3 h-1 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${logs.length ? (doneSets / logs.length) * 100 : 0}%` }} /></div>

      {/* Exercise rail */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {positions.map((p, i) => {
          const ls = logs.filter((l) => l.position === p)
          const e = lib.byId.get(ls.find((l) => !l.completed)?.exercise_id ?? ls[0].exercise_id)
          const allDone = ls.every((l) => l.completed)
          return (
            <button key={p} onClick={() => setIdx(i)}
              className={cx('shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors', i === idx ? 'border-accent bg-accent-lo' : 'border-line/60 bg-surface hover:border-faint')}>
              <span className="flex items-center gap-1.5">{allDone && <Check className="size-3.5 text-ok" />}<span className="max-w-36 truncate font-medium">{e?.name}</span></span>
              <span className="text-xs text-faint num">{ls.filter((l) => l.completed).length}/{ls.length} sets</span>
            </button>
          )
        })}
      </div>

      <ErrorNote error={error} />

      {ex ? (
        <div key={pos} className="animate-rise mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <ExerciseImage exercise={ex} animate className="aspect-[4/3] w-full rounded-2xl" />
            <details className="mt-3 rounded-xl border border-line/60 bg-surface p-4 text-sm">
              <summary className="cursor-pointer font-medium">How to perform it</summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted">{ex.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
            </details>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/exercise/${ex.slug}`} className="display text-3xl hover:text-accent">{ex.name}</Link>
              <Badge tone="accent">{SET_TYPES[current[0].set_type]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Prescribed {current.length} × {current[0].planned_reps ?? '—'}{current[0].planned_weight ? ` @ ${fmtKg(current[0].planned_weight)}` : ''} · rest {current[0].rest_seconds}s
            </p>
            {last && <p className="mt-1 text-xs text-faint num">Last time: {last.map((s) => `${s.weight}×${s.reps}`).join(', ')}</p>}
            <p className="mt-1 text-xs text-faint">Tap a set number to mark it as a warm-up. Warm-ups don't count toward volume, progression or records.</p>

            <div className="mt-4 overflow-hidden rounded-xl border border-line/60">
              <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_3rem] gap-2 bg-raised px-3 py-2 text-xs text-faint">
                <span>Set</span><span>Planned</span><span>kg</span><span>Reps</span><span className="sr-only">Done</span>
              </div>
              {current.map((l) => (
                <div key={l.id} className={cx('grid grid-cols-[2.5rem_1fr_1fr_1fr_3rem] items-center gap-2 border-t border-line/60 px-3 py-2 transition-colors', l.completed && 'bg-ok/8')}>
                  <button onClick={() => saveValue(l, { is_warmup: !l.is_warmup })} aria-pressed={l.is_warmup}
                    aria-label={l.is_warmup ? `Set ${l.set_number} is a warm-up; mark as working set` : `Mark set ${l.set_number} as a warm-up`}
                    title="Tap to mark as warm-up"
                    className={cx('grid size-8 place-items-center rounded-md num text-sm transition-colors', l.is_warmup ? 'bg-warn/15 font-semibold text-warn' : 'text-muted hover:bg-raised')}>
                    {l.is_warmup ? 'W' : l.set_number}
                  </button>
                  <span className="num text-sm text-faint">{l.planned_reps ?? '—'} × {l.planned_weight ?? 0}</span>
                  <NumberInput aria-label={`Set ${l.set_number} weight`} value={l.actual_weight ?? l.planned_weight} min={0} step={0.5} className="h-10 px-2"
                    onChange={(v) => setLocal(l.id, { actual_weight: v })} onBlur={() => l.completed && saveValue(l, { actual_weight: l.actual_weight })} />
                  <NumberInput aria-label={`Set ${l.set_number} reps`} value={l.actual_reps ?? l.planned_reps} min={0} max={500} className="h-10 px-2"
                    onChange={(v) => setLocal(l.id, { actual_reps: v })} onBlur={() => l.completed && saveValue(l, { actual_reps: l.actual_reps })} />
                  <button onClick={() => complete(l)} aria-label={l.completed ? `Undo set ${l.set_number}` : `Complete set ${l.set_number}`} aria-pressed={l.completed}
                    className={cx('grid size-10 place-items-center rounded-lg border transition-colors', l.completed ? 'border-ok bg-ok text-bg' : 'border-line text-faint hover:border-ok hover:text-ok')}>
                    <Check className="size-5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={addSet} busy={busy === 'set'}><Plus className="size-4" /> Add set</Button>
              <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}><Replace className="size-4" /> Replace</Button>
              <Button size="sm" variant="ghost" onClick={() => setIdx(Math.min(idx + 1, positions.length - 1))} disabled={idx >= positions.length - 1}><SkipForward className="size-4" /> Skip</Button>
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <Button onClick={() => setIdx(idx - 1)} disabled={idx === 0}><ArrowLeft className="size-4" /> Previous</Button>
              {idx < positions.length - 1
                ? <Button variant="primary" onClick={() => setIdx(idx + 1)}>Next exercise <ArrowRight className="size-4" /></Button>
                : <Button variant="primary" onClick={finish} busy={busy === 'finish'}><Check className="size-4" /> Finish workout</Button>}
            </div>
          </div>
        </div>
      ) : (
        <Card className="mt-6 p-8 text-center">
          <p className="font-semibold">Empty workout</p>
          <p className="mt-1 text-sm text-muted">Add your first exercise to start logging.</p>
        </Card>
      )}

      <div className="mt-8 flex flex-wrap gap-2 border-t border-line/60 pt-5">
        <Button onClick={() => setPicker(true)}><Plus className="size-4" /> Add exercise</Button>
        <Button variant="primary" onClick={finish} busy={busy === 'finish'} disabled={!logs.length}><Check className="size-4" /> Finish workout</Button>
        <Button variant="danger" className="ml-auto" onClick={discard}><Trash2 className="size-4" /> Discard</Button>
      </div>

      {/* Rest timer */}
      {rest && (
        <div className="fixed inset-x-0 bottom-16 lg:bottom-4 z-40 px-4 lg:left-60">
          <div className="animate-rise mx-auto flex max-w-lg items-center gap-4 rounded-2xl border border-accent/40 bg-raised p-4 shadow-2xl shadow-black/50">
            <Timer className="size-6 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Rest</p>
              <p className="display num text-4xl">{fmtDuration(restLeft)}</p>
              <div className="mt-1 h-1 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(restLeft / rest.total) * 100}%` }} /></div>
            </div>
            <Button size="sm" onClick={() => setRest({ ...rest, ends: rest.ends + 15000, total: rest.total + 15 })}>+15s</Button>
            <Button size="sm" variant="ghost" onClick={() => setRest(null)} aria-label="Skip rest"><X className="size-4" /></Button>
          </div>
        </div>
      )}

      <ExercisePicker lib={lib} open={picker} onClose={() => setPicker(false)} onPick={addExercise} />
      <Modal open={replacing} onClose={() => setReplacing(false)} title={`Replace ${ex?.name ?? ''}`}>
        <p className="mb-3 text-sm text-muted">Same-muscle alternatives you can do {profile.active_env === 'home' ? 'at home with your equipment' : 'at the gym'}. Completed sets are kept.</p>
        <ul className="divide-y divide-line/60">
          {alts.map((a) => (
            <li key={a.id}>
              <button onClick={() => replaceWith(a)} className="flex w-full items-center gap-3 py-2.5 text-left hover:text-accent">
                <ExerciseImage exercise={a} className="size-11 shrink-0 rounded" />
                <span><span className="block font-medium">{a.name}</span><span className="text-xs text-faint capitalize">{a.classification} · {a.equipment.join(', ').replace(/_/g, ' ')}</span></span>
              </button>
            </li>
          ))}
          {!alts.length && <p className="py-4 text-sm text-muted">No alternatives available with your current equipment.</p>}
        </ul>
        <Button className="mt-4 w-full" onClick={() => { setReplacing(false); setPicker(true) }}>Browse all exercises</Button>
      </Modal>
    </div>
  )
}

// ── Post-workout summary ────────────────────────────────────────────────
function Summary({ lib, session, logs, history }: { lib: Library; session: Session; logs: LogRow[]; history: DoneSet[] }) {
  const { data } = useAsync(async () => {
    const [records, sessions] = await Promise.all([listRecords(), listSessions(200)])
    const prev = sessions.find((s) => s.id !== session.id && s.started_at < session.started_at && (session.workout_id ? s.workout_id === session.workout_id : s.name === session.name))
    // a record with nothing before it is a first benchmark, not a personal record
    const mine = records.filter((r) => r.session_id === session.id)
    const isFirst = (r: PersonalRecord) => !records.some((o) => o.exercise_id === r.exercise_id && o.record_type === r.record_type && o.session_id !== session.id && o.achieved_on <= r.achieved_on)
    return { prs: mine.filter((r) => !isFirst(r)), baselines: mine.filter(isFirst), prev }
  }, [session.id])

  // working sets only, matching the history it is compared against
  const done = logs.filter((l) => l.completed && !l.is_warmup)
  const volume = done.reduce((n, l) => n + (l.actual_weight ?? 0) * (l.actual_reps ?? 0), 0)
  const reps = done.reduce((n, l) => n + (l.actual_reps ?? 0), 0)
  const exercises = [...new Set(done.map((l) => l.exercise_id))]
  const prevSets = data?.prev ? history.filter((h) => h.session_id === data.prev!.id) : []
  const prevVolume = prevSets.reduce((n, s) => n + s.weight * s.reps, 0)
  const delta = prevVolume ? Math.round(((volume - prevVolume) / prevVolume) * 100) : null

  return (
    <div className="animate-rise">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" /> Dashboard</Link>
      <p className="eyebrow">Workout complete · {new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1 className="display mt-1 text-5xl">{session.name}</h1>

      <Card className="mt-6 grid grid-cols-2 gap-6 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Duration" value={fmtDuration(session.duration_seconds)} />
        <Stat label="Exercises" value={exercises.length} />
        <Stat label="Sets" value={`${done.length}/${logs.filter((l) => !l.is_warmup).length}`} sub="working sets" />
        <Stat label="Reps" value={reps} />
        <Stat label="Volume" value={fmtVolume(volume)} accent />
        <Stat label="vs last time" value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`} sub={data?.prev ? `${fmtVolume(prevVolume)} on ${new Date(data.prev.started_at).toLocaleDateString()}` : 'No previous session'} />
      </Card>

      {data && data.prs.length > 0 && (
        <Card className="mt-4 border-accent/40 p-5">
          <SectionTitle><span className="inline-flex items-center gap-2"><Trophy className="size-4 text-accent" /> Personal records</span></SectionTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.prs.map((r) => (
              <li key={r.id} className="rounded-lg bg-accent-lo px-3 py-2 text-sm">
                <span className="font-semibold">{lib.byId.get(r.exercise_id)?.name}</span>{' '}
                <span className="text-muted">{r.record_type === 'heaviest' ? `heaviest set: ${fmtKg(r.value)} × ${r.reps}` : `estimated 1RM: ${fmtKg(r.value)} (from ${r.weight} × ${r.reps})`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.baselines.length > 0 && (
        <Card className="mt-4 p-5">
          <SectionTitle>First benchmarks</SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-faint">Your first logged numbers on these exercises. Future sessions are compared against them.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...new Set(data.baselines.map((r) => r.exercise_id))].map((exId) => {
              const rs = data.baselines.filter((r) => r.exercise_id === exId)
              const heaviest = rs.find((r) => r.record_type === 'heaviest'), est = rs.find((r) => r.record_type === 'e1rm')
              return (
                <li key={exId} className="rounded-lg bg-raised px-3 py-2 text-sm">
                  <span className="font-semibold">{lib.byId.get(exId)?.name}</span>{' '}
                  <span className="text-muted">{[heaviest && `${fmtKg(heaviest.value)} × ${heaviest.reps}`, est && `est. 1RM ${fmtKg(est.value)}`].filter(Boolean).join(' · ')}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line/60 text-left text-xs text-faint"><th className="p-3 font-medium">Exercise</th><th className="p-3 font-medium">Sets (kg × reps)</th><th className="p-3 font-medium text-right">Volume</th><th className="p-3 font-medium text-right">Previous</th></tr></thead>
          <tbody>
            {exercises.map((exId) => {
              const sets = done.filter((l) => l.exercise_id === exId)
              const v = sets.reduce((n, l) => n + (l.actual_weight ?? 0) * (l.actual_reps ?? 0), 0)
              const before = history.filter((h) => h.exercise_id === exId && h.date < session.started_at)
              const lastId = before.at(-1)?.session_id
              const lastV = before.filter((h) => h.session_id === lastId).reduce((n, s) => n + s.weight * s.reps, 0)
              return (
                <tr key={exId} className="border-b border-line/40 last:border-0">
                  <td className="p-3 font-medium">{lib.byId.get(exId)?.name}</td>
                  <td className="p-3 num text-muted">{sets.map((l) => `${l.actual_weight}×${l.actual_reps}`).join(', ')}</td>
                  <td className="p-3 num text-right">{fmtVolume(v)}</td>
                  <td className={cx('p-3 num text-right', lastId ? (v >= lastV ? 'text-ok' : 'text-bad') : 'text-faint')}>{lastId ? fmtVolume(lastV) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!exercises.length && <p className="p-5 text-sm text-muted">No sets were completed in this session.</p>}
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/coach"><Button variant="primary">See coach recommendations</Button></Link>
        <Link to="/analytics"><Button>View analytics</Button></Link>
      </div>
    </div>
  )
}
