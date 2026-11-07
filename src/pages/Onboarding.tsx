import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useProfile } from '../auth'
import { Wordmark } from '../components/Layout'
import { Button, Chip, cx, ErrorNote, Field, Input, NumberInput, Select, Spinner, Textarea, useAsync } from '../components/ui'
import { activateProgram, loadLibrary } from '../lib/data'
import { createProgramFromTemplate, suggestTemplate, TEMPLATES } from '../lib/programs'
import { GOALS, LEVELS } from '../lib/training'
import type { Goal, Level, Profile } from '../lib/types'

const STEPS = ['About you', 'Goal', 'Environment', 'Schedule', 'History']
const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

export default function Onboarding() {
  const { profile, patchProfile } = useProfile()
  const nav = useNavigate()
  const { data: lib } = useAsync(loadLibrary, [])
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Profile>({ ...profile, experience: profile.experience ?? 'beginner', goal: profile.goal ?? 'hypertrophy', days_per_week: profile.days_per_week ?? 4, session_minutes: profile.session_minutes ?? 60 })
  const [avoidQuery, setAvoidQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'equipment' | 'target_muscles' | 'avoid_exercises', v: string) =>
    set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v])

  function validate(): string | null {
    if (step === 0) {
      if (!p.full_name.trim()) return 'Please enter your name.'
      if (!p.age || p.age < 13 || p.age > 100) return 'Age must be between 13 and 100.'
      if (!p.height_cm || p.height_cm < 100 || p.height_cm > 250) return 'Height must be between 100 and 250 cm.'
      if (!p.weight_kg || p.weight_kg < 30 || p.weight_kg > 300) return 'Weight must be between 30 and 300 kg.'
    }
    if (step === 3 && (!p.days_per_week || !p.session_minutes)) return 'Choose your training days and session length.'
    return null
  }

  async function next() {
    const v = validate()
    setError(v)
    if (v) return
    if (step < STEPS.length - 1) return setStep(step + 1)
    if (!lib) return
    setBusy(true)
    try {
      const final: Profile = { ...p, full_name: p.full_name.trim(), active_env: p.environment === 'home' ? 'home' : 'gym', onboarded: true }
      const { id: _id, ...patch } = final
      const template = TEMPLATES.find((t) => t.key === suggestTemplate(final.days_per_week, final.experience))!
      await patchProfile(patch)
      await activateProgram(await createProgramFromTemplate(lib, template, final, final.active_env))
      nav('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!lib) return <Spinner label="Preparing your setup" />
  const homeEquipment = lib.equipment.filter((e) => e.home && e.slug !== 'bodyweight')
  const avoidMatches = avoidQuery.trim().length > 1 ? lib.exercises.filter((e) => e.name.toLowerCase().includes(avoidQuery.toLowerCase())).slice(0, 6) : []

  return (
    <div className="min-h-dvh px-5 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Wordmark />
        <ol className="mt-10 mb-8 grid grid-cols-5 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className={cx('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
              <p className={cx('mt-2 hidden sm:block text-xs', i === step ? 'text-fg' : 'text-faint')}>{s}</p>
            </li>
          ))}
        </ol>

        <div key={step} className="animate-rise">
          {step === 0 && (
            <Section title="Tell us about you" sub="Used to size your programme and estimate calories.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name"><Input value={p.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
                <Field label="Age"><NumberInput value={p.age} onChange={(v) => set('age', v)} min={13} max={100} /></Field>
                <Field label="Height (cm)"><NumberInput value={p.height_cm} onChange={(v) => set('height_cm', v)} min={100} max={250} /></Field>
                <Field label="Weight (kg)"><NumberInput value={p.weight_kg} onChange={(v) => set('weight_kg', v)} min={30} max={300} step={0.1} /></Field>
                <Field label="Gender (optional)">
                  <Select value={p.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}>
                    <option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                  </Select>
                </Field>
              </div>
            </Section>
          )}

          {step === 1 && (
            <Section title="Experience and goal" sub="Sets your rep ranges, rest periods and weekly volume.">
              <p className="eyebrow mb-2">Experience</p>
              <div className="mb-6 grid grid-cols-3 gap-2">
                {(Object.keys(LEVELS) as Level[]).map((l) => <Option key={l} active={p.experience === l} onClick={() => set('experience', l)}>{LEVELS[l]}</Option>)}
              </div>
              <p className="eyebrow mb-2">Primary goal</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(GOALS) as Goal[]).map((g) => <Option key={g} active={p.goal === g} onClick={() => set('goal', g)}>{GOALS[g]}</Option>)}
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section title="Where do you train?" sub="You can switch between home and gym any time without losing your programmes.">
              <div className="mb-6 grid grid-cols-3 gap-2">
                {([['home', 'Home'], ['gym', 'Gym'], ['both', 'Both']] as const).map(([v, l]) => <Option key={v} active={p.environment === v} onClick={() => set('environment', v)}>{l}</Option>)}
              </div>
              {p.environment !== 'gym' && (
                <>
                  <p className="eyebrow mb-2">Equipment you have at home</p>
                  <div className="flex flex-wrap gap-2">
                    {homeEquipment.map((e) => <Chip key={e.slug} active={p.equipment.includes(e.slug)} onClick={() => toggle('equipment', e.slug)}>{e.name}</Chip>)}
                  </div>
                  <p className="mt-2 text-xs text-faint">Bodyweight exercises are always included.</p>
                </>
              )}
            </Section>
          )}

          {step === 3 && (
            <Section title="Your schedule" sub="We pick a split that fits your week and recovery.">
              <p className="eyebrow mb-2">Days per week</p>
              <div className="mb-6 grid grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <Option key={d} active={p.days_per_week === d} onClick={() => set('days_per_week', d)}>{d}</Option>)}
              </div>
              <p className="eyebrow mb-2">Session length</p>
              <div className="mb-6 grid grid-cols-4 gap-2">
                {[30, 45, 60, 90].map((m) => <Option key={m} active={p.session_minutes === m} onClick={() => set('session_minutes', m)}>{m} min</Option>)}
              </div>
              <p className="eyebrow mb-2">Muscles to prioritise (optional)</p>
              <div className="flex flex-wrap gap-2">
                {MUSCLES.map((m) => <Chip key={m} active={p.target_muscles.includes(m)} onClick={() => toggle('target_muscles', m)}>{lib.groups.find((g) => g.slug === m)?.name}</Chip>)}
              </div>
            </Section>
          )}

          {step === 4 && (
            <Section title="Training history" sub="Optional, but it helps us steer you away from problem movements.">
              <div className="space-y-4">
                <Field label="Previous training experience"><Textarea value={p.training_history ?? ''} onChange={(e) => set('training_history', e.target.value)} placeholder="e.g. 2 years of gym training, mostly machines" /></Field>
                <Field label="Physical limitations"><Textarea value={p.limitations ?? ''} onChange={(e) => set('limitations', e.target.value)} placeholder="e.g. old shoulder injury, avoid overhead pressing" /></Field>
                <Field label="Exercises to avoid" hint="Avoided exercises are never recommended or auto-programmed.">
                  <Input value={avoidQuery} onChange={(e) => setAvoidQuery(e.target.value)} placeholder="Search exercises" />
                </Field>
                {avoidMatches.length > 0 && (
                  <div className="flex flex-wrap gap-2">{avoidMatches.map((e) => <Chip key={e.id} active={p.avoid_exercises.includes(e.id)} onClick={() => toggle('avoid_exercises', e.id)}>{e.name}</Chip>)}</div>
                )}
                {p.avoid_exercises.length > 0 && (
                  <p className="text-sm text-muted">Avoiding: {p.avoid_exercises.map((id) => lib.byId.get(id)?.name).join(', ')}</p>
                )}
              </div>
              <div className="mt-8 rounded-xl border border-accent/30 bg-accent-lo p-4 text-sm">
                <p className="font-semibold text-fg">Your starting programme</p>
                <p className="mt-1 text-muted">
                  We will build a <span className="text-fg">{TEMPLATES.find((t) => t.key === suggestTemplate(p.days_per_week, p.experience))!.name}</span> programme
                  for {p.environment === 'home' ? 'home' : 'the gym'}, tuned for {GOALS[p.goal!].toLowerCase()}. Every exercise, set and rep stays editable.
                </p>
              </div>
            </Section>
          )}
        </div>

        <div className="mt-6"><ErrorNote error={error} /></div>
        <div className="mt-6 flex justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}><ArrowLeft className="size-4" /> Back</Button>
          <Button variant="primary" size="lg" onClick={next} busy={busy}>
            {step === STEPS.length - 1 ? <>Build my programme <Check className="size-4" /></> : <>Continue <ArrowRight className="size-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      <p className="mt-2 mb-8 text-muted">{sub}</p>
      {children}
    </section>
  )
}

function Option({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('h-12 rounded-lg border px-3 text-sm font-medium transition-colors', active ? 'border-accent bg-accent-lo text-fg' : 'border-line bg-surface text-muted hover:text-fg hover:border-faint')}>
      {children}
    </button>
  )
}
