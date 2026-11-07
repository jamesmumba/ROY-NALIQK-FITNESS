import { supabase, must } from './supabase'
import { e1rm, isoDate } from './training'
import type {
  CardioSession, DoneSet, Equipment, Exercise, LogRow, Measurement, MuscleGroup, PersonalRecord, Profile, Program,
  Recommendation, Session, Workout, WorkoutExercise, WorkoutWithExercises,
} from './types'

async function uid() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Not signed in')
  return data.session.user.id
}

// ── Library (cached for the life of the tab) ────────────────────────────
export interface Library {
  exercises: Exercise[]
  byId: Map<string, Exercise>
  bySlug: Map<string, Exercise>
  groups: MuscleGroup[]
  equipment: Equipment[]
}

let libraryPromise: Promise<Library> | null = null

export function loadLibrary(): Promise<Library> {
  libraryPromise ??= (async () => {
    const [ex, groups, equipment] = await Promise.all([
      supabase.from('exercises').select('*, exercise_muscles(muscle_slug, position), exercise_equipment(equipment_slug)').order('name'),
      supabase.from('muscle_groups').select('*').order('sort'),
      supabase.from('equipment').select('*'),
    ])
    type Row = Omit<Exercise, 'muscles' | 'equipment'> & {
      exercise_muscles: { muscle_slug: string; position: number }[]
      exercise_equipment: { equipment_slug: string }[]
    }
    const exercises = must(ex).map(({ exercise_muscles, exercise_equipment, ...e }: Row) => ({
      ...e,
      // muscles[0] is the main target
      muscles: exercise_muscles.sort((a, b) => a.position - b.position).map((m) => m.muscle_slug),
      equipment: exercise_equipment.map((q) => q.equipment_slug),
    })) as Exercise[]
    return {
      exercises,
      byId: new Map(exercises.map((e) => [e.id, e])),
      bySlug: new Map(exercises.map((e) => [e.slug, e])),
      groups: must(groups) as MuscleGroup[],
      equipment: must(equipment) as Equipment[],
    }
  })().catch((err) => { libraryPromise = null; throw err })
  return libraryPromise
}

// ── Profile ─────────────────────────────────────────────────────────────
export async function getProfile(): Promise<Profile> {
  return must(await supabase.from('profiles').select('*').eq('id', await uid()).single()) as Profile
}

export async function updateProfile(patch: Partial<Profile>) {
  must(await supabase.from('profiles').update(patch).eq('id', await uid()))
}

export async function listFavorites(): Promise<string[]> {
  return must(await supabase.from('favorites').select('exercise_id')).map((f: { exercise_id: string }) => f.exercise_id)
}

export async function setFavorite(exerciseId: string, on: boolean) {
  const user_id = await uid()
  if (on) must(await supabase.from('favorites').upsert({ user_id, exercise_id: exerciseId }))
  else must(await supabase.from('favorites').delete().eq('exercise_id', exerciseId))
}

// ── Workouts ────────────────────────────────────────────────────────────
type WorkoutRow = Workout & {
  workout_exercises: (Omit<WorkoutExercise, 'sets'> & { exercise_sets: WorkoutExercise['sets'] })[]
}

const WORKOUT_SELECT = '*, workout_exercises(*, exercise_sets(*))'

function shapeWorkout(w: WorkoutRow): WorkoutWithExercises {
  const { workout_exercises, ...rest } = w
  return {
    ...rest,
    exercises: workout_exercises
      .sort((a, b) => a.position - b.position)
      .map(({ exercise_sets, ...we }) => ({ ...we, sets: exercise_sets.sort((a, b) => a.set_number - b.set_number) })),
  }
}

export async function listWorkouts(filter: { programId?: string; templates?: boolean; dated?: boolean } = {}) {
  let q = supabase.from('workouts').select(WORKOUT_SELECT).order('created_at', { ascending: false })
  if (filter.programId) q = q.eq('program_id', filter.programId)
  if (filter.templates) q = q.eq('is_template', true)
  if (filter.dated) q = q.not('scheduled_date', 'is', null).order('scheduled_date')
  return (must(await q) as WorkoutRow[]).map(shapeWorkout)
}

export async function getWorkout(id: string) {
  return shapeWorkout(must(await supabase.from('workouts').select(WORKOUT_SELECT).eq('id', id).single()) as WorkoutRow)
}

export type WorkoutDraft = Omit<Workout, 'id' | 'created_at'> & { id?: string; exercises: WorkoutExercise[] }

