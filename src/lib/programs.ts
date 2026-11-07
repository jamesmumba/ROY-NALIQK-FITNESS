import { createProgram, saveWorkout, type Library } from './data'
import { recommendExercises, availableEquipment } from './recommend'
import { muscleCredit, prescription, weeklySetTarget, DAYS } from './training'
import type { Classification, Env, Profile, WorkoutExercise, WorkoutWithExercises } from './types'

type Slot = [muscle: string, cls: Classification, count: number]
interface DayPlan { name: string; focus: string[]; slots: Slot[]; note?: string }

const DAY: Record<string, DayPlan> = {
  push: { name: 'Push', focus: ['chest', 'shoulders', 'triceps'], slots: [['chest', 'compound', 2], ['shoulders', 'compound', 1], ['chest', 'isolation', 1], ['shoulders', 'isolation', 1], ['triceps', 'isolation', 1]] },
  pull: { name: 'Pull', focus: ['back', 'biceps'], slots: [['back', 'compound', 3], ['back', 'isolation', 1], ['biceps', 'isolation', 2]] },
  legs: { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'], slots: [['quads', 'compound', 2], ['hamstrings', 'compound', 1], ['glutes', 'compound', 1], ['quads', 'isolation', 1], ['hamstrings', 'isolation', 1], ['calves', 'isolation', 1]] },
  legsCore: { name: 'Legs & Core', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'], slots: [['quads', 'compound', 1], ['hamstrings', 'compound', 1], ['glutes', 'compound', 1], ['quads', 'isolation', 1], ['calves', 'isolation', 1], ['core', 'compound', 1]] },
  pullCore: { name: 'Back, Biceps & Core', focus: ['back', 'biceps', 'core'], slots: [['back', 'compound', 2], ['back', 'isolation', 1], ['biceps', 'isolation', 2], ['core', 'compound', 1]] },
  upper: { name: 'Upper Body', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], slots: [['chest', 'compound', 1], ['back', 'compound', 2], ['shoulders', 'compound', 1], ['chest', 'isolation', 1], ['biceps', 'isolation', 1], ['triceps', 'isolation', 1]] },
  lower: { name: 'Lower Body', focus: ['quads', 'hamstrings', 'glutes', 'calves'], slots: [['quads', 'compound', 1], ['hamstrings', 'compound', 1], ['glutes', 'compound', 1], ['quads', 'isolation', 1], ['hamstrings', 'isolation', 1], ['calves', 'isolation', 1]] },
  cardioCore: { name: 'Cardio & Core', focus: ['core', 'cardio'], slots: [['core', 'compound', 1], ['core', 'isolation', 2]], note: 'Add 20–30 min of cardio and log it on the Cardio page.' },
  chest: { name: 'Chest', focus: ['chest'], slots: [['chest', 'compound', 3], ['chest', 'isolation', 2]] },
  back: { name: 'Back', focus: ['back'], slots: [['back', 'compound', 4], ['back', 'isolation', 1]] },
  shoulders: { name: 'Shoulders', focus: ['shoulders'], slots: [['shoulders', 'compound', 2], ['shoulders', 'isolation', 3]] },
  arms: { name: 'Arms', focus: ['biceps', 'triceps'], slots: [['triceps', 'compound', 1], ['biceps', 'isolation', 3], ['triceps', 'isolation', 2]] },
  fullA: { name: 'Full Body A', focus: ['quads', 'chest', 'back', 'shoulders', 'hamstrings', 'core'], slots: [['quads', 'compound', 1], ['chest', 'compound', 1], ['back', 'compound', 1], ['shoulders', 'compound', 1], ['hamstrings', 'compound', 1], ['core', 'compound', 1]] },
  fullB: { name: 'Full Body B', focus: ['hamstrings', 'back', 'chest', 'glutes', 'biceps', 'triceps'], slots: [['hamstrings', 'compound', 1], ['back', 'compound', 1], ['chest', 'compound', 1], ['glutes', 'compound', 1], ['biceps', 'isolation', 1], ['triceps', 'isolation', 1]] },
}

export interface SplitTemplate { key: string; name: string; days: number; blurb: string; week: (string | null)[] }

// week[0] = Monday … week[6] = Sunday; null = rest
export const TEMPLATES: SplitTemplate[] = [
  { key: 'ppl', name: 'Push / Pull / Legs', days: 5, blurb: 'Each muscle twice a week with a mid-week rest. The classic hypertrophy split.', week: ['push', 'pull', 'legsCore', 'cardioCore', 'push', 'pullCore', null] },
  { key: 'upper_lower', name: 'Upper / Lower', days: 5, blurb: 'Upper and lower twice a week, plus conditioning. Balanced strength and size.', week: ['upper', 'lower', null, 'upper', 'lower', 'cardioCore', null] },
  { key: 'bro', name: 'Bro Split', days: 6, blurb: 'One muscle group per day with high per-session volume.', week: ['chest', 'back', 'shoulders', 'legs', 'arms', 'cardioCore', null] },
  { key: 'full_body', name: 'Full Body', days: 3, blurb: 'Whole body three times a week. Best start for beginners and busy weeks.', week: ['fullA', null, 'fullB', null, 'fullA', null, null] },
  { key: 'three_day', name: '3-Day Split', days: 3, blurb: 'Push, pull and legs once each with recovery days between.', week: ['push', null, 'pull', null, 'legsCore', null, null] },
  { key: 'four_day', name: '4-Day Split', days: 4, blurb: 'Upper/lower twice with a rest day after each pair.', week: ['upper', 'lower', null, 'upper', 'lower', null, null] },
  { key: 'five_day', name: '5-Day Split', days: 5, blurb: 'Upper/lower then push/pull/legs for high frequency and volume.', week: ['upper', 'lower', null, 'push', 'pull', 'legs', null] },
  { key: 'six_day', name: '6-Day PPL', days: 6, blurb: 'Push/pull/legs twice a week. For experienced lifters with good recovery.', week: ['push', 'pull', 'legs', 'push', 'pull', 'legs', null] },
  { key: 'custom', name: 'Custom', days: 0, blurb: 'Start from an empty week and add your own workouts.', week: [null, null, null, null, null, null, null] },
]

/** Pick the template that best fits the days a user can train. */
export function suggestTemplate(days: number | null, level: Profile['experience']) {
  if (!days || days <= 3) return level === 'beginner' || !days ? 'full_body' : 'three_day'
  if (days === 4) return 'four_day'
  if (days === 5) return 'ppl'
  return level === 'advanced' ? 'six_day' : 'bro'
}

type Draft = { day: number; plan: DayPlan; exercises: WorkoutExercise[] }

export function buildWeek(lib: Library, template: SplitTemplate, profile: Profile, env: Env): Draft[] {
  const ctx = { env, equipment: availableEquipment(profile, env), level: profile.experience, goal: profile.goal, avoid: profile.avoid_exercises }
  const weekUse = new Map<string, number>()
  const drafts: Draft[] = []

  template.week.forEach((key, day) => {
    if (!key) return
    const plan = DAY[key]
    const used = new Set<string>()
    const exercises: WorkoutExercise[] = []
    for (const [muscle, cls, count] of plan.slots) {
      const ranked = recommendExercises(lib.exercises, muscle, ctx).filter((r) => r.exercise.classification !== 'cardio')
      const pool = ranked.some((r) => r.exercise.classification === cls) ? ranked.filter((r) => r.exercise.classification === cls) : ranked
      for (let i = 0; i < count; i++) {
        // prefer exercises not yet used this week so repeated days get variety
        const pick = pool.filter((r) => !used.has(r.exercise.id))
          .sort((a, b) => (weekUse.get(a.exercise.id) ?? 0) - (weekUse.get(b.exercise.id) ?? 0) || b.score - a.score)[0]
        if (!pick) break
        const ex = pick.exercise
        used.add(ex.id)
        weekUse.set(ex.id, (weekUse.get(ex.id) ?? 0) + 1)
        const p = prescription(profile.goal, ex.classification)
        exercises.push({
          exercise_id: ex.id, position: exercises.length, set_type: 'straight', superset_group: null, intensity: 'moderate',
          rest_seconds: p.rest, notes: null,
          sets: Array.from({ length: p.sets }, (_, k) => ({ set_number: k + 1, target_reps: p.reps, target_weight: 0 })),
        })
      }
    }
    drafts.push({ day, plan, exercises })
  })

  balanceVolume(lib, drafts.map((d) => d.exercises), profile.goal)
  return drafts
}

/**
 * Nudge set counts so each muscle's weekly working sets land inside the target range.
 * Exercises that train the muscle directly are adjusted first, then ones that train it indirectly,
 * and only when the change keeps every other muscle that exercise credits inside its range, so fixing
 * one muscle never pushes another back out.
 */
function balanceVolume(lib: Library, days: WorkoutExercise[][], goal: Profile['goal']) {
  const { min, max } = weeklySetTarget(goal)
  const all = days.flat()
  const credit = new Map(all.map((e) => [e, muscleCredit(lib.byId.get(e.exercise_id))]))
  const main = (e: WorkoutExercise) => lib.byId.get(e.exercise_id)?.muscles[0]
  const muscles = new Set(all.map(main).filter((m): m is string => !!m && m !== 'cardio'))
  const totals = () => {
    const t = new Map<string, number>()
    for (const e of all) for (const [m, w] of credit.get(e)!) t.set(m, (t.get(m) ?? 0) + w * e.sets.length)
    return t
  }
  const fits = (e: WorkoutExercise, m: string, t: Map<string, number>, dir: 1 | -1) =>
    [...credit.get(e)!].every(([k, w]) => k === m || !muscles.has(k) || (dir > 0 ? (t.get(k) ?? 0) + w <= max : (t.get(k) ?? 0) - w >= min))
  const direct = (e: WorkoutExercise, m: string) => credit.get(e)!.get(m) ?? 0

  for (let guard = 0; guard < 120; guard++) {
    const t = totals()
    let changed = false
    for (const m of muscles) {
      const n = t.get(m) ?? 0
      if (n < min) {
        const e = all.filter((x) => direct(x, m) > 0 && x.sets.length < 5 && fits(x, m, t, 1))
          .sort((a, b) => direct(b, m) - direct(a, m) || a.sets.length - b.sets.length)[0]
        if (e) { e.sets.push({ ...e.sets[e.sets.length - 1], set_number: e.sets.length + 1 }); changed = true; break }
      } else if (n > max) {
        const e = all.filter((x) => direct(x, m) > 0 && x.sets.length > 2 && fits(x, m, t, -1))
          .sort((a, b) => direct(b, m) - direct(a, m) || b.sets.length - a.sets.length)[0]
        if (e) { e.sets.pop(); changed = true; break }
      }
    }
    if (!changed) break
  }
}

export async function createProgramFromTemplate(lib: Library, template: SplitTemplate, profile: Profile, env: Env, name?: string) {
  const id = await createProgram({ name: name || template.name, split: template.key, description: template.blurb })
  await Promise.all(buildWeek(lib, template, profile, env).map((d) => saveWorkout({
    program_id: id, day_of_week: d.day, scheduled_date: null, name: d.plan.name, focus: d.plan.focus,
    is_template: false, est_minutes: profile.session_minutes ?? 60, notes: d.plan.note ?? null, exercises: d.exercises,
  })))
  return id
}

// ── Program analysis shown in the planner ───────────────────────────────
export function weeklyVolume(lib: Library, workouts: WorkoutWithExercises[]) {
  const sets = new Map<string, number>(), freq = new Map<string, Set<number>>()
  for (const w of workouts) for (const e of w.exercises) {
    for (const [m, credit] of muscleCredit(lib.byId.get(e.exercise_id))) {
      sets.set(m, (sets.get(m) ?? 0) + credit * e.sets.length)
      if (w.day_of_week != null) freq.set(m, (freq.get(m) ?? new Set()).add(w.day_of_week))
    }
  }
  for (const [m, n] of sets) sets.set(m, Math.round(n * 10) / 10)
  return { sets, freq }
}

export function recoveryWarnings(lib: Library, workouts: WorkoutWithExercises[]) {
  const byDay = new Map<number, Set<string>>()
  for (const w of workouts) {
    if (w.day_of_week == null) continue
    const s = byDay.get(w.day_of_week) ?? new Set<string>()
    for (const e of w.exercises) for (const m of lib.byId.get(e.exercise_id)?.muscles ?? []) if (m !== 'core' && m !== 'cardio' && m !== 'calves') s.add(m)
    byDay.set(w.day_of_week, s)
  }
  const out: string[] = []
  for (let d = 0; d < 7; d++) {
    const a = byDay.get(d), b = byDay.get((d + 1) % 7)
    if (!a || !b) continue
    const overlap = [...a].filter((m) => b.has(m))
    if (overlap.length) out.push(`${overlap.map((m) => lib.groups.find((g) => g.slug === m)?.name ?? m).join(', ')} trained on consecutive days (${DAYS[d]} → ${DAYS[(d + 1) % 7]}). Allow ~48 h between hard sessions for the same muscle.`)
  }
  return out
}
