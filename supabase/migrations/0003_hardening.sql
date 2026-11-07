-- The signup trigger must not be callable through the REST API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Cover foreign keys used by RLS checks, joins and cascades.
create index exercise_sets_user_idx on public.exercise_sets (user_id);
create index workout_exercises_user_idx on public.workout_exercises (user_id);
create index workout_logs_exercise_idx on public.workout_logs (exercise_id);
create index workout_sessions_workout_idx on public.workout_sessions (workout_id);
create index personal_records_exercise_idx on public.personal_records (exercise_id);
create index personal_records_session_idx on public.personal_records (session_id);
create index cardio_sessions_exercise_idx on public.cardio_sessions (exercise_id);
create index favorites_exercise_idx on public.favorites (exercise_id);
create index muscle_groups_parent_idx on public.muscle_groups (parent_slug);
