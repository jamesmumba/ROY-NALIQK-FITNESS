import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Check, Flame, Moon, Play, Trophy } from 'lucide-react'
import { useProfile } from '../auth'
import { ExerciseImage } from '../components/ExerciseImage'
import { Badge, Button, Card, Empty, ErrorNote, SectionTitle, Spinner, Stat, cx, useAsync } from '../components/ui'
import { getActiveProgram, listDoneSets, listRecommendations, listRecords, listSessions, loadLibrary, startSession } from '../lib/data'
import { addDays, DAYS, dayIndex, fmtDate, fmtDuration, fmtKg, fmtVolume, GOALS, isoDate, startOfWeek } from '../lib/training'
import { CHART } from './chart'

export default function Dashboard() {
  const { profile } = useProfile()
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data, error: loadError } = useAsync(async () => {
    const [lib, active, sets, sessions, records, recs] = await Promise.all([loadLibrary(), getActiveProgram(), listDoneSets(120), listSessions(500), listRecords(), listRecommendations()])
    return { lib, active, sets, sessions, records, openRecs: recs.filter((r) => r.status === 'open').length }
  }, [])

  const stats = useMemo(() => {
    if (!data) return null
    const { active, sets, sessions } = data
    const target = active?.workouts.filter((w) => w.day_of_week != null).length || profile.days_per_week || 3
    const week0 = startOfWeek()
    const inWeek = (start: Date) => sessions.filter((s) => { const t = new Date(s.started_at); return t >= start && t < addDays(start, 7) }).length
    let streak = 0
    for (let i = inWeek(week0) >= target ? 0 : 1; i < 104; i++) {
      if (inWeek(addDays(week0, -7 * i)) >= target) streak++
      else break
    }
    const volumeBySession = new Map<string, number>()
    for (const s of sets) volumeBySession.set(s.session_id, (volumeBySession.get(s.session_id) ?? 0) + s.weight * s.reps)
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(week0, -7 * (7 - i)), end = addDays(start, 7)
      const v = sets.filter((s) => { const t = new Date(s.date); return t >= start && t < end }).reduce((n, s) => n + s.weight * s.reps, 0)
      return { week: fmtDate(start), volume: Math.round(v) }
    })
    return {
      target, streak, thisWeek: inWeek(week0), volumeBySession, weekly,
      totalVolume: sets.reduce((n, s) => n + s.weight * s.reps, 0),
      doneDates: new Set(sessions.map((s) => isoDate(new Date(s.started_at)))),
    }
  }, [data, profile.days_per_week])

  if (loadError) return <ErrorNote error={loadError} />
  if (!data || !stats) return <Spinner />
  const { lib, active, sessions, records } = data
  const todayIdx = dayIndex(new Date())
  const today = active?.workouts.find((w) => w.day_of_week === todayIdx)
  const week0 = startOfWeek()
  const first = profile.full_name.split(' ')[0]

  async function start() {
    setStarting(true)
    try { nav(`/session/${await startSession(today ?? null)}`) } catch (e) { setError((e as Error).message); setStarting(false) }
  }

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="eyebrow mb-2">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="display text-5xl sm:text-6xl">Welcome back, <span className="text-accent">{first}</span></h1>
        <p className="mt-2 text-muted">
          Goal: <span className="text-fg">{profile.goal ? GOALS[profile.goal] : 'not set'}</span>
          <span className="mx-2 text-faint">·</span>
          Training {profile.active_env === 'home' ? 'at home' : 'at the gym'}
          {active && <><span className="mx-2 text-faint">·</span>{active.program.name}</>}
        </p>
      </header>

      <ErrorNote error={error} />
      {(() => {
        // only days since the programme existed can be missed
        const since = active ? new Date(active.program.created_at) : new Date()
        const missed = profile.notify_workouts ? (active?.workouts ?? []).filter((w) => {
          if (w.day_of_week == null || w.day_of_week >= todayIdx) return false
          const day = addDays(week0, w.day_of_week)
          return addDays(day, 1) > since && !stats.doneDates.has(isoDate(day))
        }) : []
        const recCount = profile.notify_coach ? data.openRecs : 0
        if (!missed.length && !recCount) return null
        return (
          <div className="mb-4 flex flex-wrap gap-2">
            {missed.length > 0 && <Link to="/planner" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">Missed this week: {missed.map((w) => w.name).join(', ')}</Link>}
            {recCount > 0 && <Link to="/coach" className="rounded-lg border border-accent/30 bg-accent-lo px-3 py-2 text-sm text-accent-hi">{recCount} open coach recommendation{recCount > 1 ? 's' : ''} →</Link>}
          </div>
        )
      })()}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Today */}
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Today · {DAYS[todayIdx]}</p>
              <h2 className="display text-3xl">{today ? today.name : 'Rest day'}</h2>
              {today && <p className="mt-1 text-sm text-muted">{today.exercises.length} exercises · {today.exercises.reduce((n, e) => n + e.sets.length, 0)} sets · ~{today.est_minutes ?? 60} min</p>}
            </div>
            {stats.doneDates.has(isoDate(new Date())) && <Badge tone="ok">Done</Badge>}
          </div>
          {today ? (
            <>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {today.exercises.slice(0, 6).map((e) => {
                  const ex = lib.byId.get(e.exercise_id)!
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-lg bg-bg/60 p-2">
                      <ExerciseImage exercise={ex} className="size-10 shrink-0 rounded" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{ex.name}</span>
                        <span className="block text-xs text-faint num">{e.sets.length} × {e.sets[0]?.target_reps}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" size="lg" onClick={start} busy={starting}><Play className="size-4 fill-current" /> Start workout</Button>
                <Button variant="ghost" size="lg" onClick={() => nav(`/workouts/${today.id}`)}>Edit</Button>
              </div>
            </>
          ) : (
            <div className="mt-4 flex items-start gap-3 text-sm text-muted">
              <Moon className="mt-0.5 size-4 shrink-0 text-faint" />
              <p>
                {active ? 'Recovery is where adaptation happens. A 20–30 minute walk or easy bike ride keeps you moving without adding fatigue.' : 'You have no active programme yet.'}{' '}
                <Link to={active ? '/cardio' : '/planner'} className="text-accent hover:underline">{active ? 'Log light cardio' : 'Create one in the planner'}</Link>
                {' '}or <button onClick={start} className="text-accent hover:underline">start a quick workout</button>.
              </p>
            </div>
          )}
        </Card>

        {/* Key stats */}
        <Card className="grid grid-cols-2 gap-x-4 gap-y-6 p-5 sm:p-6">
          <Stat label="Workouts" value={sessions.length} sub="completed all time" />
          <Stat label="Volume" value={fmtVolume(stats.totalVolume)} sub="last 120 days" />
          <Stat label="Streak" value={<span className="inline-flex items-center gap-1.5">{stats.streak}<Flame className="size-6 text-accent" /></span>} sub={`weeks hitting ${stats.target} sessions`} />
          <div>
            <p className="eyebrow">This week</p>
            <p className="display num mt-1.5 text-3xl">{stats.thisWeek}<span className="text-faint">/{stats.target}</span></p>
            <div className="mt-2 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (stats.thisWeek / stats.target) * 100)}%` }} /></div>
          </div>
        </Card>
      </div>

      {/* Weekly schedule */}
      <section className="mt-8">
        <SectionTitle action={<Link to="/planner" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1">Planner <ArrowRight className="size-3.5" /></Link>}>This week</SectionTitle>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((d, i) => {
            const w = active?.workouts.find((x) => x.day_of_week === i)
            const date = addDays(week0, i)
            const done = stats.doneDates.has(isoDate(date))
            return (
              <Link key={d} to={w ? `/workouts/${w.id}` : '/planner'}
                className={cx('rounded-lg border p-2 sm:p-3 min-h-24 transition-colors hover:border-faint', i === todayIdx ? 'border-accent bg-accent-lo' : 'border-line/60 bg-surface')}>
                <p className="eyebrow flex items-center justify-between">{d.slice(0, 3)} {done && <Check className="size-3.5 text-ok" aria-label="Completed" />}</p>
                <p className={cx('mt-2 text-xs sm:text-sm leading-tight', w ? 'text-fg font-medium' : 'text-faint')}>{w ? w.name : 'Rest'}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-5">
          <SectionTitle action={<Link to="/analytics" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1">Analytics <ArrowRight className="size-3.5" /></Link>}>Training volume</SectionTitle>
          {stats.totalVolume > 0 ? (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={stats.weekly} margin={{ left: -12, right: 4 }}>
                  <XAxis dataKey="week" {...CHART.axis} />
                  <YAxis {...CHART.axis} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}t` : v)} />
                  <Tooltip {...CHART.tooltip} formatter={(v) => [`${Number(v).toLocaleString()} kg`, 'Volume']} />
                  <Bar dataKey="volume" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No volume yet">Complete a workout and your weekly training volume appears here.</Empty>}
        </Card>

        <Card className="p-5">
          <SectionTitle>Personal records</SectionTitle>
          {records.length ? (
            <ul className="divide-y divide-line/60">
              {records.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Trophy className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{lib.byId.get(r.exercise_id)?.name}</span>
                      <span className="block text-xs text-faint">{fmtDate(r.achieved_on)} · {r.record_type === 'e1rm' ? `est. from ${r.weight} × ${r.reps}` : r.record_type === 'tested_1rm' ? 'tested 1RM' : `heaviest × ${r.reps}`}</span>
                    </span>
                  </span>
                  <span className="display num text-xl">{fmtKg(r.value)}{r.record_type === 'e1rm' && <span className="ml-1 text-xs text-faint normal-case">est</span>}</span>
                </li>
              ))}
            </ul>
          ) : <Empty title="No records yet">PRs are detected automatically when you finish a workout.</Empty>}
        </Card>
      </div>

      <section className="mt-8">
        <SectionTitle action={<Link to="/workouts?tab=history" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1">History <ArrowRight className="size-3.5" /></Link>}>Recent workouts</SectionTitle>
        {sessions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.slice(0, 6).map((s) => (
              <Link key={s.id} to={`/session/${s.id}`} className="rounded-xl border border-line/60 bg-surface p-4 hover:border-faint transition-colors">
                <p className="eyebrow">{fmtDate(s.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <p className="mt-1 font-semibold">{s.name}</p>
                <p className="mt-2 text-sm text-muted num">{fmtDuration(s.duration_seconds)} · {fmtVolume(stats.volumeBySession.get(s.id) ?? 0)}</p>
              </Link>
            ))}
          </div>
        ) : <Card><Empty title="Your first session is waiting">Start today’s workout above. Every set you log feeds your analytics and coach.</Empty></Card>}
      </section>
    </div>
  )
}
