import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Heart } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, NumberInput, PageHeader, SectionTitle, Select, Spinner, Textarea, useAsync } from '../components/ui'
import { listFavorites, listMeasurements, listPrograms, listSessions, loadLibrary } from '../lib/data'
import { fmtDate, fmtDuration, GOALS, LEVELS } from '../lib/training'
import type { Goal, Level, Profile } from '../lib/types'

const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

export default function ProfilePage() {
  const { profile, patchProfile } = useProfile()
  const [p, setP] = useState<Profile>(profile)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const { data } = useAsync(async () => {
    const [lib, favorites, programs, sessions, measurements] = await Promise.all([loadLibrary(), listFavorites(), listPrograms(), listSessions(10), listMeasurements()])
    return { lib, favorites, programs, sessions, measurements }
  }, [])

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'equipment' | 'target_muscles', v: string) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!p.full_name.trim()) return setMsg({ error: 'Name is required.' })
    if (p.age != null && (p.age < 13 || p.age > 100)) return setMsg({ error: 'Age must be between 13 and 100.' })
    if (p.height_cm != null && (p.height_cm < 100 || p.height_cm > 250)) return setMsg({ error: 'Height must be between 100 and 250 cm.' })
    if (p.weight_kg != null && (p.weight_kg < 30 || p.weight_kg > 300)) return setMsg({ error: 'Weight must be between 30 and 300 kg.' })
    setBusy(true)
    try {
      const { id: _id, ...patch } = p
      await patchProfile({ ...patch, full_name: p.full_name.trim() })
      setMsg({ ok: 'Profile saved.' })
    } catch (err) { setMsg({ error: (err as Error).message }) } finally { setBusy(false) }
  }

  if (!data) return <Spinner />

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Account" title="My Profile" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <form onSubmit={save} className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Personal information</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3"><Field label="Full name"><Input value={p.full_name} onChange={(e) => set('full_name', e.target.value)} maxLength={120} /></Field></div>
              <Field label="Age"><NumberInput value={p.age} onChange={(v) => set('age', v)} min={13} max={100} /></Field>
              <Field label="Height (cm)"><NumberInput value={p.height_cm} onChange={(v) => set('height_cm', v)} /></Field>
              <Field label="Weight (kg)"><NumberInput value={p.weight_kg} onChange={(v) => set('weight_kg', v)} step={0.1} /></Field>
              <Field label="Gender (optional)">
                <Select value={p.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}>
                  <option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Goals & training preferences</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary goal"><Select value={p.goal ?? ''} onChange={(e) => set('goal', e.target.value as Goal)}>{Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Experience"><Select value={p.experience ?? ''} onChange={(e) => set('experience', e.target.value as Level)}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Days per week"><NumberInput value={p.days_per_week} onChange={(v) => set('days_per_week', v)} min={1} max={7} /></Field>
              <Field label="Session length (min)"><NumberInput value={p.session_minutes} onChange={(v) => set('session_minutes', v)} min={10} max={240} /></Field>
              <Field label="Preferred environment">
                <Select value={p.environment} onChange={(e) => set('environment', e.target.value as Profile['environment'])}>
                  <option value="home">Home</option><option value="gym">Gym</option><option value="both">Home and gym</option>
                </Select>
              </Field>
            </div>
            <p className="eyebrow mt-5 mb-2">Muscles to prioritise</p>
            <div className="flex flex-wrap gap-1.5">{MUSCLES.map((m) => <Chip key={m} active={p.target_muscles.includes(m)} onClick={() => toggle('target_muscles', m)}>{data.lib.groups.find((g) => g.slug === m)?.name}</Chip>)}</div>
            <p className="eyebrow mt-5 mb-2">Home equipment</p>
            <div className="flex flex-wrap gap-1.5">{data.lib.equipment.filter((e) => e.home && e.slug !== 'bodyweight').map((e) => <Chip key={e.slug} active={p.equipment.includes(e.slug)} onClick={() => toggle('equipment', e.slug)}>{e.name}</Chip>)}</div>
          </Card>

          <Card className="p-5">
            <SectionTitle>History & limitations</SectionTitle>
            <div className="space-y-4">
              <Field label="Previous training experience"><Textarea value={p.training_history ?? ''} onChange={(e) => set('training_history', e.target.value || null)} maxLength={2000} /></Field>
              <Field label="Physical limitations"><Textarea value={p.limitations ?? ''} onChange={(e) => set('limitations', e.target.value || null)} maxLength={2000} /></Field>
              {p.avoid_exercises.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted">Exercises you avoid (tap to remove)</p>
                  <div className="flex flex-wrap gap-1.5">{p.avoid_exercises.map((id) => <Chip key={id} active onClick={() => set('avoid_exercises', p.avoid_exercises.filter((x) => x !== id))}>{data.lib.byId.get(id)?.name} ✕</Chip>)}</div>
                </div>
              )}
            </div>
          </Card>

          {msg.error && <ErrorNote error={msg.error} />}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="lg" busy={busy}>Save profile</Button>
            {msg.ok && <span className="text-sm text-ok">{msg.ok}</span>}
          </div>
        </form>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Favourite exercises</SectionTitle>
            {data.favorites.length ? (
              <ul className="space-y-1">
                {data.favorites.map((id) => data.lib.byId.get(id)).filter(Boolean).map((e) => (
                  <li key={e!.id}><Link to={`/exercise/${e!.slug}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-raised"><ExerciseImage exercise={e!} className="size-10 rounded" /><span className="text-sm font-medium">{e!.name}</span></Link></li>
                ))}
              </ul>
            ) : <Empty icon={<Heart className="size-6" />} title="No favourites">Tap the heart on any exercise to save it here.</Empty>}
          </Card>
          <Card className="p-5">
            <SectionTitle action={<Link to="/planner" className="text-sm text-muted hover:text-fg">Planner</Link>}>Saved programmes</SectionTitle>
            {data.programs.length ? <ul className="space-y-1.5 text-sm">{data.programs.map((pr) => <li key={pr.id} className="flex justify-between"><span>{pr.name}</span>{pr.is_active && <span className="text-xs text-ok">Active</span>}</li>)}</ul> : <p className="text-sm text-muted">None yet.</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle action={<Link to="/workouts?tab=history" className="text-sm text-muted hover:text-fg">All</Link>}>Workout history</SectionTitle>
            {data.sessions.length ? <ul className="space-y-1.5 text-sm">{data.sessions.map((s) => <li key={s.id}><Link to={`/session/${s.id}`} className="flex justify-between hover:text-accent"><span>{s.name}</span><span className="text-faint num">{fmtDate(s.started_at)} · {fmtDuration(s.duration_seconds)}</span></Link></li>)}</ul> : <p className="text-sm text-muted">No sessions yet.</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle action={<Link to="/analytics" className="text-sm text-muted hover:text-fg">Track</Link>}>Measurement history</SectionTitle>
            {data.measurements.length ? <ul className="space-y-1.5 text-sm num">{[...data.measurements].reverse().slice(0, 6).map((m) => <li key={m.id} className="flex justify-between"><span>{fmtDate(m.measured_on, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="text-muted">{m.weight_kg ? `${m.weight_kg} kg` : ''}{m.waist_cm ? ` · waist ${m.waist_cm} cm` : ''}</span></li>)}</ul> : <p className="text-sm text-muted">No measurements yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