/** Save a workout and replace its exercise list (simplest correct way to support reorder/remove). */
export async function saveWorkout(draft: WorkoutDraft): Promise<string> {
  const user_id = await uid()
  const { exercises, id, ...fields } = draft
  const saved = must(await supabase.from('workouts').upsert({ ...(id ? { id } : {}), ...fields, user_id }).select('id').single()) as { id: string }
  must(await supabase.from('workout_exercises').delete().eq('workout_id', saved.id))
  if (exercises.length) {
    const rows = must(await supabase.from('workout_exercises').insert(exercises.map((e, i) => ({
      workout_id: saved.id, user_id, exercise_id: e.exercise_id, position: i, set_type: e.set_type,
      superset_group: e.superset_group, intensity: e.intensity, rest_seconds: e.rest_seconds, notes: e.notes || null,
    }))).select('id, position')) as { id: string; position: number }[]
    const sets = rows.flatMap((r) => exercises[r.position].sets.map((s, i) => ({
      workout_exercise_id: r.id, user_id, set_number: i + 1, target_reps: s.target_reps, target_weight: s.target_weight,
    })))
    if (sets.length) must(await supabase.from('exercise_sets').insert(sets))
  }
  return saved.id
}

export async function deleteWorkout(id: string) {
  must(await supabase.from('workouts').delete().eq('id', id))
}

export async function copyWorkout(id: string, overrides: Partial<WorkoutDraft>) {
  const { id: _old, created_at: _c, ...w } = await getWorkout(id)
  return saveWorkout({ ...w, exercises: w.exercises.map(({ id: _e, ...e }) => e), ...overrides })
}

// ── Programs ────────────────────────────────────────────────────────────
export async function listPrograms(): Promise<Program[]> {
  return must(await supabase.from('workout_programs').select('*').order('created_at', { ascending: false })) as Program[]
}

export async function createProgram(p: { name: string; split: string; description?: string }) {
  return (must(await supabase.from('workout_programs').insert({ ...p, user_id: await uid() }).select('id').single()) as { id: string }).id
}

export async function updateProgram(id: string, patch: Partial<Program>) {
  must(await supabase.from('workout_programs').update(patch).eq('id', id))
}

export async function activateProgram(id: string) {
  must(await supabase.from('workout_programs').update({ is_active: false }).eq('is_active', true))
  must(await supabase.from('workout_programs').update({ is_active: true }).eq('id', id))
}

export async function deleteProgram(id: string) {
  must(await supabase.from('workout_programs').delete().eq('id', id))
}

export async function getActiveProgram() {
  const p = must(await supabase.from('workout_programs').select('*').eq('is_active', true).maybeSingle()) as Program | null
  return p ? { program: p, workouts: await listWorkouts({ programId: p.id }) } : null
}

// ── Sessions ────────────────────────────────────────────────────────────
export async function startSession(workout: WorkoutWithExercises | null, name = 'Quick workout'): Promise<string> {
  const user_id = await uid()
  const s = must(await supabase.from('workout_sessions')
    .insert({ user_id, workout_id: workout?.id ?? null, name: workout?.name ?? name }).select('id').single()) as { id: string }
  // sets planned at 0 kg start from the heaviest working weight of the last session with that exercise
  const lastTop = new Map<string, number>()
  const ids = [...new Set((workout?.exercises ?? []).map((e) => e.exercise_id))]
  if (ids.length) {
    const recent = (await listDoneSets(180)).filter((d) => ids.includes(d.exercise_id))
    for (const id of ids) {
      const mine = recent.filter((d) => d.exercise_id === id)
      const lastSession = mine.at(-1)?.session_id
      if (lastSession) lastTop.set(id, Math.max(...mine.filter((d) => d.session_id === lastSession).map((d) => d.weight)))
    }
  }
  const logs = (workout?.exercises ?? []).flatMap((e, position) => e.sets.map((set) => ({
    session_id: s.id, user_id, exercise_id: e.exercise_id, position, set_number: set.set_number, set_type: e.set_type,
    rest_seconds: e.rest_seconds, planned_reps: set.target_reps, planned_weight: set.target_weight || lastTop.get(e.exercise_id) || 0,
  })))
  if (logs.length) must(await supabase.from('workout_logs').insert(logs))
  return s.id
}

export async function getSession(id: string) {
  const [s, logs] = await Promise.all([
    supabase.from('workout_sessions').select('*').eq('id', id).single(),
    supabase.from('workout_logs').select('*').eq('session_id', id).order('position').order('set_number'),
  ])
  return { session: must(s) as Session, logs: must(logs) as LogRow[] }
}

export async function getOpenSession() {
  return must(await supabase.from('workout_sessions').select('*').eq('status', 'in_progress')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()) as Session | null
}

export async function updateSession(id: string, patch: Partial<Session>) {
  must(await supabase.from('workout_sessions').update(patch).eq('id', id))
}

