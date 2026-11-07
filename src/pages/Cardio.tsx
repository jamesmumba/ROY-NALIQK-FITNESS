import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Calculator, HeartPulse, Pencil, Trash2 } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { Button, Card, Empty, ErrorNote, Field, Input, NumberInput, PageHeader, SectionTitle, Select, Spinner, Stat, Textarea, useAsync } from '../components/ui'
import { deleteCardio, listCardio, loadLibrary, saveCardio } from '../lib/data'
import { addDays, estimateCalories, fmtDate, isoDate, startOfWeek } from '../lib/training'
import type { CardioSession } from '../lib/types'

type Draft = Omit<CardioSession, 'id'> & { id?: string }
const empty = (): Draft => ({
  exercise_id: null, activity: 'Treadmill Running', performed_on: isoDate(new Date()), duration_min: 30, distance_km: null, speed_kmh: null,
  incline_pct: null, resistance: null, intensity: 'moderate', avg_hr: null, calories: null, calories_source: null, notes: null,
})

export default function Cardio() {
  const { profile } = useProfile()
  const [draft, setDraft] = useState<Draft>(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data, reload } = useAsync(async () => ({ lib: await loadLibrary(), sessions: await listCardio() }), [])

  if (!data) return <Spinner />
  const activities = data.lib.exercises.filter((e) => e.muscles.includes('cardio'))
  const week0 = startOfWeek()
  const thisWeek = data.sessions.filter((c) => new Date(c.performed_on + 'T12:00') >= week0 && new Date(c.performed_on + 'T12:00') < addDays(week0, 7))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function estimate() {
    if (!profile.weight_kg) return setError('Add your body weight in your profile to estimate calories.')
    set('calories', estimateCalories(draft.activity, draft.duration_min, profile.weight_kg, draft.intensity))
    set('calories_source', 'estimated')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!draft.duration_min || draft.duration_min <= 0 || draft.duration_min > 1440) return setError('Duration must be between 1 and 1440 minutes.')
    if (draft.avg_hr != null && (draft.avg_hr < 30 || draft.avg_hr > 240)) return setError('Heart rate must be between 30 and 240 bpm.')
    if (draft.incline_pct != null && (draft.incline_pct < -10 || draft.incline_pct > 40)) return setError('Incline must be between -10% and 40%.')
    setBusy(true)
    try {
      const ex = activities.find((a) => a.name === draft.activity)
      await saveCardio({ ...draft, exercise_id: ex?.id ?? null, calories_source: draft.calories == null ? null : draft.calories_source ?? 'imported' })
      setDraft(empty()); reload()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const selected = activities.find((a) => a.name === draft.activity)

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Conditioning" title="Cardio">Log runs, rides, rows and intervals. Duration and distance feed your analytics and coach.</PageHeader>

      <Card className="mb-6 grid grid-cols-2 gap-6 p-5 sm:grid-cols-4">
        <Stat label="Sessions this week" value={thisWeek.length} />
        <Stat label="Minutes this week" value={Math.round(thisWeek.reduce((n, c) => n + c.duration_min, 0))} accent />
        <Stat label="Distance this week" value={`${thisWeek.reduce((n, c) => n + (c.distance_km ?? 0), 0).toFixed(1)} km`} />
        <Stat label="Calories this week" value={thisWeek.reduce((n, c) => n + (c.calories ?? 0), 0)} sub="estimated + imported" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="p-5">
          <SectionTitle>{draft.id ? 'Edit session' : 'Log a session'}</SectionTitle>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
              {selected && <ExerciseImage exercise={selected} className="size-14 shrink-0 rounded-lg" />}
              <Field label="Activity">
                <Select value={draft.activity} onChange={(e) => set('activity', e.target.value)}>
                  {activities.map((a) => <option key={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Date"><Input type="date" value={draft.performed_on} onChange={(e) => set('performed_on', e.target.value)} required /></Field>
            <Field label="Duration (min)"><NumberInput value={draft.duration_min} onChange={(v) => set('duration_min', v ?? 0)} min={1} max={1440} required /></Field>
            <Field label="Distance (km)"><NumberInput value={draft.distance_km} onChange={(v) => set('distance_km', v)} min={0} step={0.01} /></Field>
            <Field label="Speed (km/h)"><NumberInput value={draft.speed_kmh} onChange={(v) => set('speed_kmh', v)} min={0} step={0.1} /></Field>
            <Field label="Incline (%)"><NumberInput value={draft.incline_pct} onChange={(v) => set('incline_pct', v)} min={-10} max={40} step={0.5} /></Field>
            <Field label="Resistance level"><NumberInput value={draft.resistance} onChange={(v) => set('resistance', v)} min={0} max={100} /></Field>
            <Field label="Intensity">
              <Select value={draft.intensity ?? ''} onChange={(e) => set('intensity', (e.target.value || null) as Draft['intensity'])}>
                <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
              </Select>
            </Field>
            <Field label="Avg heart rate (bpm)" hint="If available"><NumberInput value={draft.avg_hr} onChange={(v) => set('avg_hr', v)} min={30} max={240} /></Field>
            <Field label="Calories" hint={draft.calories_source === 'estimated' ? 'Estimated (MET formula)' : 'Enter from your watch, or estimate'}>
              <div className="flex gap-1.5">
                <NumberInput value={draft.calories} onChange={(v) => { set('calories', v); set('calories_source', 'imported') }} min={0} />
                <Button type="button" variant="ghost" onClick={estimate} aria-label="Estimate calories" title="Estimate"><Calculator className="size-4" /></Button>
              </div>
            </Field>
            <div className="col-span-2 sm:col-span-3"><Field label="Notes"><Textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={2} /></Field></div>
            <div className="col-span-2 sm:col-span-3"><ErrorNote error={error} /></div>
            <div className="col-span-2 flex gap-2 sm:col-span-3">
              <Button type="submit" variant="primary" busy={busy}>{draft.id ? 'Save changes' : 'Log session'}</Button>
              {draft.id && <Button type="button" variant="ghost" onClick={() => setDraft(empty())}>Cancel</Button>}
            </div>
          </form>
        </Card>

        <div>
          <SectionTitle>History</SectionTitle>
          {data.sessions.length ? (
            <Card className="divide-y divide-line/60">
              {data.sessions.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.activity}</p>
                    <p className="text-sm text-muted num">
                      {fmtDate(c.performed_on, { weekday: 'short', day: 'numeric', month: 'short' })} · {c.duration_min} min
                      {c.distance_km != null && ` · ${c.distance_km} km`}{c.avg_hr != null && ` · ${c.avg_hr} bpm`}
                      {c.calories != null && ` · ${c.calories} kcal${c.calories_source === 'estimated' ? ' (est.)' : ''}`}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setDraft(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => confirm('Delete this cardio session?') && deleteCardio(c.id).then(reload).catch((e) => setError(e.message))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
            </Card>
          ) : <Card><Empty icon={<HeartPulse className="size-8" />} title="No cardio logged">Your sessions appear here. <Link to="/library/cardio" className="text-accent">Browse cardio activities</Link>.</Empty></Card>}
        </div>
      </div>
    </div>
  )
}
