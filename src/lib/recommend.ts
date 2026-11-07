import type { DoneSet, Env, Exercise, Goal, Level, Profile } from './types'

const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 }

/** Equipment the user can use in an environment. The gym is assumed fully equipped. */
export function availableEquipment(profile: Pick<Profile, 'equipment'>, env: Env): Set<string> | null {
  return env === 'gym' ? null : new Set(['bodyweight', ...profile.equipment])
}

export function isAvailable(ex: Exercise, env: Env, equipment: Set<string> | null) {
  if (!ex.environments.includes(env)) return false
  return !equipment || ex.equipment.every((q) => equipment.has(q))
}

export interface Scored { exercise: Exercise; score: number; reasons: string[] }

interface Context {
  env: Env
  equipment: Set<string> | null
  level: Level | null
  goal: Goal | null
  favorites?: string[]
  avoid?: string[]
  history?: DoneSet[]
}

/** Rank exercises for a muscle group with a plain-language reason for each. */
export function recommendExercises(all: Exercise[], muscle: string, ctx: Context): Scored[] {
  const level = LEVEL_RANK[ctx.level ?? 'beginner']
  const performed = new Map<string, number>()
  for (const s of ctx.history ?? []) performed.set(s.exercise_id, (performed.get(s.exercise_id) ?? 0) + 1)

  return all
    .filter((e) => e.muscles.includes(muscle) && isAvailable(e, ctx.env, ctx.equipment) && !ctx.avoid?.includes(e.id))
    .map((e) => {
      let score = 0
      const reasons: string[] = []
      const gap = LEVEL_RANK[e.difficulty] - level
      if (gap <= 0) { score += 2; reasons.push(`Suits your ${ctx.level ?? 'beginner'} level`) }
      else if (gap === 1) { score -= 1; reasons.push('A step up in difficulty — progress into it') }
      else score -= 4

      if (e.classification === 'compound') {
        score += ctx.goal === 'strength' || ctx.goal === 'athletic' ? 3 : 2
        reasons.push(ctx.goal === 'strength' ? 'Compound lift: heavy loading for strength' : 'Compound: trains several muscles at once')
      } else if (ctx.goal === 'hypertrophy' || ctx.goal === 'definition') {
        score += 1
        reasons.push('Isolation: adds targeted volume for muscle growth')
      }

      if (ctx.env === 'gym' && !e.environments.includes('home')) { score += 1; reasons.push('Makes full use of gym equipment') }
      else reasons.push(e.equipment.includes('bodyweight') && e.equipment.length === 1
        ? 'No equipment needed'
        : `Uses equipment you have (${e.equipment.join(', ').replace(/_/g, ' ')})`)

      if (ctx.favorites?.includes(e.id)) { score += 2; reasons.push('In your favourites') }
      const n = performed.get(e.id) ?? 0
      if (n >= 3) { score += 1; reasons.push(`You have logged ${n} sets — progress is trackable`) }
      return { exercise: e, score, reasons }
    })
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
}

/** Same-muscle substitutes in an environment, respecting the equipment available there. */
export function alternatives(all: Exercise[], ex: Exercise, env: Env, equipment: Set<string> | null) {
  const primary = ex.muscles[0]
  return all
    .filter((e) => e.id !== ex.id && e.muscles.includes(primary) && isAvailable(e, env, equipment))
    .sort((a, b) =>
      Number(b.classification === ex.classification) - Number(a.classification === ex.classification)
      || Math.abs(LEVEL_RANK[a.difficulty] - LEVEL_RANK[ex.difficulty]) - Math.abs(LEVEL_RANK[b.difficulty] - LEVEL_RANK[ex.difficulty])
      || (env === 'gym' ? Number(a.environments.includes('home')) - Number(b.environments.includes('home')) : 0))
    .slice(0, 6)
}
