import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, Heart, House, Plus, Video, Warehouse } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { Badge, Button, Card, ErrorNote, Modal, SectionTitle, Spinner, cx, useAsync } from '../components/ui'
import { getWorkout, listDoneSets, listFavorites, listWorkouts, loadLibrary, saveWorkout, setFavorite } from '../lib/data'
import { alternatives, availableEquipment } from '../lib/recommend'
import { e1rm, fmtDate, fmtKg, prescription } from '../lib/training'
import type { Exercise } from '../lib/types'

export default function ExerciseDetail() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { profile } = useProfile()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, setData } = useAsync(async () => {
    const [lib, favorites, sets, workouts] = await Promise.all([loadLibrary(), listFavorites(), listDoneSets(400), listWorkouts()])
    return { lib, favorites, sets, workouts }
  }, [])

  if (!data) return <Spinner />
  const ex = data.lib.bySlug.get(slug)
  if (!ex) return <Navigate to="/library" replace />

  const fav = data.favorites.includes(ex.id)
  const mine = data.sets.filter((s) => s.exercise_id === ex.id && s.weight > 0)
  const best = mine.reduce<{ v: number; w: number; r: number; d: string } | null>((b, s) => {
    const v = e1rm(s.weight, s.reps)
    return v > 0 && (!b || v > b.v) ? { v, w: s.weight, r: s.reps, d: s.date } : b
  }, null)
  const groups = ex.muscles.map((m) => data.lib.groups.find((g) => g.slug === m)?.name).join(', ')
  const homeAlts = alternatives(data.lib.exercises, ex, 'home', availableEquipment(profile, 'home'))
  const gymAlts = alternatives(data.lib.exercises, ex, 'gym', null)

  async function toggleFav() {
    setData({ ...data!, favorites: fav ? data!.favorites.filter((f) => f !== ex!.id) : [...data!.favorites, ex!.id] })
    try { await setFavorite(ex!.id, !fav) } catch (e) { setError((e as Error).message) }
  }

  async function addTo(workoutId: string) {
    setBusy(workoutId)
    try {
      const w = await getWorkout(workoutId)
      const p = prescription(profile.goal, ex!.classification)
      await saveWorkout({ ...w, exercises: [...w.exercises, {
        exercise_id: ex!.id, position: w.exercises.length, set_type: 'straight', superset_group: null, intensity: 'moderate', rest_seconds: p.rest, notes: null,
        sets: Array.from({ length: p.sets }, (_, i) => ({ set_number: i + 1, target_reps: p.reps, target_weight: 0 })),
      }] })
      nav(`/workouts/${workoutId}`)
    } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  return (
    <div className="animate-rise">
      <Link to={`/library/${ex.muscles[0] && ['quads', 'hamstrings', 'glutes', 'calves'].includes(ex.muscles[0]) ? 'legs' : ex.muscles[0]}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {groups}</Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <ExerciseImage exercise={ex} animate className="aspect-[4/3] w-full rounded-2xl" />
          <p className="mt-2 text-xs text-faint">Alternating start and end positions. <a className="text-accent hover:underline" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' exercise form')}`} target="_blank" rel="noreferrer"><Video className="inline size-3.5" /> Watch video demonstrations</a></p>
        </div>

        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ex.classification === 'compound' ? 'accent' : 'neutral'}>{ex.classification}</Badge>
            <Badge>{ex.difficulty}</Badge>
            {ex.environments.map((e) => <Badge key={e} tone="ok">{e}</Badge>)}
          </div>
          <h1 className="display mt-3 text-5xl">{ex.name}</h1>
          <p className="mt-3 text-muted">{ex.description}</p>

          <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line/60 text-center">
            {[['Sets', ex.rec_sets, ''], ['Reps', ex.rec_reps, ''], ['Rest', ex.rest_seconds || '—', ex.rest_seconds ? 'sec' : '']].map(([k, v, unit]) => (
              <div key={k} className="bg-surface py-4"><dt className="eyebrow">{k}</dt><dd className="display num mt-1 text-2xl normal-case">{v}{unit && <span className="ml-1 text-sm text-faint">{unit}</span>}</dd></div>
            ))}
          </dl>

          <dl className="mt-5 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-faint">Primary</dt><dd>{groups}</dd>
            <dt className="text-faint">Secondary</dt><dd className="capitalize">{ex.secondary_muscles.join(', ') || '—'}</dd>
            <dt className="text-faint">Equipment</dt><dd className="capitalize">{ex.equipment.map((q) => data.lib.equipment.find((e) => e.slug === q)?.name ?? q).join(', ')}</dd>
            {best && <><dt className="text-faint">Your best</dt><dd className="num">{fmtKg(Math.round(best.v * 10) / 10)} est. 1RM <span className="text-faint">({best.w} kg × {best.r}, {fmtDate(best.d)})</span></dd></>}
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" /> Add to workout</Button>
            <Button onClick={toggleFav} aria-pressed={fav}><Heart className={cx('size-4', fav && 'fill-accent text-accent')} /> {fav ? 'Favourite' : 'Add to favourites'}</Button>
          </div>
          <div className="mt-3"><ErrorNote error={error} /></div>
        </div>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>How to perform it</SectionTitle>
          <ol className="space-y-3">
            {ex.instructions.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="display num text-xl text-accent w-6 shrink-0">{i + 1}</span><span className="text-muted pt-0.5">{s}</span></li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <SectionTitle>Common mistakes</SectionTitle>
          <ul className="space-y-2.5">
            {ex.common_mistakes.map((m) => <li key={m} className="flex gap-2.5 text-sm text-muted"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{m}</li>)}
          </ul>
        </Card>
      </div>

      {ex.classification !== 'cardio' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Alts title="Home alternatives" icon={<House className="size-4" />} items={homeAlts} empty="No home alternatives with your equipment. Add equipment in your profile." />
          <Alts title="Gym alternatives" icon={<Warehouse className="size-4" />} items={gymAlts} empty="No gym alternatives." />
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={`Add ${ex.name} to…`}>
        <Button variant="primary" className="w-full" onClick={() => nav(`/workouts/new?exercise=${ex.slug}`)}><Plus className="size-4" /> New workout</Button>
        <ul className="mt-4 divide-y divide-line/60">
          {data.workouts.map((w) => (
            <li key={w.id}>
              <button className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-accent disabled:opacity-50" disabled={!!busy} onClick={() => addTo(w.id)}>
                <span><span className="block font-medium">{w.name}</span><span className="text-xs text-faint">{w.program_id ? 'Programme day' : w.scheduled_date ? `Scheduled ${w.scheduled_date}` : 'Template'} · {w.exercises.length} exercises</span></span>
                {busy === w.id ? <span className="text-xs text-muted">Adding…</span> : <Plus className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}

function Alts({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: Exercise[]; empty: string }) {
  return (
    <Card className="p-5">
      <SectionTitle><span className="inline-flex items-center gap-2">{icon}{title}</span></SectionTitle>
      {items.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id}>
              <Link to={`/exercise/${a.slug}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-raised">
                <ExerciseImage exercise={a} className="size-11 shrink-0 rounded" />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.name}</span><span className="text-xs text-faint capitalize">{a.classification} · {a.difficulty}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">{empty}</p>}
    </Card>
  )
}
