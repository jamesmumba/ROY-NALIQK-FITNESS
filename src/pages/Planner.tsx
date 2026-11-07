import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, CalendarPlus, Check, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useProfile } from '../auth'
import { Badge, Button, Card, cx, Empty, ErrorNote, Field, Input, Modal, PageHeader, SectionTitle, Spinner, useAsync } from '../components/ui'
import { activateProgram, deleteProgram, getActiveProgram, listPrograms, listWorkouts, loadLibrary, updateProgram } from '../lib/data'
import { createProgramFromTemplate, recoveryWarnings, suggestTemplate, TEMPLATES, weeklyVolume } from '../lib/programs'
import { addDays, DAYS, fmtDate, isoDate, weeklySetTarget } from '../lib/training'
import type { Env } from '../lib/types'

const TRACKED = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

export default function Planner() {
  const { profile } = useProfile()
  const nav = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, reload } = useAsync(async () => {
    const [lib, programs, dated, active] = await Promise.all([loadLibrary(), listPrograms(), listWorkouts({ dated: true }), getActiveProgram()])
    return { lib, programs, dated: dated.filter((w) => !w.program_id), activeDays: active?.workouts ?? [] }
  }, [])

  const programId = selected ?? data?.programs.find((p) => p.is_active)?.id ?? data?.programs[0]?.id ?? null
  const program = data?.programs.find((p) => p.id === programId) ?? null
  const { data: days, reload: reloadDays } = useAsync(async () => (programId ? listWorkouts({ programId }) : []), [programId])

  const analysis = useMemo(() => {
    if (!data || !days) return null
    return { ...weeklyVolume(data.lib, days), warnings: recoveryWarnings(data.lib, days) }
  }, [data, days])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  if (!data) return <Spinner />
  const target = weeklySetTarget(profile.goal)
  const today = new Date()
  const next14 = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  const active = data.programs.find((p) => p.is_active)

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Daily & weekly programming" title="Workout Planner" actions={
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> New programme</Button>
      }>
        Build a weekly split from a template or from scratch. Every day, exercise, set and rep is yours to change.
      </PageHeader>
      <ErrorNote error={error} />

      {data.programs.length > 0 ? (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {data.programs.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p.id); setRenaming(null) }}
                className={cx('flex items-center gap-2 rounded-lg border px-3 h-10 text-sm transition-colors', p.id === programId ? 'border-accent bg-accent-lo text-fg' : 'border-line text-muted hover:text-fg')}>
                {p.is_active && <Star className="size-3.5 fill-accent text-accent" aria-label="Active" />}{p.name}
              </button>
            ))}
          </div>

          {program && (
            <Card className="p-4 sm:p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {renaming !== null ? (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (renaming.trim()) run('rename', async () => { await updateProgram(program.id, { name: renaming.trim() }); setRenaming(null); reload() }) }}>
                      <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={80} autoFocus aria-label="Programme name" />
                      <Button type="submit" size="md" variant="primary" busy={busy === 'rename'}>Save</Button>
                    </form>
                  ) : (
                    <h2 className="display text-3xl flex items-center gap-2">{program.name}
                      <button onClick={() => setRenaming(program.name)} className="text-faint hover:text-fg" aria-label="Rename programme"><Pencil className="size-4" /></button>
                    </h2>
                  )}
                  {program.description && <p className="mt-1 text-sm text-muted">{program.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {program.is_active ? <Badge tone="ok">Active programme</Badge>
                    : <Button size="sm" variant="primary" busy={busy === 'activate'} onClick={() => run('activate', async () => { await activateProgram(program.id); reload() })}><Check className="size-3.5" /> Make active</Button>}
                  <Button size="sm" variant="danger" busy={busy === 'delete'} onClick={() => confirm(`Delete “${program.name}” and all its workouts?`) && run('delete', async () => { await deleteProgram(program.id); setSelected(null); reload() })}><Trash2 className="size-3.5" /> Delete</Button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-7">
                {DAYS.map((d, i) => {
                  const list = (days ?? []).filter((w) => w.day_of_week === i)
                  return (
                    <div key={d} className="rounded-lg border border-line/60 bg-bg/50 p-2.5 min-h-32 flex flex-col">
                      <p className="eyebrow mb-2">{d}</p>
                      {list.map((w) => (
                        <Link key={w.id} to={`/workouts/${w.id}`} className="mb-1.5 block rounded-md bg-raised p-2 hover:ring-1 hover:ring-accent/60">
                          <p className="text-sm font-medium leading-tight">{w.name}</p>
                          <p className="mt-1 text-xs text-faint num">{w.exercises.length} ex · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</p>
                        </Link>
                      ))}
                      {!list.length && <p className="text-sm text-faint mb-2">Rest</p>}
                      <button onClick={() => nav(`/workouts/new?program=${program.id}&day=${i}&name=${encodeURIComponent(d + ' workout')}`)}
                        className="mt-auto inline-flex items-center gap-1 text-xs text-muted hover:text-accent"><Plus className="size-3" /> Add</button>
                    </div>
                  )
                })}
              </div>

              {analysis && (days?.length ?? 0) > 0 && (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <div>
                    <SectionTitle>Weekly volume per muscle</SectionTitle>
                    <p className="mb-3 text-xs text-faint">Target for your goal: {target.min}–{target.max} working sets per muscle per week, trained 2× where possible.</p>
                    <ul className="space-y-2">
                      {TRACKED.map((m) => {
                        const n = analysis.sets.get(m) ?? 0, f = analysis.freq.get(m)?.size ?? 0
                        const tone = n === 0 ? 'bg-line' : n < target.min ? 'bg-warn' : n > target.max ? 'bg-bad' : 'bg-ok'
                        return (
                          <li key={m} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-sm">
                            <span className="text-muted">{data.lib.groups.find((g) => g.slug === m)?.name}</span>
                            <div className="relative h-2 rounded-full bg-line/60">
                              <div className="absolute inset-y-0 rounded-full bg-ok/15" style={{ left: `${(target.min / 30) * 100}%`, width: `${((target.max - target.min) / 30) * 100}%` }} />
                              <div className={cx('relative h-full rounded-full', tone)} style={{ width: `${Math.min(100, (n / 30) * 100)}%` }} />
                            </div>
                            <span className="num text-right text-xs text-faint">{n} sets · {f}×/wk</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  <div>
                    <SectionTitle>Recovery check</SectionTitle>
                    {analysis.warnings.length ? (
                      <ul className="space-y-2">{analysis.warnings.map((w) => <li key={w} className="flex gap-2 text-sm text-muted"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{w}</li>)}</ul>
                    ) : <p className="flex gap-2 text-sm text-muted"><Check className="size-4 text-ok" /> No muscle is trained hard on back-to-back days.</p>}
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card><Empty icon={<CalendarPlus className="size-8" />} title="No programmes yet" action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> Create a programme</Button>}>
          Start from Push/Pull/Legs, Upper/Lower, a Bro split, full-body, or a blank week.</Empty></Card>
      )}

      {/* Daily planning */}
      <section className="mt-10">
        <SectionTitle action={<Button size="sm" onClick={() => nav(`/workouts/new?date=${isoDate(today)}`)}><CalendarPlus className="size-3.5" /> Plan a day</Button>}>Next 14 days</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {next14.map((d) => {
            const key = isoDate(d)
            const dated = data.dated.filter((w) => w.scheduled_date === key)
            const day = data.activeDays.filter((w) => w.day_of_week === (d.getDay() + 6) % 7)
            return (
              <div key={key} className={cx('rounded-lg border p-2.5 min-h-24', key === isoDate(today) ? 'border-accent/60' : 'border-line/60')}>
                <p className="eyebrow">{fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <div className="mt-2 space-y-1">
                  {day.map((w) => <Link key={w.id} to={`/workouts/${w.id}`} className="block text-sm hover:text-accent">{w.name}</Link>)}
                  {dated.map((w) => <Link key={w.id} to={`/workouts/${w.id}`} className="block text-sm text-accent-hi hover:underline">{w.name}</Link>)}
                  {!day.length && !dated.length && <button onClick={() => nav(`/workouts/new?date=${key}`)} className="text-xs text-faint hover:text-accent">+ Plan</button>}
                </div>
              </div>
            )
          })}
        </div>
        {!active && <p className="mt-2 text-xs text-faint">Activate a programme to see its days here.</p>}
      </section>

      <NewProgramModal open={creating} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); setSelected(id); reload(); reloadDays() }} />
    </div>
  )
}

function NewProgramModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { profile } = useProfile()
  const suggested = suggestTemplate(profile.days_per_week, profile.experience)
  const [key, setKey] = useState(suggested)
  const [name, setName] = useState('')
  const [env, setEnv] = useState<Env>(profile.active_env)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setError(null)
    try {
      const lib = await loadLibrary()
      const t = TEMPLATES.find((x) => x.key === key)!
      const id = await createProgramFromTemplate(lib, t, profile, env, name.trim() || undefined)
      onCreated(id)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New programme" wide>
      <div className="grid gap-2 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button key={t.key} onClick={() => setKey(t.key)} aria-pressed={key === t.key}
            className={cx('rounded-xl border p-3 text-left transition-colors', key === t.key ? 'border-accent bg-accent-lo' : 'border-line hover:border-faint')}>
            <p className="flex items-center justify-between gap-2 font-semibold">{t.name}{t.key === suggested && <Badge tone="accent">Suggested</Badge>}</p>
            <p className="mt-1 text-xs text-muted">{t.blurb}</p>
            <p className="mt-2 font-mono text-[0.65rem] text-faint">{t.week.map((d, i) => (d ? DAYS[i][0] : '·')).join(' ')}</p>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={TEMPLATES.find((t) => t.key === key)!.name} maxLength={80} /></Field>
        <Field label="Build for">
          <div className="flex gap-2">
            {(['gym', 'home'] as const).map((e) => (
              <button key={e} onClick={() => setEnv(e)} className={cx('h-10 flex-1 rounded-lg border text-sm capitalize', env === e ? 'border-accent bg-accent-lo' : 'border-line text-muted')}>{e}</button>
            ))}
          </div>
        </Field>
      </div>
      <p className="mt-3 text-xs text-faint">Exercises are picked for your level, goal and {env === 'home' ? 'home equipment' : 'gym'}, with sets balanced to a sensible weekly volume per muscle.</p>
      <div className="mt-4"><ErrorNote error={error} /></div>
      <Button variant="primary" size="lg" className="mt-4 w-full" busy={busy} onClick={create}>Create programme</Button>
    </Modal>
  )
}
