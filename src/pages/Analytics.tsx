import { useMemo, useState, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Camera, Trash2 } from 'lucide-react'
import { useProfile } from '../auth'
import { Button, Card, cx, Empty, ErrorNote, Field, Input, NumberInput, PageHeader, SectionTitle, Segmented, Select, Spinner, useAsync } from '../components/ui'
import { deleteMeasurement, deletePhoto, listCardio, listDoneSets, listMeasurements, listPhotos, listSessions, listSetCompletion, loadLibrary, saveMeasurement, uploadPhoto } from '../lib/data'
import { exerciseHistories, setsByMuscle } from '../lib/coach'
import { addDays, fmtDate, fmtVolume, isoDate, startOfWeek } from '../lib/training'
import type { Measurement } from '../lib/types'
import { CHART } from './chart'

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

function buckets(period: Period) {
  const now = new Date()
  if (period === 'daily') return Array.from({ length: 14 }, (_, i) => { const s = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), i - 13); return { label: fmtDate(s), start: s, end: addDays(s, 1) } })
  if (period === 'weekly') return Array.from({ length: 12 }, (_, i) => { const s = addDays(startOfWeek(), -7 * (11 - i)); return { label: fmtDate(s), start: s, end: addDays(s, 7) } })
  if (period === 'monthly') return Array.from({ length: 12 }, (_, i) => { const s = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { label: s.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1) } })
  return Array.from({ length: 5 }, (_, i) => { const y = now.getFullYear() - 4 + i; return { label: String(y), start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) } })
}

const MEASURES: [Exclude<keyof Measurement, 'id' | 'measured_on'>, string][] = [['weight_kg', 'Weight (kg)'], ['chest_cm', 'Chest'], ['waist_cm', 'Waist'], ['arms_cm', 'Arms'], ['shoulders_cm', 'Shoulders'], ['thighs_cm', 'Thighs'], ['calves_cm', 'Calves']]

