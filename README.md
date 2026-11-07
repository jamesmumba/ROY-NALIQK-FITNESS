# Roy Naliqk Fitness

Personal training app: onboarding assessment, exercise library (116 exercises, compound/isolation per muscle group, home/gym), workout builder, weekly split planner, live workout mode with rest timer, analytics, cardio log, body tracking and a rule-based coach.

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Recharts, Lucide, React Router (Vite).
- **Backend:** Supabase (Postgres, Auth, Storage). The REST API is Supabase's auto-generated PostgREST API; there is no separate Express server.
- **Security:** Supabase Auth (hashed passwords, JWT sessions); row-level security on every user table, so users can only read and write their own rows. Progress photos live in a private storage bucket with per-user folders.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

If your browser cannot reach `*.supabase.co` directly (e.g. a sandboxed preview), add `VITE_SUPABASE_DEV_PROXY=1` to `.env.local`. The dev server then proxies `/sb/*` to Supabase.

## Database

`supabase/migrations/` holds the schema (`0001`), library seed (`0002`, generated from `supabase/seed/exercises.mjs` by `node supabase/seed/gen-seed.mjs`) and hardening (`0003`). Exercise photos come from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db).

The brief's suggested tables are consolidated where they would only duplicate one row per user: `users`/`user_profiles`/`fitness_goals`/`user_preferences` live in `profiles`; `workout_days` are `workouts` rows with `program_id` + `day_of_week`; `exercise_sets` are planned sets and `workout_logs` are performed sets (planned vs actual).

## How the "intelligence" works

Everything is deterministic and explainable (`src/lib/coach.ts`, `src/lib/recommend.ts`, `src/lib/programs.ts`):

- **Progression:** all prescribed reps hit at the same weight in two sessions → add 2–5 kg ("Apply to plan" writes the new weight into the active programme); reps rising at the same weight → keep adding reps first; heaviest set rising over 4 weeks → keep volume steady. Only one of these fires per lift.
- **Plateaus & recovery:** no estimated 1RM (Epley, sets of 12 reps or fewer) gain over the last 3 sessions within ~4 months → suggest same-muscle alternatives you have equipment for; e1RM falling two sessions running → extra rest/deload.
- **Volume & balance:** weekly working sets per muscle versus goal-based targets (e.g. 10–20 for hypertrophy). A set counts fully for an exercise's main muscle and half for its other and secondary muscles (bench press = 1 chest, ½ triceps, ½ shoulders). Warm-up sets (tap the set number while training) are excluded everywhere. Also hamstring:quad and pull:push ratios, and muscles not trained in 14 days.
- **Cardio & consistency:** weekly cardio minutes against the goal; completed versus planned sessions since the programme started (judged after its first full week).
- **Freshness:** this week's recommendations are re-checked on every visit: numbers update, and open ones whose rule no longer applies are removed.
- **Programmes:** split templates fill each slot with the best-ranked exercise for your level, goal, environment and equipment, then rebalance sets so each muscle lands in its weekly range without pushing another muscle out of it. The planner flags muscles trained on back-to-back days. Sessions start from the last weight you used when the plan has none.

## Before going live

- Turn on *Leaked password protection* in Supabase → Authentication → Settings.
- Configure a custom SMTP provider for confirmation emails (Supabase's built-in mailer is rate-limited).