export async function deleteSession(id: string) {
  must(await supabase.from('workout_sessions').delete().eq('id', id))
}

export async function updateLog(id: string, patch: Partial<LogRow>) {
  must(await supabase.from('workout_logs').update(patch).eq('id', id))
}

export async function addLogs(rows: Omit<LogRow, 'id' | 'actual_reps' | 'actual_weight' | 'completed' | 'completed_at' | 'is_warmup'>[]) {
  const user_id = await uid()
  return must(await supabase.from('workout_logs').insert(rows.map((r) => ({ ...r, user_id }))).select('*')) as LogRow[]
}

export async function deleteLogs(ids: string[]) {
  must(await supabase.from('workout_logs').delete().in('id', ids))
}

export async function listSessions(limit = 50) {
  return must(await supabase.from('workout_sessions').select('*').eq('status', 'completed')
    .order('started_at', { ascending: false }).limit(limit)) as Session[]
}

/** All completed working sets (warm-ups excluded) with their session date — everything analytics and the coach need. */
export async function listDoneSets(sinceDays = 400): Promise<DoneSet[]> {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
  type Row = Omit<DoneSet, 'date' | 'reps' | 'weight'> & {
    actual_reps: number | null; actual_weight: number | null
    workout_sessions: { started_at: string; status: string }
  }
  const rows = must(await supabase.from('workout_logs')
    .select('session_id, exercise_id, planned_reps, planned_weight, actual_reps, actual_weight, workout_sessions!inner(started_at, status)')
    .eq('completed', true).eq('is_warmup', false).eq('workout_sessions.status', 'completed').gte('workout_sessions.started_at', since)
    .limit(20000)) as unknown as Row[]
  return rows.map((r) => ({
    session_id: r.session_id, exercise_id: r.exercise_id, date: r.workout_sessions.started_at,
    planned_reps: r.planned_reps, planned_weight: r.planned_weight, reps: r.actual_reps ?? 0, weight: r.actual_weight ?? 0,
  })).sort((a, b) => a.date.localeCompare(b.date))
}

/** Planned vs completed sets per session, for completion-rate reporting. */
export async function listSetCompletion(sinceDays = 400) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
  const rows = must(await supabase.from('workout_logs')
    .select('completed, workout_sessions!inner(started_at, status)')
    .eq('workout_sessions.status', 'completed').gte('workout_sessions.started_at', since).limit(20000)) as unknown as
    { completed: boolean; workout_sessions: { started_at: string } }[]
  return rows.map((r) => ({ completed: r.completed, date: r.workout_sessions.started_at }))
}

