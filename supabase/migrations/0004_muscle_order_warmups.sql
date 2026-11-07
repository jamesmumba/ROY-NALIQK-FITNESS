-- Order each exercise's muscle groups so position 0 is the main target.
alter table public.exercise_muscles add column position smallint not null default 0;
update public.exercise_muscles em set position = v.pos
from (values
  ('Weighted Dips', 'triceps', 1),
  ('Deadlifts', 'hamstrings', 1),
  ('Deadlifts', 'glutes', 2),
  ('Chin-ups', 'biceps', 1),
  ('Barbell Squats', 'glutes', 1),
  ('Leg Press', 'glutes', 1),
  ('Bulgarian Split Squats', 'glutes', 1),
  ('Goblet Squats', 'glutes', 1),
  ('Bodyweight Squats', 'glutes', 1),
  ('Romanian Deadlifts', 'glutes', 1),
  ('Dumbbell Romanian Deadlifts', 'glutes', 1),
  ('Walking Lunges', 'quads', 1),
  ('Reverse Lunges', 'quads', 1),
  ('Underhand-Grip Inverted Rows', 'back', 1),
  ('Diamond Push-ups', 'chest', 1),
  ('Mountain Climbers', 'cardio', 1)
) as v(name, slug, pos)
join public.exercises e on e.name = v.name
where em.exercise_id = e.id and em.muscle_slug = v.slug;

-- Warm-up sets are logged but excluded from volume, progression and records.
alter table public.workout_logs add column is_warmup boolean not null default false;
