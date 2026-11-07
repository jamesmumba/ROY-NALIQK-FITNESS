-- Roy Naliqk Fitness — schema. Every user-owned row carries user_id and is protected by RLS.

-- ── Reference data (public read) ─────────────────────────────────────────
create table public.muscle_groups (
  slug text primary key,
  name text not null,
  parent_slug text references public.muscle_groups(slug),
  sort smallint not null default 0
);

create table public.equipment (
  slug text primary key,
  name text not null,
  home boolean not null default false
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  classification text not null check (classification in ('compound', 'isolation', 'cardio')),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  description text not null,
  instructions text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  rec_sets smallint not null,
  rec_reps text not null,
  rest_seconds smallint not null,
  environments text[] not null,          -- subset of {home,gym}, derived from equipment
  image_id text                            -- free-exercise-db folder name
);

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_slug text not null references public.muscle_groups(slug),
  primary key (exercise_id, muscle_slug)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_slug);

create table public.exercise_equipment (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  equipment_slug text not null references public.equipment(slug),
  primary key (exercise_id, equipment_slug)
);
create index exercise_equipment_equipment_idx on public.exercise_equipment (equipment_slug);

-- ── Users ────────────────────────────────────────────────────────────────
-- profiles holds what the brief splits into users / user_profiles / fitness_goals / user_preferences.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  age smallint check (age between 13 and 100),
  gender text check (gender in ('male', 'female', 'other', 'prefer_not')),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg between 30 and 300),
  experience text check (experience in ('beginner', 'intermediate', 'advanced')),
  goal text check (goal in ('hypertrophy', 'strength', 'weight_loss', 'general', 'endurance', 'athletic', 'definition')),
  environment text not null default 'both' check (environment in ('home', 'gym', 'both')),
  active_env text not null default 'gym' check (active_env in ('home', 'gym')),
  equipment text[] not null default '{bodyweight}',   -- equipment available at home
  days_per_week smallint check (days_per_week between 1 and 7),
  session_minutes smallint check (session_minutes between 10 and 240),
  target_muscles text[] not null default '{}',
  training_history text check (char_length(training_history) <= 2000),
  limitations text check (char_length(limitations) <= 2000),
  avoid_exercises uuid[] not null default '{}',
  notify_workouts boolean not null default true,
  notify_coach boolean not null default true,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  primary key (user_id, exercise_id)
);

-- ── Programming ──────────────────────────────────────────────────────────
create table public.workout_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  split text not null default 'custom',
  description text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create index workout_programs_user_idx on public.workout_programs (user_id);
create unique index one_active_program on public.workout_programs (user_id) where is_active;

-- A workout is a program day (program_id + day_of_week), a dated daily workout, or a reusable template.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.workout_programs(id) on delete cascade,
  day_of_week smallint check (day_of_week between 0 and 6),   -- 0 = Monday
  scheduled_date date,
  name text not null check (char_length(name) between 1 and 80),
  focus text[] not null default '{}',
  is_template boolean not null default false,
  est_minutes smallint check (est_minutes between 5 and 300),
  notes text,
  created_at timestamptz not null default now()
);
create index workouts_user_idx on public.workouts (user_id);
create index workouts_program_idx on public.workouts (program_id);
create index workouts_date_idx on public.workouts (user_id, scheduled_date);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  position smallint not null,
  set_type text not null default 'straight' check (set_type in ('straight', 'superset', 'drop', 'pyramid', 'rest_pause', 'amrap')),
  superset_group smallint,
  intensity text check (intensity in ('light', 'moderate', 'hard', 'max')),
  rest_seconds smallint not null default 90 check (rest_seconds between 0 and 900),
  notes text check (char_length(notes) <= 500)
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 30),
  target_reps smallint not null check (target_reps between 1 and 200),
  target_weight numeric(6,2) not null default 0 check (target_weight >= 0)
);
create index exercise_sets_we_idx on public.exercise_sets (workout_exercise_id, set_number);

