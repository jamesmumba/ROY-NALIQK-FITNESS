import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { ExercisePicker } from '../components/ExercisePicker'
import { Badge, Button, Card, Chip, ErrorNote, Field, Input, NumberInput, Select, Spinner, useAsync } from '../components/ui'
import { copyWorkout, deleteWorkout, getWorkout, loadLibrary, saveWorkout, startSession, type WorkoutDraft } from '../lib/data'
import { DAYS, prescription, REP_RANGES, SET_TYPES } from '../lib/training'
import type { Exercise, Intensity, SetType, WorkoutExercise } from '../lib/types'

const blank = (params: URLSearchParams): WorkoutDraft => ({
  program_id: params.get('program'), day_of_week: params.get('day') ? Number(params.get('day')) : null,
  scheduled_date: params.get('date'), name: params.get('name') ?? 'New workout', focus: [],
  is_template: !params.get('program') && !params.get('date'), est_minutes: 60, notes: null, exercises: [],
})

export default function WorkoutEdit() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { profile } = useProfile()
  const { data: lib } = useAsync(loadLibrary, [])
  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!lib) return
    if (id) getWorkout(id).then((w) => setDraft(w)).catch((e) => setError(e.message))
    else {
      const d = blank(params)
      const ex = params.get('exercise') && lib.bySlug.get(params.get('exercise')!)
      if (ex) { d.exercises = [newEntry(ex, 0)]; d.name = `${ex.name} session` }
      setDraft(d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lib])

  function newEntry(ex: Exercise, position: number): WorkoutExercise {
    const p = prescription(profile.goal, ex.classification)
    return {
      exercise_id: ex.id, position, set_type: 'straight', superset_group: null, intensity: 'moderate', rest_seconds: p.rest, notes: null,
      sets: Array.from({ length: p.sets }, (_, i) => ({ set_number: i + 1, target_reps: p.reps, target_weight: 0 })),
    }
  }

  if (error && !draft) return <ErrorNote error={error} />
  if (!lib || !draft) return <Spinner />

  const update = (patch: Partial<WorkoutDraft>) => { setDraft({ ...draft, ...patch }); setSavedAt(null) }
  const updateEx = (i: number, patch: Partial<WorkoutExercise>) =>
    update({ exercises: draft.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const move = (i: number, d: -1 | 1) => {
    const list = [...draft.exercises]
    ;[list[i], list[i + d]] = [list[i + d], list[i]]
    update({ exercises: list })
  }

  function validate() {
    if (!draft!.name.trim()) return 'Give the workout a name.'
    for (const e of draft!.exercises) {
      const n = lib!.byId.get(e.exercise_id)?.name
      if (!e.sets.length) return `${n} needs at least one set.`
      if (e.sets.some((s) => !s.target_reps || s.target_reps < 1 || s.target_reps > 200)) return `${n}: reps must be between 1 and 200.`
      if (e.sets.some((s) => s.target_weight < 0)) return `${n}: weight cannot be negative.`
    }
    return null
  }

  async function save(): Promise<string | null> {
    const v = validate()
    setError(v)
    if (v) return null
    setBusy('save')
    try {
      const focus = [...new Set(draft!.exercises.flatMap((e) => lib!.byId.get(e.exercise_id)?.muscles ?? []))]
      const savedId = await saveWorkout({ ...draft!, name: draft!.name.trim(), focus })
      setSavedAt(Date.now())
      if (!id) nav(`/workouts/${savedId}`, { replace: true })
      return savedId
    } catch (e) { setError((e as Error).message); return null } finally { setBusy(null) }
  }

  async function startNow() {
    const savedId = await save()
    if (!savedId) return
    setBusy('start')
    try { nav(`/session/${await startSession(await getWorkout(savedId))}`) } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  async function remove() {
    if (!id || !confirm(`Delete “${draft!.name}”? This cannot be undone.`)) return
    setBusy('delete')
    try { await deleteWorkout(id); nav(draft!.program_id ? '/planner' : '/workouts', { replace: true }) } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  async function duplicateAsTemplate() {
    if (!id) return
    setBusy('copy')
    try { nav(`/workouts/${await copyWorkout(id, { name: `${draft!.name} (template)`, is_template: true, program_id: null, day_of_week: null, scheduled_date: null })}`) }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const applyRange = (reps: number) => update({ exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, target_reps: reps })) })) })
  const context = draft.program_id ? `Programme day · ${draft.day_of_week != null ? DAYS[draft.day_of_week] : ''}` : draft.scheduled_date ? `Scheduled · ${draft.scheduled_date}` : draft.is_template ? 'Template' : 'Workout'

  return (
    <div className="animate-rise pb-20">
      <Link to={draft.program_id ? '/planner' : '/workouts'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Back</Link>
      <p className="eyebrow mb-2">{context}</p>
      <input
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        aria-label="Workout name"
        maxLength={80}
        className="display w-full bg-transparent text-4xl sm:text-5xl text-fg focus:outline-none border-b border-transparent focus:border-line pb-1"
      />

      <Card className="mt-5 grid gap-4 p-4 sm:grid-cols-4">
        <Field label="Date (optional)"><Input type="date" value={draft.scheduled_date ?? ''} onChange={(e) => update({ scheduled_date: e.target.value || null })} disabled={!!draft.program_id} /></Field>
        <Field label="Duration (min)"><NumberInput value={draft.est_minutes} onChange={(v) => update({ est_minutes: v })} min={5} max={300} /></Field>
        <Field label="Notes"><Input value={draft.notes ?? ''} onChange={(e) => update({ notes: e.target.value || null })} placeholder="Focus for today" /></Field>
        <label className="flex items-end gap-2 pb-2.5 text-sm text-muted">
          <input type="checkbox" checked={draft.is_template} onChange={(e) => update({ is_template: e.target.checked })} disabled={!!draft.program_id} className="size-4 accent-[var(--color-accent)]" />
          Save as reusable template
        </label>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-faint">Rep range for all sets:</span>
        {Object.values(REP_RANGES).map((r) => (
          <Chip key={r.label} onClick={() => applyRange(Math.round((r.min + r.max) / 2))}>{r.label} {r.min}–{r.max}</Chip>
        ))}
        <span className="text-xs text-faint">Guides, not limits: edit any set below.</span>
      </div>

      <ol className="mt-6 space-y-3">
        {draft.exercises.map((e, i) => {
          const ex = lib.byId.get(e.exercise_id)
          if (!ex) return null
          return (
            <li key={`${e.exercise_id}-${i}`}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <ExerciseImage exercise={ex} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-sm text-faint">{String(i + 1).padStart(2, '0')}</span>
                      <Link to={`/exercise/${ex.slug}`} className="font-semibold hover:text-accent truncate">{ex.name}</Link>
                      <Badge tone={ex.classification === 'compound' ? 'accent' : 'neutral'}>{ex.classification}</Badge>
                      {e.set_type === 'superset' && e.superset_group != null && <Badge tone="warn">Superset {String.fromCharCode(64 + e.superset_group)}</Badge>}
                    </div>
                    <p className="text-xs text-faint mt-0.5">Recommended {ex.rec_sets} × {ex.rec_reps}, rest {ex.rest_seconds}s</p>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="size-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === draft.exercises.length - 1} aria-label="Move down"><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => update({ exercises: draft.exercises.filter((_, j) => j !== i) })} aria-label={`Remove ${ex.name}`}><Trash2 className="size-4" /></Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Set structure">
                    <Select value={e.set_type} onChange={(ev) => updateEx(i, { set_type: ev.target.value as SetType, superset_group: ev.target.value === 'superset' ? e.superset_group ?? 1 : null })}>
                      {Object.entries(SET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  {e.set_type === 'superset' ? (
                    <Field label="Superset group" hint="Same letter = performed back to back">
                      <Select value={e.superset_group ?? 1} onChange={(ev) => updateEx(i, { superset_group: Number(ev.target.value) })}>
                        {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{String.fromCharCode(64 + g)}</option>)}
                      </Select>
                    </Field>
                  ) : (
                    <Field label="Intensity">
                      <Select value={e.intensity ?? ''} onChange={(ev) => updateEx(i, { intensity: (ev.target.value || null) as Intensity | null })}>
                        <option value="">—</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="hard">Hard</option><option value="max">Max effort</option>
                      </Select>
                    </Field>
                  )}
                  <Field label="Rest (seconds)"><NumberInput value={e.rest_seconds} onChange={(v) => updateEx(i, { rest_seconds: Math.max(0, Math.min(900, v ?? 0)) })} min={0} max={900} step={15} /></Field>
                  <Field label="Notes"><Input value={e.notes ?? ''} onChange={(ev) => updateEx(i, { notes: ev.target.value || null })} placeholder="Cue, tempo…" maxLength={500} /></Field>
                </div>

                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-faint">
                      <th className="w-12 pb-1 font-medium">Set</th><th className="pb-1 font-medium">Reps</th><th className="pb-1 font-medium">Weight (kg)</th><th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {e.sets.map((s, k) => (
                      <tr key={k}>
                        <td className="py-1 num text-muted">{e.set_type === 'amrap' && k === e.sets.length - 1 ? 'AMRAP' : k + 1}</td>
                        <td className="py-1 pr-2"><NumberInput aria-label={`Set ${k + 1} reps`} value={s.target_reps} min={1} max={200} className="h-9"
                          onChange={(v) => updateEx(i, { sets: e.sets.map((x, j) => (j === k ? { ...x, target_reps: v ?? 0 } : x)) })} /></td>
                        <td className="py-1 pr-2"><NumberInput aria-label={`Set ${k + 1} weight`} value={s.target_weight} min={0} step={0.5} className="h-9"
                          onChange={(v) => updateEx(i, { sets: e.sets.map((x, j) => (j === k ? { ...x, target_weight: v ?? 0 } : x)) })} /></td>
                        <td className="py-1 text-right">
                          <Button variant="ghost" size="sm" onClick={() => updateEx(i, { sets: e.sets.filter((_, j) => j !== k).map((x, j) => ({ ...x, set_number: j + 1 })) })} aria-label={`Remove set ${k + 1}`}><X className="size-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button variant="ghost" size="sm" className="mt-1" disabled={e.sets.length >= 30} onClick={() => {
                  const last = e.sets.at(-1) ?? { target_reps: 10, target_weight: 0 }
                  const pyramid = e.set_type === 'pyramid', drop = e.set_type === 'drop'
                  updateEx(i, { sets: [...e.sets, {
                    set_number: e.sets.length + 1,
                    target_reps: pyramid ? Math.max(1, last.target_reps - 2) : drop ? last.target_reps + 2 : last.target_reps,
                    target_weight: pyramid ? last.target_weight + 2.5 : drop ? Math.max(0, Math.round(last.target_weight * 0.8 * 2) / 2) : last.target_weight,
                  }] })
                }}><Plus className="size-4" /> Add set</Button>
              </Card>
            </li>
          )
        })}
      </ol>

      <Button variant="secondary" size="lg" className="mt-3 w-full border-dashed" onClick={() => setPicker(true)}><Plus className="size-4" /> Add exercise</Button>

      <div className="mt-4"><ErrorNote error={error} /></div>

      <div className="fixed inset-x-0 bottom-16 lg:bottom-0 lg:left-60 z-20 border-t border-line/60 bg-bg/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 lg:px-10 py-3 max-w-[1400px]">
          <Button variant="primary" onClick={save} busy={busy === 'save'}><Save className="size-4" /> Save</Button>
          <Button onClick={startNow} busy={busy === 'start'} disabled={!draft.exercises.length}><Play className="size-4" /> Save & start</Button>
          {id && !draft.is_template && <Button variant="ghost" onClick={duplicateAsTemplate} busy={busy === 'copy'}><Copy className="size-4" /> Save as template</Button>}
          {savedAt && <span className="text-sm text-ok">Saved</span>}
          {id && <Button variant="danger" className="ml-auto" onClick={remove} busy={busy === 'delete'}><Trash2 className="size-4" /> Delete</Button>}
        </div>
      </div>

      <ExercisePicker lib={lib} open={picker} onClose={() => setPicker(false)} onPick={(ex) => update({ exercises: [...draft.exercises, newEntry(ex, draft.exercises.length)] })} />
    </div>
  )
}
