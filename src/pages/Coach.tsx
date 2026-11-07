import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Check, RotateCcw, Trash2, X } from 'lucide-react'
import { useProfile } from '../auth'
import { Badge, Button, Card, cx, Empty, ErrorNote, Field, Input, NumberInput, PageHeader, SectionTitle, Segmented, Select, Spinner, useAsync } from '../components/ui'
import { addTestedMax, applyLoadToPlan, deleteRecord, getActiveProgram, listCardio, listDoneSets, listRecommendations, listRecords, listSessions, loadLibrary, setRecommendationStatus, storeRecommendations } from '../lib/data'
import { exerciseHistories, generateRecommendations, muscleAnalysis } from '../lib/coach'
import { fmtDate, fmtKg, isoDate, isoWeek, weeklySetTarget } from '../lib/training'
import type { Recommendation } from '../lib/types'

const KEY_LIFTS = ['barbell-bench-press', 'barbell-squats', 'deadlifts', 'barbell-overhead-press', 'barbell-rows', 'pull-ups']
const CATEGORY_TONE = { progression: 'ok', volume: 'warn', recovery: 'bad', cardio: 'accent', consistency: 'neutral', variation: 'accent' } as const

export default function Coach() {
  const { profile } = useProfile()
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [tested, setTested] = useState({ exercise: '', weight: null as number | null, date: isoDate(new Date()) })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recs, setRecs] = useState<Recommendation[] | null>(null)

  const { data, reload } = useAsync(async () => {
    const [lib, sets, sessions, cardio, active, records] = await Promise.all([
      loadLibrary(), listDoneSets(400), listSessions(500), listCardio(), getActiveProgram(), listRecords(),
    ])
    return { lib, sets, sessions, cardio, active, records }
  }, [])

  // Re-run the rules against fresh data and sync this week's recommendations with the result.
  useEffect(() => {
    if (!data) return
    const fresh = generateRecommendations({ lib: data.lib, profile, sets: data.sets, sessions: data.sessions, cardio: data.cardio, program: data.active?.workouts ?? null, programStart: data.active?.program.created_at ?? null })
    storeRecommendations(fresh, isoWeek(new Date())).then(listRecommendations).then(setRecs).catch((e) => setError(e.message))
  }, [data, profile])

  const analysis = useMemo(() => (data ? muscleAnalysis(data.lib, data.sets, profile) : []), [data, profile])

  const strength = useMemo(() => {
    if (!data) return []
    const hist = exerciseHistories(data.sets)
    const ids = new Set([...KEY_LIFTS.map((s) => data.lib.bySlug.get(s)?.id).filter(Boolean) as string[], ...hist.filter((h) => h.sessions.some((s) => s.top > 0)).map((h) => h.exerciseId)])
    return [...ids].map((id) => {
      const h = hist.find((x) => x.exerciseId === id)
      const tests = data.records.filter((r) => r.exercise_id === id && r.record_type === 'tested_1rm')
      const best = h?.sessions.reduce((a, s) => Math.max(a, s.best), 0) ?? 0
      const first = h?.sessions.find((s) => s.top > 0)
      return { id, name: data.lib.byId.get(id)!.name, best, top: h ? Math.max(...h.sessions.map((s) => s.top)) : 0, first: first?.top ?? 0, sessions: h?.sessions.length ?? 0, tested: tests[0] ?? null }
    })
  }, [data])

  if (!data) return <Spinner label="Analysing your training" />
  const period = isoWeek(new Date())
  const shown = (recs ?? []).filter((r) => (filter === 'open' ? r.status === 'open' : true))
  const target = weeklySetTarget(profile.goal)

  async function setStatus(r: Recommendation, status: Recommendation['status']) {
    setRecs((rs) => rs!.map((x) => (x.id === r.id ? { ...x, status } : x)))
    try { await setRecommendationStatus(r.id, status) } catch (e) { setError((e as Error).message) }
  }

  // exercise ids in the active programme, so a load increase can be written into the plan
  const planned = new Set((data.active?.workouts ?? []).flatMap((w) => w.exercises.map((e) => e.exercise_id)))
  const loadTarget = (r: Recommendation) => {
    const id = r.rule === 'increase_load' ? data.lib.bySlug.get(r.subject)?.id : undefined
    return id && planned.has(id) && typeof r.evidence.suggested === 'number' ? { id, weight: r.evidence.suggested } : null
  }

  async function applyToPlan(r: Recommendation, t: { id: string; weight: number }) {
    try {
      const n = await applyLoadToPlan(t.id, t.weight)
      await setStatus(r, 'implemented')
      setNotice(`${data!.lib.byId.get(t.id)?.name} is now planned at ${fmtKg(t.weight)} on ${n} programme day${n === 1 ? '' : 's'}.`)
    } catch (e) { setError((e as Error).message) }
  }

  async function logTested() {
    if (!tested.exercise || !tested.weight || tested.weight <= 0) return setError('Choose an exercise and enter the weight you lifted for one rep.')
    try { await addTestedMax(tested.exercise, tested.weight, tested.date); setTested({ ...tested, weight: null }); reload() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={`Rule-based analysis · ${data.sessions.length} sessions · ${data.sets.length} sets`} title="Fitness Coach">
        Recommendations come only from what you have logged, using transparent training rules. Each one shows the numbers behind it.
      </PageHeader>
      <ErrorNote error={error} />
      {notice && <p role="status" className="mb-4 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p>}

      <section>
        <SectionTitle action={<Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'History' }]} />}>Recommendations</SectionTitle>
        {!recs ? <Spinner /> : shown.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {shown.map((r) => (
              <li key={r.id}>
                <Card className={cx('h-full p-4 flex flex-col', r.status !== 'open' && 'opacity-70')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={CATEGORY_TONE[r.category]}>{r.category}</Badge>
                    <span className="text-xs text-faint">{r.period === period ? 'This week' : r.period}</span>
                    {r.status === 'implemented' && <Badge tone="ok">Implemented</Badge>}
                    {r.status === 'dismissed' && <Badge>Dismissed</Badge>}
                  </div>
                  <h3 className="mt-2 font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-muted">{r.message}</p>
                  <details className="mt-2 text-xs text-faint">
                    <summary className="cursor-pointer">Why: rule “{r.rule.replace(/_/g, ' ')}”</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono">{Object.entries(r.evidence).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : v}`).join('\n')}</pre>
                  </details>
                  <div className="mt-auto flex gap-2 pt-3">
                    {r.status === 'open' ? (
                      <>
                        {loadTarget(r)
                          ? <Button size="sm" variant="primary" onClick={() => applyToPlan(r, loadTarget(r)!)}><Check className="size-3.5" /> Apply to plan</Button>
                          : <Button size="sm" variant="primary" onClick={() => setStatus(r, 'implemented')}><Check className="size-3.5" /> I did this</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'dismissed')}><X className="size-3.5" /> Dismiss</Button>
                      </>
                    ) : <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'open')}><RotateCcw className="size-3.5" /> Reopen</Button>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card><Empty icon={<BrainCircuit className="size-8" />} title={filter === 'open' ? 'Nothing to act on right now' : 'No recommendations yet'}>
            {data.sessions.length < 2 ? 'Complete a couple of logged workouts and the coach will start analysing progression, volume and balance.' : 'Your training is on track against every rule. Keep logging.'}
          </Empty></Card>
        )}
      </section>

      <section className="mt-10">
        <SectionTitle>Muscle group analysis</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/60 text-left text-xs text-faint">
              <th className="px-2 py-3 sm:p-3 font-medium">Muscle</th><th className="px-2 py-3 sm:p-3 font-medium">Sets<span className="max-sm:hidden"> (7 d)</span></th><th className="px-2 py-3 sm:p-3 font-medium max-sm:hidden">Avg / week (4 wk)</th><th className="px-2 py-3 sm:p-3 font-medium max-sm:hidden">Frequency</th><th className="px-2 py-3 sm:p-3 font-medium">Volume</th><th className="px-2 py-3 sm:p-3 font-medium">Progress</th>
            </tr></thead>
            <tbody>
              {analysis.map((m) => (
                <tr key={m.slug} className="border-b border-line/40 last:border-0">
                  <td className="px-2 py-3 sm:p-3 font-medium">{m.name}</td>
                  <td className="px-2 py-3 sm:p-3 num">{m.weekSets}</td>
                  <td className="px-2 py-3 sm:p-3 num text-muted max-sm:hidden">{m.avgSets}</td>
                  <td className="px-2 py-3 sm:p-3 num text-muted max-sm:hidden">{m.frequency}× / wk</td>
                  <td className="px-2 py-3 sm:p-3"><Badge tone={m.volume === 'optimal' ? 'ok' : m.volume === 'under' ? 'warn' : 'bad'}>{m.volume === 'under' ? <>Under<span className="max-sm:hidden">trained</span></> : m.volume === 'excess' ? <>Excess<span className="max-sm:hidden">ive</span></> : 'On target'}</Badge></td>
                  <td className="px-2 py-3 sm:p-3"><Badge tone={m.trend === 'progressing' ? 'ok' : m.trend === 'stagnant' ? 'warn' : 'neutral'}>{m.trend}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line/60 p-3 text-xs text-faint">On target = {target.min}–{target.max} working sets in the last 7 days for your goal. Progress compares estimated 1RM on each muscle's main exercises over 6 weeks.</p>
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle>Strength & personal records</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/60 text-left text-xs text-faint">
              <th className="px-2 py-3 sm:p-3 font-medium">Exercise</th><th className="px-2 py-3 sm:p-3 font-medium">Heaviest set</th><th className="px-2 py-3 sm:p-3 font-medium max-sm:hidden">Change</th><th className="px-2 py-3 sm:p-3 font-medium">Est. 1RM</th><th className="px-2 py-3 sm:p-3 font-medium">Tested<span className="max-sm:hidden"> 1RM</span></th>
            </tr></thead>
            <tbody>
              {strength.map((s) => (
                <tr key={s.id} className="border-b border-line/40 last:border-0">
                  <td className="px-2 py-3 sm:p-3 font-medium">{s.name}</td>
                  <td className="px-2 py-3 sm:p-3 num">{s.top ? fmtKg(s.top) : '—'}</td>
                  <td className={cx('px-2 py-3 sm:p-3 num max-sm:hidden', s.top > s.first ? 'text-ok' : 'text-faint')}>{s.sessions > 1 && s.first ? `${s.top - s.first >= 0 ? '+' : ''}${s.top - s.first} kg` : '—'}</td>
                  <td className="px-2 py-3 sm:p-3 num text-muted">{s.best ? <>{fmtKg(Math.round(s.best * 10) / 10)} <span className="text-xs text-faint">est.</span></> : '—'}</td>
                  <td className="px-2 py-3 sm:p-3 num">{s.tested ? (
                    <span className="inline-flex items-center gap-2">{fmtKg(s.tested.value)} <span className="text-xs text-faint">{fmtDate(s.tested.achieved_on)}</span>
                      <button onClick={() => deleteRecord(s.tested!.id).then(reload)} className="text-faint hover:text-bad" aria-label="Delete tested max"><Trash2 className="size-3.5" /></button></span>
                  ) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="mt-3 flex flex-wrap items-end gap-3 p-4">
          <Field label="Log a tested 1RM">
            <Select value={tested.exercise} onChange={(e) => setTested({ ...tested, exercise: e.target.value })} className="min-w-56">
              <option value="">Choose exercise</option>
              {data.lib.exercises.filter((e) => e.classification === 'compound').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Weight (kg)"><NumberInput value={tested.weight} onChange={(v) => setTested({ ...tested, weight: v })} min={0} step={0.5} className="w-28" /></Field>
          <Field label="Date"><Input type="date" value={tested.date} onChange={(e) => setTested({ ...tested, date: e.target.value })} /></Field>
          <Button onClick={logTested}>Save tested max</Button>
        </Card>
      </section>
    </div>
  )
}
