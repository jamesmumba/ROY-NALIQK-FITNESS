import type { Classification, Exercise, Goal, Level } from './types'

export const GOALS: Record<Goal, string> = {
  hypertrophy: 'Muscle building',
  strength: 'Strength development',
  weight_loss: 'Weight loss',
  general: 'General fitness',
  endurance: 'Endurance',
  athletic: 'Athletic performance',
  definition: 'Muscle definition',
}

export const LEVELS: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export const SET_TYPES = {
  straight: 'Straight sets',
  superset: 'Superset',
  drop: 'Drop set',
  pyramid: 'Pyramid',
  rest_pause: 'Rest-pause',
  amrap: 'AMRAP',
} as const

/** Rep-range guidance per objective. Recommendations, never restrictions. */
export const REP_RANGES = {
  strength: { label: 'Strength', min: 1, max: 6 },
  hypertrophy: { label: 'Hypertrophy', min: 6, max: 15 },
  endurance: { label: 'Muscular endurance', min: 15, max: 25 },
} as const

export function prescription(goal: Goal | null, cls: Classification) {
  const iso = cls === 'isolation'
  switch (goal) {
    case 'strength': return iso ? { sets: 3, reps: 8, rest: 90 } : { sets: 4, reps: 5, rest: 180 }
    case 'athletic': return iso ? { sets: 3, reps: 10, rest: 60 } : { sets: 4, reps: 6, rest: 150 }
    case 'endurance': return { sets: 3, reps: iso ? 20 : 15, rest: 45 }
    case 'weight_loss':
    case 'definition': return { sets: 3, reps: iso ? 15 : 12, rest: 60 }
    default: return iso ? { sets: 3, reps: 12, rest: 60 } : { sets: 3, reps: 10, rest: 90 }
  }
}

/** Weekly working-set targets per muscle (evidence-based ranges for most lifters). */
export function weeklySetTarget(goal: Goal | null) {
  if (goal === 'hypertrophy' || goal === 'definition') return { min: 10, max: 20 }
  if (goal === 'strength' || goal === 'athletic') return { min: 6, max: 15 }
  return { min: 6, max: 16 }
}

/** Epley estimated one-rep max. A single is the lift itself; beyond 12 reps the formula is unreliable, so 0 = no estimate. */
export const E1RM_MAX_REPS = 12
export function e1rm(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0 || reps > E1RM_MAX_REPS) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

// secondary-muscle labels in the library that map onto a tracked group
const SECONDARY_GROUP: Record<string, string> = {
  triceps: 'triceps', biceps: 'biceps', brachialis: 'biceps', 'front delts': 'shoulders', 'rear delts': 'shoulders', shoulders: 'shoulders',
  chest: 'chest', 'upper chest': 'chest', back: 'back', 'upper back': 'back', lats: 'back', core: 'core', obliques: 'core',
  quads: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves',
}

/**
 * How much one set of an exercise counts toward each muscle's weekly volume:
 * the main muscle gets a full set, other listed and secondary muscles half a set.
 */
export function muscleCredit(ex: Pick<Exercise, 'muscles' | 'secondary_muscles'> | undefined): Map<string, number> {
  const out = new Map<string, number>()
  if (!ex) return out
  ex.muscles.forEach((m, i) => out.set(m, i === 0 ? 1 : 0.5))
  for (const s of ex.secondary_muscles) {
    const g = SECONDARY_GROUP[s]
    if (g && !out.has(g)) out.set(g, 0.5)
  }
  return out
}

export const round = (n: number, step = 0.5) => Math.round(n / step) * step

export function fmtKg(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} kg`
}

export function fmtVolume(kg: number) {
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg).toLocaleString()} kg`
}

export function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// ── Dates (local time, weeks start Monday) ──────────────────────────────
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const dayIndex = (d: Date) => (d.getDay() + 6) % 7

export function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - dayIndex(x))
  return x
}

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export const fmtDate = (s: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(typeof s === 'string' && s.length === 10 ? s + 'T00:00' : s).toLocaleDateString(undefined, opts)

/** Rough MET-based calorie estimate for cardio. Labelled as an estimate everywhere it is shown. */
export function estimateCalories(activity: string, minutes: number, weightKg: number, intensity: 'low' | 'moderate' | 'high' | null) {
  const base: Record<string, number> = {
    'Treadmill Running': 9.8, 'Walking': 3.5, 'Incline Walking': 6, 'Cycling': 7.5, 'Stationary Bike': 6.8,
    'Rowing Machine': 7, 'Jump Rope': 11, 'Stair Climber': 9, 'Swimming': 7, 'Burpees': 8, 'High Knees': 8,
    'Jumping Jacks': 7.7, 'Sprint Intervals': 10, 'HIIT Training': 8, 'LISS Cardio': 4, 'Mountain Climbers': 8,
  }
  const scale = intensity === 'low' ? 0.8 : intensity === 'high' ? 1.2 : 1
  return Math.round((base[activity] ?? 6) * scale * weightKg * (minutes / 60))
}