/** Finish a session: stamp it and record any new personal records it produced. */
export async function finishSession(id: string, durationSeconds: number) {
  const user_id = await uid()
  const { session, logs } = await getSession(id)
  const done = logs.filter((l) => l.completed && !l.is_warmup && (l.actual_weight ?? 0) > 0 && (l.actual_reps ?? 0) > 0)
  const exerciseIds = [...new Set(done.map((l) => l.exercise_id))]
  const previous = exerciseIds.length
    ? must(await supabase.from('personal_records').select('*').in('exercise_id', exerciseIds).in('record_type', ['heaviest', 'e1rm'])) as PersonalRecord[]
    : []
  const today = isoDate(new Date(session.started_at))
  const records = exerciseIds.flatMap((ex) => {
    const sets = done.filter((l) => l.exercise_id === ex)
    const heaviest = sets.reduce((a, b) => (b.actual_weight! > a.actual_weight! ? b : a))
    const best = sets.reduce((a, b) => (e1rm(b.actual_weight!, b.actual_reps!) > e1rm(a.actual_weight!, a.actual_reps!) ? b : a))
    const prevMax = (type: string) => Math.max(0, ...previous.filter((p) => p.exercise_id === ex && p.record_type === type).map((p) => p.value))
    const out = []
    if (heaviest.actual_weight! > prevMax('heaviest'))
      out.push({ user_id, exercise_id: ex, record_type: 'heaviest', weight: heaviest.actual_weight, reps: heaviest.actual_reps, value: heaviest.actual_weight, achieved_on: today, session_id: id })
    const est = Math.round(e1rm(best.actual_weight!, best.actual_reps!) * 10) / 10
    if (est > 0 && est > prevMax('e1rm'))
      out.push({ user_id, exercise_id: ex, record_type: 'e1rm', weight: best.actual_weight, reps: best.actual_reps, value: est, achieved_on: today, session_id: id })
    return out
  })
  if (records.length) must(await supabase.from('personal_records').insert(records))
  await updateSession(id, { status: 'completed', ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
}

// ── Records, cardio, body ───────────────────────────────────────────────
export async function listRecords(): Promise<PersonalRecord[]> {
  return must(await supabase.from('personal_records').select('*').order('achieved_on', { ascending: false })) as PersonalRecord[]
}

export async function addTestedMax(exercise_id: string, weight: number, achieved_on: string) {
  must(await supabase.from('personal_records').insert({ user_id: await uid(), exercise_id, record_type: 'tested_1rm', weight, reps: 1, value: weight, achieved_on }))
}

export async function deleteRecord(id: string) {
  must(await supabase.from('personal_records').delete().eq('id', id))
}

export async function listCardio(): Promise<CardioSession[]> {
  return must(await supabase.from('cardio_sessions').select('*').order('performed_on', { ascending: false })) as CardioSession[]
}

export async function saveCardio(c: Omit<CardioSession, 'id'> & { id?: string }) {
  must(await supabase.from('cardio_sessions').upsert({ ...c, user_id: await uid() }))
}

export async function deleteCardio(id: string) {
  must(await supabase.from('cardio_sessions').delete().eq('id', id))
}

export async function listMeasurements(): Promise<Measurement[]> {
  return must(await supabase.from('body_measurements').select('*').order('measured_on')) as Measurement[]
}

export async function saveMeasurement(m: Omit<Measurement, 'id'>) {
  must(await supabase.from('body_measurements').upsert({ ...m, user_id: await uid() }, { onConflict: 'user_id,measured_on' }))
}

export async function deleteMeasurement(id: string) {
  must(await supabase.from('body_measurements').delete().eq('id', id))
}

export interface Photo { id: string; taken_on: string; storage_path: string; note: string | null; url?: string }

export async function listPhotos(): Promise<Photo[]> {
  const photos = must(await supabase.from('progress_photos').select('*').order('taken_on', { ascending: false })) as Photo[]
  if (!photos.length) return photos
  const { data } = await supabase.storage.from('progress-photos').createSignedUrls(photos.map((p) => p.storage_path), 3600)
  return photos.map((p, i) => ({ ...p, url: data?.[i]?.signedUrl ?? undefined }))
}

export async function uploadPhoto(file: File, taken_on: string, note: string) {
  const user_id = await uid()
  const path = `${user_id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const up = await supabase.storage.from('progress-photos').upload(path, file, { contentType: file.type })
  if (up.error) throw new Error(up.error.message)
  must(await supabase.from('progress_photos').insert({ user_id, taken_on, storage_path: path, note: note || null }))
}

export async function deletePhoto(p: Photo) {
  await supabase.storage.from('progress-photos').remove([p.storage_path])
  must(await supabase.from('progress_photos').delete().eq('id', p.id))
}

// ── Coach recommendations ───────────────────────────────────────────────
export async function listRecommendations(): Promise<Recommendation[]> {
  return must(await supabase.from('fitness_recommendations').select('*').order('created_at', { ascending: false })) as Recommendation[]
}

/**
 * Sync this week's recommendations with the latest analysis: refresh the numbers on ones that still apply
 * (status is left alone) and drop open ones whose rule no longer fires.
 */
export async function storeRecommendations(recs: Omit<Recommendation, 'id' | 'status' | 'created_at'>[], period: string) {
  const user_id = await uid()
  if (recs.length) must(await supabase.from('fitness_recommendations')
    .upsert(recs.map((r) => ({ ...r, user_id })), { onConflict: 'user_id,rule,subject,period' }))
  const open = must(await supabase.from('fitness_recommendations').select('id, rule, subject').eq('period', period).eq('status', 'open')) as Pick<Recommendation, 'id' | 'rule' | 'subject'>[]
  const stale = open.filter((o) => !recs.some((r) => r.rule === o.rule && r.subject === o.subject)).map((o) => o.id)
  if (stale.length) must(await supabase.from('fitness_recommendations').delete().in('id', stale))
}

/** Set the planned weight for an exercise on every day of the active programme. Returns how many days changed. */
export async function applyLoadToPlan(exerciseId: string, weight: number) {
  const active = await getActiveProgram()
  const entries = (active?.workouts ?? []).flatMap((w) => w.exercises.filter((e) => e.exercise_id === exerciseId).map((e) => e.id!))
  if (!entries.length) return 0
  must(await supabase.from('exercise_sets').update({ target_weight: weight }).in('workout_exercise_id', entries))
  return new Set((active?.workouts ?? []).filter((w) => w.exercises.some((e) => e.exercise_id === exerciseId)).map((w) => w.id)).size
}

export async function setRecommendationStatus(id: string, status: Recommendation['status']) {
  must(await supabase.from('fitness_recommendations').update({ status }).eq('id', id))
}
