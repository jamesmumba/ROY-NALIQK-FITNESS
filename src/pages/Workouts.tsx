import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CalendarPlus, Dumbbell, History, Play, Plus, Trash2, Zap } from 'lucide-react'
import { Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Segmented, Spinner, useAsync } from '../components/ui'
import { copyWorkout, deleteSession, deleteWorkout, listDoneSets, listSessions, listWorkouts, loadLibrary, startSession } from '../lib/data'
import { fmtDate, fmtDuration, fmtVolume, isoDate } from '../lib/training'
import type { WorkoutWithExercises } from '../lib/types'

type Tab = 'templates' | 'scheduled' | 'history'

export default function Workouts() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'templates'
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<WorkoutWithExercises | null>(null)
  const [date, setDate] = useState(isoDate(new Date()))

  const { data, reload } = useAsync(async () => {
    const [lib, templates, dated, sessions, sets] = await Promise.all([
      loadLibrary(), listWorkouts({ templates: true }), listWorkouts({ dated: true }), listSessions(200), listDoneSets(400),
    ])
    const volume = new Map<string, number>()
    for (const s of sets) volume.set(s.session_id, (volume.get(s.session_id) ?? 0) + s.weight * s.reps)
    return { lib, templates, dated: dated.filter((w) => !w.program_id), sessions, volume }
  }, [])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const start = (w: WorkoutWithExercises | null) => run(`start-${w?.id ?? 'quick'}`, async () => nav(`/session/${await startSession(w)}`))

  if (!data) return <Spinner />
  const today = isoDate(new Date())
  const upcoming = data.dated.filter((w) => w.scheduled_date! >= today).sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!))
  const past = data.dated.filter((w) => w.scheduled_date! < today)

  const WorkoutCard = ({ w, dated }: { w: WorkoutWithExercises; dated?: boolean }) => (
    <Card className="flex flex-col p-4">
      {dated && <p className="eyebrow mb-1">{fmtDate(w.scheduled_date!, { weekday: 'short', day: 'numeric', month: 'short' })}</p>}
      <Link to={`/workouts/${w.id}`} className="font-semibold hover:text-accent">{w.name}</Link>
      <p className="mt-1 text-sm text-muted line-clamp-2">{w.exercises.map((e) => data.lib.byId.get(e.exercise_id)?.name).join(' · ') || 'No exercises yet'}</p>
      <p className="mt-2 text-xs text-faint num">{w.exercises.length} exercises · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</p>
      <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-line/60 mt-auto">
        <Button size="sm" variant="primary" onClick={() => start(w)} busy={busy === `start-${w.id}`} disabled={!w.exercises.length}><Play className="size-3.5" /> Start</Button>
        <Button size="sm" variant="ghost" onClick={() => nav(`/workouts/${w.id}`)}>Edit</Button>
        {!dated && <Button size="sm" variant="ghost" onClick={() => setScheduling(w)}><CalendarPlus className="size-3.5" /> Schedule</Button>}
        <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Delete ${w.name}`}
          onClick={() => confirm(`Delete “${w.name}”?`) && run(`del-${w.id}`, async () => { await deleteWorkout(w.id); reload() })}><Trash2 className="size-3.5" /></Button>
      </div>
    </Card>
  )

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Build · Schedule · Review" title="My Workouts" actions={<>
        <Button onClick={() => start(null)} busy={busy === 'start-quick'}><Zap className="size-4" /> Quick start</Button>
        <Button variant="primary" onClick={() => nav('/workouts/new')}><Plus className="size-4" /> New workout</Button>
      </>}>
        Build your own sessions exercise by exercise, save them as templates, and schedule them on any date.
      </PageHeader>

      <Segmented<Tab> label="Section" value={tab} onChange={(t) => setParams({ tab: t })} options={[
        { value: 'templates', label: `Templates (${data.templates.length})` },
        { value: 'scheduled', label: `Scheduled (${upcoming.length})` },
        { value: 'history', label: `History (${data.sessions.length})` },
      ]} />

      <div className="mt-5"><ErrorNote error={error} /></div>

      {tab === 'templates' && (data.templates.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.templates.map((w) => <WorkoutCard key={w.id} w={w} />)}</div>
      ) : <Card className="mt-5"><Empty icon={<Dumbbell className="size-8" />} title="No templates yet" action={<Button variant="primary" onClick={() => nav('/workouts/new')}><Plus className="size-4" /> Build a workout</Button>}>
          Templates are reusable workouts. Build one once and start or schedule it whenever you like.</Empty></Card>)}

      {tab === 'scheduled' && (
        <>
          {upcoming.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{upcoming.map((w) => <WorkoutCard key={w.id} w={w} dated />)}</div>
          ) : <Card className="mt-5"><Empty icon={<CalendarPlus className="size-8" />} title="Nothing scheduled">Schedule a template, or plan a dated workout in the Workout Planner.</Empty></Card>}
          {past.length > 0 && (
            <>
              <h2 className="eyebrow mt-8 mb-3">Past dated workouts</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 opacity-80">{past.map((w) => <WorkoutCard key={w.id} w={w} dated />)}</div>
            </>
          )}
        </>
      )}

      {tab === 'history' && (data.sessions.length ? (
        <Card className="mt-5 divide-y divide-line/60">
          {data.sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-4 py-3">
              <div className="w-16 shrink-0">
                <p className="display num text-2xl leading-none">{new Date(s.started_at).getDate()}</p>
                <p className="eyebrow mt-1">{fmtDate(s.started_at, { month: 'short' })}</p>
              </div>
              <Link to={`/session/${s.id}`} className="min-w-0 flex-1 hover:text-accent">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-sm text-muted num">{fmtDuration(s.duration_seconds)} · {fmtVolume(data.volume.get(s.id) ?? 0)}</p>
              </Link>
              <Button size="sm" variant="ghost" aria-label="Delete session"
                onClick={() => confirm('Delete this session and its logged sets?') && run(`ds-${s.id}`, async () => { await deleteSession(s.id); reload() })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </Card>
      ) : <Card className="mt-5"><Empty icon={<History className="size-8" />} title="No completed workouts">Finished sessions are saved here with every set you logged.</Empty></Card>)}

      <Modal open={!!scheduling} onClose={() => setScheduling(null)} title={`Schedule ${scheduling?.name ?? ''}`}>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Button variant="primary" className="mt-4 w-full" busy={busy === 'schedule'} disabled={!date}
          onClick={() => run('schedule', async () => {
            await copyWorkout(scheduling!.id, { scheduled_date: date, is_template: false, program_id: null, day_of_week: null })
            setScheduling(null); reload(); setParams({ tab: 'scheduled' })
          })}>Add to schedule</Button>
      </Modal>
    </div>
  )
}
