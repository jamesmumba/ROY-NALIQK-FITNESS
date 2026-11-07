export type Env = 'home' | 'gym'
export type Level = 'beginner' | 'intermediate' | 'advanced'
export type Goal = 'hypertrophy' | 'strength' | 'weight_loss' | 'general' | 'endurance' | 'athletic' | 'definition'
export type Classification = 'compound' | 'isolation' | 'cardio'
export type SetType = 'straight' | 'superset' | 'drop' | 'pyramid' | 'rest_pause' | 'amrap'
export type Intensity = 'light' | 'moderate' | 'hard' | 'max'

export interface Profile {
  id: string
  full_name: string
  age: number | null
  gender: string | null
  height_cm: number | null
  weight_kg: number | null
  experience: Level | null
  goal: Goal | null
  environment: 'home' | 'gym' | 'both'
  active_env: Env
  equipment: string[]
  days_per_week: number | null
  session_minutes: number | null
  target_muscles: string[]
  training_history: string | null
  limitations: string | null
  avoid_exercises: string[]
  notify_workouts: boolean
  notify_coach: boolean
  onboarded: boolean
}

export interface MuscleGroup { slug: string; name: string; parent_slug: string | null; sort: number }
export interface Equipment { slug: string; name: string; home: boolean }

export interface Exercise {
  id: string
  slug: string
  name: string
  classification: Classification
  difficulty: Level
  description: string
  instructions: string[]
  common_mistakes: string[]
  secondary_muscles: string[]
  rec_sets: number
  rec_reps: string
  rest_seconds: number
  environments: Env[]
  image_id: string | null
  muscles: string[]     // primary muscle group slugs
  equipment: string[]   // required equipment slugs
}

export interface Program {
  id: string
  name: string
  split: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface PlannedSet { id?: string; set_number: number; target_reps: number; target_weight: number }

export interface WorkoutExercise {
  id?: string
  exercise_id: string
  position: number
  set_type: SetType
  superset_group: number | null
  intensity: Intensity | null
  rest_seconds: number
  notes: string | null
  sets: PlannedSet[]
}

export interface Workout {
  id: string
  program_id: string | null
  day_of_week: number | null
  scheduled_date: string | null
  name: string
  focus: string[]
  is_template: boolean
  est_minutes: number | null
  notes: string | null
  created_at: string
}

export interface WorkoutWithExercises extends Workout { exercises: WorkoutExercise[] }

export interface Session {
  id: string
  workout_id: string | null
  name: string
  status: 'in_progress' | 'completed'
  started_at: string
  ended_at: string | null
  duration_seconds: number
  notes: string | null
}

export interface LogRow {
  id: string
  session_id: string
  exercise_id: string
  position: number
  set_number: number
  set_type: SetType
  rest_seconds: number
  planned_reps: number | null
  planned_weight: number | null
  actual_reps: number | null
  actual_weight: number | null
  completed: boolean
  completed_at: string | null
  is_warmup: boolean
}

/** A completed set joined with its session date — the raw material for analytics and coaching. */
export interface DoneSet {
  session_id: string
  exercise_id: string
  date: string            // ISO timestamp of the session start
  planned_reps: number | null
  planned_weight: number | null
  reps: number
  weight: number
}

export interface PersonalRecord {
  id: string
  exercise_id: string
  record_type: 'heaviest' | 'e1rm' | 'tested_1rm'
  weight: number
  reps: number
  value: number
  achieved_on: string
  session_id: string | null
}

export interface CardioSession {
  id: string
  exercise_id: string | null
  activity: string
  performed_on: string
  duration_min: number
  distance_km: number | null
  speed_kmh: number | null
  incline_pct: number | null
  resistance: number | null
  intensity: 'low' | 'moderate' | 'high' | null
  avg_hr: number | null
  calories: number | null
  calories_source: 'estimated' | 'imported' | null
  notes: string | null
}

export interface Measurement {
  id: string
  measured_on: string
  weight_kg: number | null
  chest_cm: number | null
  waist_cm: number | null
  arms_cm: number | null
  shoulders_cm: number | null
  thighs_cm: number | null
  calves_cm: number | null
}

export interface Recommendation {
  id: string
  rule: string
  subject: string
  category: 'progression' | 'volume' | 'recovery' | 'cardio' | 'consistency' | 'variation'
  title: string
  message: string
  evidence: Record<string, unknown>
  period: string
  status: 'open' | 'implemented' | 'dismissed'
  created_at: string
}
