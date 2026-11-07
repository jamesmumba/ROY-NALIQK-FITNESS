import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { useProfile } from '../auth'
import type { Library } from '../lib/data'
import type { Env, Exercise, Level } from '../lib/types'
import { ExerciseImage } from './ExerciseImage'
import { Badge, Chip, Input, Segmented, Select } from './ui'

/** Library filter state: environment (synced to profile), equipment, difficulty, search. */
export function useLibraryFilter(lib: Library | null) {
  const { profile, patchProfile } = useProfile()
  const env = profile.active_env
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState<Level | ''>('')
  const [picked, setPicked] = useState<Record<Env, Set<string>>>({ home: new Set(profile.equipment), gym: new Set() })
  const equipment = picked[env]

  const visible = useMemo(() => {
    if (!lib) return []
    const term = q.trim().toLowerCase()
    return lib.exercises.filter((e) =>
      e.environments.includes(env)
      && (env === 'home' || equipment.size === 0 ? true : e.equipment.every((x) => x === 'bodyweight' || equipment.has(x)))
      && (env === 'gym' || e.equipment.every((x) => x === 'bodyweight' || equipment.has(x)))
      && (!difficulty || e.difficulty === difficulty)
      && (!term || e.name.toLowerCase().includes(term)))
  }, [lib, env, equipment, difficulty, q])

  const toggle = (slug: string) => setPicked((p) => {
    const next = new Set(p[env])
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    return { ...p, [env]: next }
  })

  const controls = lib && (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Env> label="Environment" value={env} onChange={(v) => patchProfile({ active_env: v })}
          options={[{ value: 'home', label: 'Home workouts' }, { value: 'gym', label: 'Gym workouts' }]} />
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="pl-9" aria-label="Search exercises" />
        </div>
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Level | '')} className="w-auto" aria-label="Difficulty">
          <option value="">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-faint">{env === 'home' ? 'Equipment I have:' : 'Filter by equipment:'}</span>
        {lib.equipment.filter((e) => e.slug !== 'bodyweight' && (env === 'gym' || e.home)).map((e) => (
          <Chip key={e.slug} active={equipment.has(e.slug)} onClick={() => toggle(e.slug)} className="h-7 text-xs">{e.name}</Chip>
        ))}
      </div>
    </div>
  )

  return { visible, controls, env, filtering: !!q.trim() || !!difficulty }
}

export function ExerciseCard({ e }: { e: Exercise }) {
  return (
    <Link to={`/exercise/${e.slug}`} className="group overflow-hidden rounded-xl border border-line/60 bg-surface transition-colors hover:border-faint">
      <ExerciseImage exercise={e} className="aspect-[4/3] w-full" />
      <div className="p-3">
        <p className="font-semibold leading-tight group-hover:text-accent">{e.name}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge tone={e.classification === 'compound' ? 'accent' : 'neutral'}>{e.classification}</Badge>
          <Badge>{e.difficulty}</Badge>
        </div>
        <p className="mt-2 text-xs text-faint num">{e.rec_sets} × {e.rec_reps} · rest {e.rest_seconds}s</p>
      </div>
    </Link>
  )
}
