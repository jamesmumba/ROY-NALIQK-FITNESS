import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { useProfile } from '../auth'
import type { Library } from '../lib/data'
import { availableEquipment, isAvailable, recommendExercises } from '../lib/recommend'
import type { Exercise } from '../lib/types'
import { ExerciseImage } from './ExerciseImage'
import { Badge, Chip, Input, Modal } from './ui'

const PICKABLE = ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'calves', 'shoulders', 'biceps', 'triceps', 'core', 'cardio']

/** Modal to choose an exercise: by muscle group, with ranked recommendations and the reason for each. */
export function ExercisePicker({ lib, open, onClose, onPick, title = 'Add exercise' }:
  { lib: Library; open: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string }) {
  const { profile } = useProfile()
  const [muscle, setMuscle] = useState(profile.target_muscles[0] && PICKABLE.includes(profile.target_muscles[0]) ? profile.target_muscles[0] : 'chest')
  const [q, setQ] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const env = profile.active_env
  const equipment = availableEquipment(profile, env)

  const ranked = useMemo(
    () => recommendExercises(lib.exercises, muscle, { env, equipment, level: profile.experience, goal: profile.goal, avoid: profile.avoid_exercises }),
    [lib, muscle, env, equipment, profile],
  )

  const searched = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return null
    return lib.exercises.filter((e) => e.name.toLowerCase().includes(term) && (!onlyAvailable || isAvailable(e, env, equipment)))
  }, [q, lib, onlyAvailable, env, equipment])

  const others = useMemo(() => lib.exercises.filter((e) => e.muscles.includes(muscle) && !ranked.some((r) => r.exercise.id === e.id)), [lib, muscle, ranked])

  const pick = (e: Exercise) => { onPick(e); onClose() }

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all exercises" className="pl-9" aria-label="Search exercises" />
      </div>

      {searched ? (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="accent-[var(--color-accent)]" />
            Only exercises I can do {env === 'home' ? 'at home' : 'at the gym'}
          </label>
          <ul className="divide-y divide-line">
            {searched.map((e) => <Row key={e.id} e={e} onPick={pick} />)}
            {!searched.length && <p className="py-6 text-center text-sm text-muted">No exercises match “{q}”.</p>}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PICKABLE.map((m) => (
              <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>{lib.groups.find((g) => g.slug === m)?.name}</Chip>
            ))}
          </div>
          <p className="eyebrow mb-2 flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent" /> Recommended for you · {env === 'home' ? 'Home' : 'Gym'}</p>
          <ul className="divide-y divide-line">
            {ranked.map((r) => <Row key={r.exercise.id} e={r.exercise} reason={r.reasons.slice(0, 2).join(' · ')} onPick={pick} />)}
            {!ranked.length && <p className="py-6 text-center text-sm text-muted">Nothing available with your current equipment. Switch environment or update equipment in your profile.</p>}
          </ul>
          {others.length > 0 && (
            <>
              <p className="eyebrow mt-5 mb-2">Needs other equipment</p>
              <ul className="divide-y divide-line opacity-70">{others.map((e) => <Row key={e.id} e={e} onPick={pick} />)}</ul>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function Row({ e, reason, onPick }: { e: Exercise; reason?: string; onPick: (e: Exercise) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-raised/60 rounded-lg px-2 -mx-2 transition-colors">
        <ExerciseImage exercise={e} className="size-12 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{e.name}</span>
            <Badge tone={e.classification === 'compound' ? 'accent' : 'neutral'}>{e.classification}</Badge>
          </span>
          <span className="block truncate text-xs text-faint">{reason ?? `${e.rec_sets} × ${e.rec_reps} · ${e.equipment.join(', ').replace(/_/g, ' ')}`}</span>
        </span>
      </button>
    </li>
  )
}