export default function Analytics() {
  const { profile } = useProfile()
  const [period, setPeriod] = useState<Period>('weekly')
  const [exerciseId, setExerciseId] = useState<string>('')
  const { data, reload } = useAsync(async () => {
    const [lib, sets, sessions, cardio, measurements, completion, photos] = await Promise.all([
      loadLibrary(), listDoneSets(1900), listSessions(2000), listCardio(), listMeasurements(), listSetCompletion(1900), listPhotos(),
    ])
    return { lib, sets, sessions, cardio, measurements, completion, photos }
  }, [])

  const report = useMemo(() => {
    if (!data) return null
    const bs = buckets(period)
    const inB = (d: string | Date, b: { start: Date; end: Date }) => { const t = new Date(d); return t >= b.start && t < b.end }
    const series = bs.map((b) => {
      const sets = data.sets.filter((s) => inB(s.date, b))
      const cardio = data.cardio.filter((c) => inB(c.performed_on + 'T12:00', b))
      const comp = data.completion.filter((c) => inB(c.date, b))
      return {
        label: b.label,
        volume: Math.round(sets.reduce((n, s) => n + s.weight * s.reps, 0)),
        workouts: data.sessions.filter((s) => inB(s.started_at, b)).length,
        cardioMin: Math.round(cardio.reduce((n, c) => n + c.duration_min, 0)),
        distance: Math.round(cardio.reduce((n, c) => n + (c.distance_km ?? 0), 0) * 10) / 10,
        completion: comp.length ? Math.round((comp.filter((c) => c.completed).length / comp.length) * 100) : null,
      }
    })
    const muscles = setsByMuscle(data.lib, data.sets, bs[0].start.getTime(), bs.at(-1)!.end.getTime()).sets
    const distribution = [...muscles].filter(([m]) => m !== 'cardio').map(([m, n]) => ({ name: data.lib.groups.find((g) => g.slug === m)?.name ?? m, sets: n })).sort((a, b) => b.sets - a.sets)

    const w0 = startOfWeek(), w1 = addDays(w0, -7)
    const summarise = (start: Date, end: Date) => {
      const s = data.sets.filter((x) => inB(x.date, { start, end }))
      return {
        workouts: data.sessions.filter((x) => inB(x.started_at, { start, end })).length,
        sets: s.length,
        volume: s.reduce((n, x) => n + x.weight * x.reps, 0),
        cardio: data.cardio.filter((c) => inB(c.performed_on + 'T12:00', { start, end })).reduce((n, c) => n + c.duration_min, 0),
      }
    }
    return { series, distribution, thisWeek: summarise(w0, addDays(w0, 7)), lastWeek: summarise(w1, w0) }
  }, [data, period])

  const histories = useMemo(() => (data ? exerciseHistories(data.sets).filter((h) => h.sessions.some((s) => s.top > 0)) : []), [data])
  const chosen = histories.find((h) => h.exerciseId === exerciseId) ?? histories.sort((a, b) => b.sessions.length - a.sessions.length)[0]

  if (!data || !report) return <Spinner />
  const progression = chosen?.sessions.map((s) => ({ label: fmtDate(s.date), top: s.top, e1rm: Math.round(s.best * 10) / 10 })) ?? []
  const weekly = chosen ? Object.entries(chosen.sessions.reduce<Record<string, number>>((acc, s) => {
    const k = isoDate(startOfWeek(new Date(s.date))); acc[k] = Math.max(acc[k] ?? 0, s.top); return acc
  }, {})).slice(-8) : []
  const bodyweight = data.measurements.filter((m) => m.weight_kg).map((m) => ({ label: fmtDate(m.measured_on), weight: m.weight_kg }))

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Built from your logged sets" title="Performance Analytics" actions={
        <Segmented<Period> label="Reporting period" value={period} onChange={setPeriod} options={[
          { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
      } />

      {/* Week vs week */}
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line/60 sm:grid-cols-4">
        {([['Workouts', 'workouts', (v: number) => String(v)], ['Working sets', 'sets', (v: number) => String(v)], ['Volume', 'volume', fmtVolume], ['Cardio', 'cardio', (v: number) => `${Math.round(v)} min`]] as const).map(([label, key, fmt]) => {
          const a = report.thisWeek[key], b = report.lastWeek[key]
          const up = a >= b
          return (
            <div key={key} className="bg-surface p-4">
              <p className="eyebrow">{label} · this week</p>
              <p className="display num mt-1.5 text-3xl">{fmt(a)}</p>
              <p className={cx('mt-1 inline-flex items-center gap-1 text-xs', a === b ? 'text-faint' : up ? 'text-ok' : 'text-bad')}>
                {a !== b && (up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)} {fmt(b)} last week
              </p>
            </div>
          )
        })}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Training volume (kg)" empty={!report.series.some((s) => s.volume)}>
          <BarChart data={report.series} margin={{ left: -8, right: 4 }}>
            <CartesianGrid {...CHART.grid} /><XAxis dataKey="label" {...CHART.axis} /><YAxis {...CHART.axis} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}t` : v)} />
            <Tooltip {...CHART.tooltip} formatter={(v) => [`${Number(v).toLocaleString()} kg`, 'Volume']} />
            <Bar dataKey="volume" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Workout frequency & completion" empty={!report.series.some((s) => s.workouts)}>
          <ComposedChart data={report.series} margin={{ left: -20, right: 4 }}>
            <CartesianGrid {...CHART.grid} /><XAxis dataKey="label" {...CHART.axis} /><YAxis yAxisId="l" allowDecimals={false} {...CHART.axis} /><YAxis yAxisId="r" orientation="right" domain={[0, 100]} {...CHART.axis} unit="%" />
            <Tooltip {...CHART.tooltip} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
            <Bar yAxisId="l" dataKey="workouts" name="Workouts" fill={CHART.series[1]} radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" dataKey="completion" name="Sets completed %" stroke="var(--color-accent)" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ChartCard>
      </div>

      {/* Exercise progression */}
      <Card className="mt-4 p-5">
        <SectionTitle action={histories.length > 0 && (
          <Select value={chosen?.exerciseId ?? ''} onChange={(e) => setExerciseId(e.target.value)} className="w-auto max-w-[60vw]" aria-label="Exercise">
            {histories.map((h) => <option key={h.exerciseId} value={h.exerciseId}>{data.lib.byId.get(h.exerciseId)?.name}</option>)}
          </Select>
        )}>Strength progression</SectionTitle>
        {chosen ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_14rem]">
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={progression} margin={{ left: -12, right: 8 }}>
                  <CartesianGrid {...CHART.grid} /><XAxis dataKey="label" {...CHART.axis} /><YAxis {...CHART.axis} unit=" kg" width={60} domain={['dataMin - 5', 'auto']} />
                  <Tooltip {...CHART.tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="top" name="Heaviest set (actual)" stroke="var(--color-accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line dataKey="e1rm" name="Estimated 1RM" stroke={CHART.series[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="eyebrow mb-2">Best set by week</p>
              <ol className="space-y-1.5 text-sm">
                {weekly.map(([week, kg], i) => (
                  <li key={week} className="flex justify-between gap-3 num"><span className="text-muted">Week {i + 1} <span className="text-faint">({fmtDate(week)})</span></span><span className="font-medium">{kg} kg</span></li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-faint">Estimated 1RM uses the Epley formula and is not a tested lift.</p>
            </div>
          </div>
        ) : <Empty title="No weighted lifts yet">Log a few sessions to see per-exercise progression.</Empty>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Muscle group distribution (sets)" empty={!report.distribution.length} height={Math.max(220, report.distribution.length * 28)}>
          <BarChart data={report.distribution} layout="vertical" margin={{ left: 10, right: 16 }}>
            <XAxis type="number" allowDecimals={false} {...CHART.axis} /><YAxis type="category" dataKey="name" width={90} {...CHART.axis} />
            <Tooltip {...CHART.tooltip} />
            <Bar dataKey="sets" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Cardio duration & distance" empty={!report.series.some((s) => s.cardioMin)}>
          <BarChart data={report.series} margin={{ left: -16, right: 4 }}>
            <CartesianGrid {...CHART.grid} /><XAxis dataKey="label" {...CHART.axis} /><YAxis yAxisId="l" {...CHART.axis} /><YAxis yAxisId="r" orientation="right" {...CHART.axis} />
            <Tooltip {...CHART.tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="cardioMin" name="Minutes" fill={CHART.series[2]} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="r" dataKey="distance" name="Distance (km)" fill={CHART.series[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <Body data={data} bodyweight={bodyweight} defaultWeight={profile.weight_kg} reload={reload} />
    </div>
  )
}

function ChartCard({ title, empty, height = 240, children }: { title: string; empty: boolean; height?: number; children: React.ReactElement }) {
  return (
    <Card className="p-5">
      <SectionTitle>{title}</SectionTitle>
      {empty ? <Empty title="No data in this period">Logged workouts and cardio will appear here.</Empty>
        : <div style={{ height }}><ResponsiveContainer>{children}</ResponsiveContainer></div>}
    </Card>
  )
}

function Body({ data, bodyweight, defaultWeight, reload }: {
  data: { measurements: Measurement[]; photos: Awaited<ReturnType<typeof listPhotos>> }
  bodyweight: { label: string; weight: number | null }[]; defaultWeight: number | null; reload: () => void
}) {
  const blank = { measured_on: isoDate(new Date()), weight_kg: defaultWeight, chest_cm: null, waist_cm: null, arms_cm: null, shoulders_cm: null, thighs_cm: null, calves_cm: null }
  const [m, setM] = useState<Omit<Measurement, 'id'>>(blank)
  const [photo, setPhoto] = useState<{ file: File | null; date: string; note: string }>({ file: null, date: isoDate(new Date()), note: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn(); reload() } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (MEASURES.every(([k]) => m[k] == null)) return setError('Enter at least one measurement.')
    if (m.weight_kg != null && (m.weight_kg < 30 || m.weight_kg > 300)) return setError('Weight must be between 30 and 300 kg.')
    run('m', async () => { await saveMeasurement(m); setM(blank) })
  }

  return (
    <section className="mt-10">
      <h2 className="display mb-4 text-3xl">Body tracking</h2>
      <ErrorNote error={error} />
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Body weight" empty={bodyweight.length < 2}>
          <LineChart data={bodyweight} margin={{ left: -12, right: 8 }}>
            <CartesianGrid {...CHART.grid} /><XAxis dataKey="label" {...CHART.axis} /><YAxis {...CHART.axis} domain={['dataMin - 2', 'dataMax + 2']} unit=" kg" width={60} />
            <Tooltip {...CHART.tooltip} />
            <Line dataKey="weight" stroke="var(--color-accent)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
        <Card className="p-5">
          <SectionTitle>Log measurements</SectionTitle>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date"><Input type="date" value={m.measured_on} onChange={(e) => setM({ ...m, measured_on: e.target.value })} required /></Field>
            {MEASURES.map(([k, label]) => (
              <Field key={k} label={k === 'weight_kg' ? label : `${label} (cm)`}><NumberInput value={m[k] as number | null} onChange={(v) => setM({ ...m, [k]: v })} min={0} step={0.1} /></Field>
            ))}
            <Button type="submit" variant="primary" className="col-span-2 sm:col-span-4" busy={busy === 'm'}>Save measurements</Button>
          </form>
        </Card>
      </div>

      {data.measurements.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full text-sm num">
            <thead><tr className="border-b border-line/60 text-left text-xs text-faint"><th className="p-3 font-medium">Date</th>{MEASURES.map(([k, l]) => <th key={k} className="p-3 font-medium">{l.replace(' (kg)', '')}</th>)}<th /></tr></thead>
            <tbody>
              {[...data.measurements].reverse().map((r) => (
                <tr key={r.id} className="border-b border-line/40 last:border-0">
                  <td className="p-3">{fmtDate(r.measured_on, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  {MEASURES.map(([k]) => <td key={k} className="p-3 text-muted">{(r[k] as number | null) ?? '—'}</td>)}
                  <td className="p-2 text-right"><Button size="sm" variant="ghost" aria-label="Delete entry" onClick={() => run(`dm-${r.id}`, () => deleteMeasurement(r.id))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <SectionTitle>Progress photos <span className="ml-1 font-normal normal-case text-faint">(private, optional)</span></SectionTitle>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault()
          if (!photo.file) return setError('Choose a photo first.')
          if (photo.file.size > 10 * 1024 * 1024) return setError('Photos must be under 10 MB.')
          run('p', async () => { await uploadPhoto(photo.file!, photo.date, photo.note); setPhoto({ ...photo, file: null, note: '' }); (e.target as HTMLFormElement).reset() })
        }}>
          <Field label="Photo"><input type="file" accept="image/*" onChange={(e) => setPhoto({ ...photo, file: e.target.files?.[0] ?? null })} className="block text-sm text-muted file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:text-fg" /></Field>
          <Field label="Date"><Input type="date" value={photo.date} onChange={(e) => setPhoto({ ...photo, date: e.target.value })} /></Field>
          <Field label="Note"><Input value={photo.note} onChange={(e) => setPhoto({ ...photo, note: e.target.value })} placeholder="Front, relaxed" /></Field>
          <Button type="submit" busy={busy === 'p'}><Camera className="size-4" /> Upload</Button>
        </form>
        {data.photos.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.photos.map((p) => (
              <figure key={p.id} className="group relative overflow-hidden rounded-lg border border-line/60">
                <img src={p.url} alt={`Progress photo ${p.taken_on}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                <figcaption className="p-2 text-xs text-muted">{fmtDate(p.taken_on, { day: 'numeric', month: 'short', year: 'numeric' })}{p.note && ` · ${p.note}`}</figcaption>
                <button onClick={() => confirm('Delete this photo?') && run(`dp-${p.id}`, () => deletePhoto(p))} aria-label="Delete photo"
                  className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md bg-black/70 text-fg opacity-0 transition group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-4" /></button>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}
