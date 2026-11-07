// Transparent, rule-based coaching. Every recommendation cites the logged numbers that triggered it.
import type { Library } from './data'
import { alternatives, availableEquipment, recommendExercises } from './recommend'
import { e1rm, fmtKg, isoWeek, muscleCredit, weeklySetTarget } from './training'
import type { CardioSession, DoneSet, Profile, Recommendation, Session, WorkoutWithExercises } from './types'

export type NewRec = Omit<Recommendation, 'id' | 'status' | 'created_at'>

const DAY_MS = 86400000
const MAJOR = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps', 'core']
const LOWER = new Set(['quads', 'hamstrings', 'glutes'])
const r1 = (n: number) => Math.round(n * 10) / 10

export interface ExerciseHistory {
  exerciseId: string
  sessions: { sessionId: string; date: string; top: number; best: number; sets: DoneSet[] }[]
}

export function exerciseHistories(sets: DoneSet[]): ExerciseHistory[] {
  const by = new Map<string, Map<string, DoneSet[]>>()
  for (const s of sets) {
    const ex = by.get(s.exercise_id) ?? new Map<string, DoneSet[]>()
    ex.set(s.session_id, [...(ex.get(s.session_id) ?? []), s])
    by.set(s.exercise_id, ex)
  }
  return [...by].map(([exerciseId, sessions]) => ({
    exerciseId,
    sessions: [...sessions.values()].map((ss) => ({
      sessionId: ss[0].session_id, date: ss[0].date, sets: ss,
      top: Math.max(...ss.map((s) => s.weight)),
      best: Math.max(...ss.map((s) => e1rm(s.weight, s.reps))),
    })).sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

/** Working sets per muscle inside a time window: a full set for the main muscle, half for the others (see muscleCredit). */
export function setsByMuscle(lib: Library, sets: DoneSet[], fromMs: number, toMs = Date.now()) {
  const out = new Map<string, number>(), days = new Map<string, Set<string>>()
  for (const s of sets) {
    const t = new Date(s.date).getTime()
    if (t < fromMs || t > toMs) continue
    for (const [m, w] of muscleCredit(lib.byId.get(s.exercise_id))) {
      out.set(m, (out.get(m) ?? 0) + w)
      days.set(m, (days.get(m) ?? new Set()).add(s.date.slice(0, 10)))
    }
  }
  for (const [m, n] of out) out.set(m, r1(n))
  return { sets: out, days }
}

export interface MuscleStatus {
  slug: string; name: string; weekSets: number; frequency: number; avgSets: number
  volume: 'under' | 'optimal' | 'excess'; trend: 'progressing' | 'stagnant' | 'no data'
}

export function muscleAnalysis(lib: Library, sets: DoneSet[], profile: Profile): MuscleStatus[] {
  const now = Date.now()
  const week = setsByMuscle(lib, sets, now - 7 * DAY_MS)
  const month = setsByMuscle(lib, sets, now - 28 * DAY_MS)
  const target = weeklySetTarget(profile.goal)
  const hist = exerciseHistories(sets.filter((s) => new Date(s.date).getTime() > now - 42 * DAY_MS))
  return MAJOR.map((slug) => {
    const weekSets = week.sets.get(slug) ?? 0
    const relevant = hist.filter((h) => h.sessions.length >= 2 && lib.byId.get(h.exerciseId)?.muscles[0] === slug && h.sessions.at(-1)!.best > 0)
    const up = relevant.filter((h) => h.sessions.at(-1)!.best > h.sessions[0].best).length
    return {
      slug, name: lib.groups.find((g) => g.slug === slug)?.name ?? slug, weekSets,
      frequency: week.days.get(slug)?.size ?? 0,
      avgSets: r1((month.sets.get(slug) ?? 0) / 4),
      volume: weekSets < target.min ? 'under' : weekSets > target.max ? 'excess' : 'optimal',
      trend: !relevant.length ? 'no data' : up * 2 >= relevant.length ? 'progressing' : 'stagnant',
    }
  })
}

interface Input {
  lib: Library
  profile: Profile
  sets: DoneSet[]
  sessions: Session[]
  cardio: CardioSession[]
  program: WorkoutWithExercises[] | null
  programStart: string | null
}

export function generateRecommendations({ lib, profile, sets, sessions, cardio, program, programStart }: Input): NewRec[] {
  const now = Date.now()
  const period = isoWeek(new Date())
  const recs: NewRec[] = []
  const name = (id: string) => lib.byId.get(id)?.name ?? 'this exercise'
  const slug = (id: string) => lib.byId.get(id)?.slug ?? id
  const group = (m: string) => lib.groups.find((g) => g.slug === m)?.name.toLowerCase() ?? m
  const env = profile.active_env
  const equipment = availableEquipment(profile, env)
  const target = weeklySetTarget(profile.goal)
  const suggest = (m: string, n = 2) => recommendExercises(lib.exercises, m, { env, equipment, level: profile.experience, goal: profile.goal, avoid: profile.avoid_exercises })
    .filter((r) => r.exercise.classification !== 'cardio').slice(0, n).map((r) => r.exercise.name)

  // ── Per-exercise progression ──────────────────────────────────────────
  const declining: string[] = []
  for (const h of exerciseHistories(sets)) {
    const s = h.sessions
    const last = s.at(-1)
    if (!last || last.top <= 0) continue
    const ex = lib.byId.get(h.exerciseId)
    const isLower = ex?.muscles.some((m) => LOWER.has(m)) && ex.classification === 'compound'

    const hitAll = (x: typeof last) => x.sets.every((st) => st.planned_reps != null && st.reps >= st.planned_reps)
    const prev = s.at(-2)
    const readyToProgress = !!prev && hitAll(last) && hitAll(prev) && last.top === prev.top
    if (readyToProgress) {
      const inc = isLower ? 5 : ex?.equipment.includes('dumbbell') ? 2 : 2.5
      recs.push({
        rule: 'increase_load', subject: slug(h.exerciseId), category: 'progression', period,
        title: `Increase the load on ${name(h.exerciseId)}`,
        message: `You completed every prescribed rep on ${name(h.exerciseId)} at ${fmtKg(last.top)} in your last two sessions. Move to ${fmtKg(last.top + inc)} next time and keep the same rep target, as long as your form stays solid.`,
        evidence: { weight: last.top, sessions: 2, suggested: last.top + inc },
      })
    }
    let addingReps = false
    if (!readyToProgress && prev && !hitAll(last) && last.top === prev.top) {
      const repsNow = last.sets.reduce((n, x) => n + x.reps, 0), repsBefore = prev.sets.reduce((n, x) => n + x.reps, 0)
      addingReps = repsNow > repsBefore
      if (addingReps) recs.push({
        rule: 'add_reps', subject: slug(h.exerciseId), category: 'progression', period,
        title: `Add reps before weight on ${name(h.exerciseId)}`,
        message: `Your total reps on ${name(h.exerciseId)} at ${fmtKg(last.top)} rose from ${repsBefore} to ${repsNow}. Stay at this weight and add reps until every set reaches its target, then increase the load.`,
        evidence: { weight: last.top, repsBefore, repsNow },
      })
    }

    // when the next step is already "add load", a "hold your volume" note would contradict it
    const recent = s.filter((x) => new Date(x.date).getTime() > now - 28 * DAY_MS)
    if (!readyToProgress && recent.length >= 3 && recent.at(-1)!.top > recent[0].top) {
      const weeks = Math.max(1, Math.round((new Date(recent.at(-1)!.date).getTime() - new Date(recent[0].date).getTime()) / (7 * DAY_MS)))
      recs.push({
        rule: 'progressing', subject: slug(h.exerciseId), category: 'progression', period,
        title: `${name(h.exerciseId)} is progressing`,
        message: `You have improved your ${name(h.exerciseId).toLowerCase()} from ${fmtKg(recent[0].top)} to ${fmtKg(recent.at(-1)!.top)} over ${weeks} week${weeks > 1 ? 's' : ''}. Your ${group(ex?.muscles[0] ?? '')} training is progressing consistently. Consider maintaining your current volume before increasing the load further.`,
        evidence: { from: recent[0].top, to: recent.at(-1)!.top, weeks },
      })
    }

    // A plateau where every rep is hit is solved by adding load, and rising reps are progress, so neither is "stalled".
    // Only the last ~4 months count, so a best from before a long break does not flag a lift forever,
    // and only sessions with a usable 1RM estimate (≤ 12 reps).
    const est = s.filter((x) => x.best > 0 && new Date(x.date).getTime() > now - 120 * DAY_MS)
    if (est.length >= 4 && !readyToProgress && !addingReps) {
      const lastThree = Math.max(...est.slice(-3).map((x) => x.best))
      const before = Math.max(...est.slice(0, -3).map((x) => x.best))
      const span = new Date(est.at(-1)!.date).getTime() - new Date(est.at(-3)!.date).getTime()
      if (lastThree <= before && span >= 10 * DAY_MS && ex) {
        const alts = alternatives(lib.exercises, ex, env, equipment).slice(0, 2).map((a) => a.name)
        recs.push({
          rule: 'stalled', subject: slug(h.exerciseId), category: 'variation', period,
          title: `${name(h.exerciseId)} has stalled`,
          message: `Your estimated 1RM on ${name(h.exerciseId)} has not improved over your last 3 sessions (best ${fmtKg(r1(lastThree))} vs ${fmtKg(r1(before))} earlier).${alts.length ? ` Try swapping to ${alts.join(' or ')} for 4–6 weeks, then return.` : ' Try changing the rep range for 4–6 weeks.'}`,
          evidence: { recentBest: r1(lastThree), previousBest: r1(before), alternatives: alts },
        })
      }
    }

    if (est.length >= 3) {
      const [a, b, c] = est.slice(-3).map((x) => x.best)
      if (b < a * 0.95 && c < b * 0.97) declining.push(`${name(h.exerciseId)} (${r1(a)} → ${r1(b)} → ${r1(c)} kg e1RM)`)
    }
  }

  if (declining.length) recs.push({
    rule: 'recovery', subject: 'global', category: 'recovery', period,
    title: 'Performance is dipping — prioritise recovery',
    message: `Performance has dropped two sessions in a row on ${declining.slice(0, 3).join('; ')}. Consider an extra rest day, more sleep, or a lighter deload week (about 40% less volume) before pushing again.`,
    evidence: { exercises: declining },
  })

  // ── Muscle volume, balance and neglect ───────────────────────────────
  const week = setsByMuscle(lib, sets, now - 7 * DAY_MS).sets
  const month = setsByMuscle(lib, sets, now - 28 * DAY_MS).sets
  const fortnight = setsByMuscle(lib, sets, now - 14 * DAY_MS).sets
  const programmed = new Set((program ?? []).flatMap((w) => w.exercises.flatMap((e) => lib.byId.get(e.exercise_id)?.muscles ?? [])))
  const sessions14 = sessions.filter((s) => new Date(s.started_at).getTime() > now - 14 * DAY_MS).length

  for (const m of MAJOR) {
    if (m === 'core') continue
    const n = week.get(m) ?? 0
    const tracked = programmed.has(m) || profile.target_muscles.includes(m) || (month.get(m) ?? 0) > 0
    if (tracked && n > 0 && n < target.min) recs.push({
      rule: 'volume_low', subject: m, category: 'volume', period,
      title: `Raise ${group(m)} volume`,
      message: `You logged ${n} working set${n === 1 ? '' : 's'} for ${group(m)} in the last 7 days — below the ${target.min}–${target.max} sets/week range for your goal. Add about ${Math.ceil(target.min - n)} sets${suggest(m).length ? `, for example ${suggest(m).join(' or ')}` : ''}.`,
      evidence: { sets: n, ...target },
    })
    if (n > target.max + 4) recs.push({
      rule: 'volume_high', subject: m, category: 'volume', period,
      title: `Trim ${group(m)} volume`,
      message: `You logged ${n} sets for ${group(m)} this week, well above the ${target.max}-set upper range. Extra sets beyond this mostly add fatigue; cut 2–4 sets and put the effort into quality reps.`,
      evidence: { sets: n, ...target },
    })
    if (sessions14 >= 3 && !(fortnight.get(m)) && (programmed.has(m) || profile.target_muscles.includes(m) || !program)) recs.push({
      rule: 'undertrained', subject: m, category: 'volume', period,
      title: `${group(m)[0].toUpperCase() + group(m).slice(1)} need attention`,
      message: `You trained ${sessions14} times in the last 14 days but logged no ${group(m)} sets.${suggest(m).length ? ` Add ${suggest(m).join(' or ')} to your next suitable session.` : ''}`,
      evidence: { sessions: sessions14, sets: 0 },
    })
  }

  const quads = month.get('quads') ?? 0, hams = month.get('hamstrings') ?? 0
  if (quads >= 6 && hams < quads * 0.6) recs.push({
    rule: 'imbalance_hamstrings', subject: 'hamstrings', category: 'volume', period,
    title: 'Hamstrings are lagging behind quads',
    message: `Your weekly hamstring training volume is considerably lower than your quadriceps volume (${hams} vs ${quads} sets over 4 weeks). Consider incorporating ${suggest('hamstrings').join(' or ') || 'Romanian deadlifts or leg curls'} into your next lower-body session.`,
    evidence: { quads, hamstrings: hams },
  })
  const push = (month.get('chest') ?? 0) + (month.get('shoulders') ?? 0), pull = month.get('back') ?? 0
  if (push >= 10 && pull < push * 0.7) recs.push({
    rule: 'imbalance_pull', subject: 'back', category: 'volume', period,
    title: 'More pulling to balance your pressing',
    message: `Over 4 weeks you did ${push} chest and shoulder sets but only ${pull} back sets. Balance this with ${suggest('back').join(' or ')} to protect shoulder health and posture.`,
    evidence: { push, pull },
  })

  // ── Cardio ────────────────────────────────────────────────────────────
  const cardioMin = cardio.filter((c) => new Date(c.performed_on + 'T12:00').getTime() > now - 7 * DAY_MS).reduce((n, c) => n + c.duration_min, 0)
  const wantsCardio = profile.goal === 'weight_loss' || profile.goal === 'endurance' || profile.goal === 'general'
  if (wantsCardio && cardioMin < 150) recs.push({
    rule: 'cardio_low', subject: 'cardio', category: 'cardio', period,
    title: 'Add more cardio this week',
    message: `You logged ${Math.round(cardioMin)} minutes of cardio in the last 7 days. For ${profile.goal === 'weight_loss' ? 'weight loss' : profile.goal === 'endurance' ? 'endurance' : 'general fitness'}, aim for at least 150 minutes. Add ${Math.max(2, Math.ceil((150 - cardioMin) / 30))} sessions of ~30 min ${profile.goal === 'weight_loss' ? 'incline walking or cycling' : 'steady-state cardio'}.`,
    evidence: { minutes: Math.round(cardioMin), target: 150 },
  })
  if ((profile.goal === 'hypertrophy' || profile.goal === 'strength') && cardioMin > 300) recs.push({
    rule: 'cardio_high', subject: 'cardio', category: 'cardio', period,
    title: 'Cardio may be limiting your gains',
    message: `You logged ${Math.round(cardioMin)} minutes of cardio this week. For ${profile.goal === 'strength' ? 'strength' : 'muscle growth'}, keep it nearer 90–150 minutes of mostly low-intensity work so it does not interfere with recovery.`,
    evidence: { minutes: Math.round(cardioMin) },
  })

  // ── Consistency ───────────────────────────────────────────────────────
  // Judge only the time the plan has existed (up to 14 days), and wait for a full week of it.
  const plannedPerWeek = program?.filter((w) => w.day_of_week != null).length || profile.days_per_week || 0
  const firstSession = sessions.reduce<string | null>((a, s) => (!a || s.started_at < a ? s.started_at : a), null)
  const start = programStart ?? firstSession
  const windowDays = start ? Math.min(14, Math.floor((now - new Date(start).getTime()) / DAY_MS)) : 0
  if (plannedPerWeek && sessions.length && windowDays >= 7) {
    const done = sessions.filter((s) => new Date(s.started_at).getTime() > now - windowDays * DAY_MS).length
    const expected = Math.round((plannedPerWeek * windowDays) / 7)
    if (done < expected * 0.6) recs.push({
      rule: 'consistency', subject: 'sessions', category: 'consistency', period,
      title: 'You are missing planned sessions',
      message: `You completed ${done} of ${expected} planned sessions in the last ${windowDays} days (${Math.round((done / expected) * 100)}%). If your schedule has changed, switch to a ${plannedPerWeek > 3 ? 'shorter split such as Full Body 3 days' : 'shorter session length'} so you can stay consistent.`,
      evidence: { completed: done, planned: expected, days: windowDays },
    })
  }

  return recs
}