-- ── Execution & logging ──────────────────────────────────────────────────
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  name text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  notes text
);
create index workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  position smallint not null,
  set_number smallint not null,
  set_type text not null default 'straight',
  rest_seconds smallint not null default 90,
  planned_reps smallint,
  planned_weight numeric(6,2),
  actual_reps smallint check (actual_reps between 0 and 500),
  actual_weight numeric(6,2) check (actual_weight >= 0),
  completed boolean not null default false,
  completed_at timestamptz
);
create index workout_logs_session_idx on public.workout_logs (session_id, position, set_number);
create index workout_logs_user_ex_idx on public.workout_logs (user_id, exercise_id, completed_at);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  record_type text not null check (record_type in ('heaviest', 'e1rm', 'tested_1rm')),
  weight numeric(6,2) not null check (weight > 0),
  reps smallint not null default 1,
  value numeric(7,2) not null,             -- weight for heaviest/tested, estimated 1RM for e1rm
  achieved_on date not null default current_date,
  session_id uuid references public.workout_sessions(id) on delete set null
);
create index personal_records_user_idx on public.personal_records (user_id, exercise_id, achieved_on desc);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  activity text not null,
  performed_on date not null default current_date,
  duration_min numeric(6,1) not null check (duration_min > 0 and duration_min <= 1440),
  distance_km numeric(6,2) check (distance_km >= 0),
  speed_kmh numeric(5,1) check (speed_kmh >= 0),
  incline_pct numeric(4,1) check (incline_pct between -10 and 40),
  resistance smallint check (resistance between 0 and 100),
  intensity text check (intensity in ('low', 'moderate', 'high')),
  avg_hr smallint check (avg_hr between 30 and 240),
  calories integer check (calories >= 0),
  calories_source text check (calories_source in ('estimated', 'imported')),
  notes text
);
create index cardio_sessions_user_idx on public.cardio_sessions (user_id, performed_on desc);

-- ── Body tracking ────────────────────────────────────────────────────────
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric(5,1) check (weight_kg between 30 and 300),
  chest_cm numeric(5,1) check (chest_cm > 0),
  waist_cm numeric(5,1) check (waist_cm > 0),
  arms_cm numeric(5,1) check (arms_cm > 0),
  shoulders_cm numeric(5,1) check (shoulders_cm > 0),
  thighs_cm numeric(5,1) check (thighs_cm > 0),
  calves_cm numeric(5,1) check (calves_cm > 0),
  unique (user_id, measured_on)
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_on date not null default current_date,
  storage_path text not null,
  note text
);
create index progress_photos_user_idx on public.progress_photos (user_id, taken_on desc);

-- ── Coach ────────────────────────────────────────────────────────────────
create table public.fitness_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null,                      -- which transparent rule fired
  subject text not null default '',        -- exercise / muscle the rule is about
  category text not null check (category in ('progression', 'volume', 'recovery', 'cardio', 'consistency', 'variation')),
  title text not null,
  message text not null,
  evidence jsonb not null default '{}',
  period text not null,                    -- ISO week, e.g. 2026-W45
  status text not null default 'open' check (status in ('open', 'implemented', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, rule, subject, period)
);
create index fitness_recommendations_user_idx on public.fitness_recommendations (user_id, created_at desc);

-- ── Row level security ───────────────────────────────────────────────────
alter table public.muscle_groups enable row level security;
alter table public.equipment enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;
create policy "library is readable" on public.muscle_groups for select using (true);
create policy "library is readable" on public.equipment for select using (true);
create policy "library is readable" on public.exercises for select using (true);
create policy "library is readable" on public.exercise_muscles for select using (true);
create policy "library is readable" on public.exercise_equipment for select using (true);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['favorites', 'workout_programs', 'workouts', 'workout_sessions', 'personal_records',
                           'cardio_sessions', 'body_measurements', 'progress_photos', 'fitness_recommendations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Child rows must also point at a parent the user owns.
alter table public.workout_exercises enable row level security;
create policy "own rows" on public.workout_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));

alter table public.exercise_sets enable row level security;
create policy "own rows" on public.exercise_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.workout_exercises we where we.id = workout_exercise_id and we.user_id = (select auth.uid())));

alter table public.workout_logs enable row level security;
create policy "own rows" on public.workout_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

-- ── Progress photo storage (private, one folder per user) ───────────────
insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false)
  on conflict (id) do nothing;

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
