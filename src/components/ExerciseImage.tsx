import { useEffect, useState } from 'react'
import { Dumbbell, HeartPulse } from 'lucide-react'
import type { Exercise } from '../lib/types'
import { cx } from './ui'

const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

/** Exercise photo. With `animate`, alternates start/end positions as a movement demonstration. */
export function ExerciseImage({ exercise, animate, className }: { exercise: Pick<Exercise, 'image_id' | 'name' | 'classification'>; animate?: boolean; className?: string }) {
  const [frame, setFrame] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!animate || !exercise.image_id) return
    const t = setInterval(() => setFrame((f) => 1 - f), 1100)
    return () => clearInterval(t)
  }, [animate, exercise.image_id])

  if (!exercise.image_id || failed) {
    const Icon = exercise.classification === 'cardio' ? HeartPulse : Dumbbell
    return (
      <div className={cx('flex items-center justify-center bg-raised text-faint', className)} aria-hidden>
        <Icon className="size-1/4 min-w-6 max-w-12" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className={cx('relative overflow-hidden bg-white', className)}>
      {[0, 1].map((i) => (
        <img
          key={i}
          src={`${BASE}/${exercise.image_id}/${i}.jpg`}
          alt={i === 0 ? `${exercise.name} demonstration` : ''}
          loading="lazy"
          onError={() => i === 0 && setFailed(true)}
          className={cx('absolute inset-0 size-full object-cover transition-opacity duration-300', (animate ? frame : 0) === i ? 'opacity-100' : 'opacity-0')}
        />
      ))}
    </div>
  )
}
