import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { ExerciseImage } from '../components/ExerciseImage'
import { ExerciseCard, useLibraryFilter } from '../components/LibraryFilters'
import { Empty, PageHeader, Spinner, useAsync } from '../components/ui'
import { loadLibrary } from '../lib/data'

const SECTIONS = [
  { slug: 'chest', covers: ['chest'], cover: 'Barbell_Bench_Press_-_Medium_Grip' },
  { slug: 'back', covers: ['back'], cover: 'Pullups' },
  { slug: 'legs', covers: ['quads', 'hamstrings', 'glutes', 'calves'], cover: 'Barbell_Squat' },
  { slug: 'shoulders', covers: ['shoulders'], cover: 'Standing_Military_Press' },
  { slug: 'biceps', covers: ['biceps'], cover: 'Barbell_Curl' },
  { slug: 'triceps', covers: ['triceps'], cover: 'Triceps_Pushdown' },
  { slug: 'core', covers: ['core'], cover: 'Ab_Roller' },
  { slug: 'cardio', covers: ['cardio'], cover: 'Rowing_Stationary' },
]

export default function Library() {
  const { data: lib } = useAsync(loadLibrary, [])
  const { visible, controls, env, filtering } = useLibraryFilter(lib)
  if (!lib) return <Spinner />

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={`${lib.exercises.length} exercises · ${env === 'home' ? 'Home' : 'Gym'}`} title="Exercise Library">
        Every major muscle group, split into compound and isolation movements, with instructions, common mistakes and alternatives.
      </PageHeader>
      <div className="mb-6">{controls}</div>

      {filtering ? (
        visible.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visible.map((e) => <ExerciseCard key={e.id} e={e} />)}</div>
        ) : <Empty title="No matches">Try another search, level, or equipment selection.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s) => {
            const group = lib.groups.find((g) => g.slug === s.slug)!
            const items = visible.filter((e) => e.muscles.some((m) => s.covers.includes(m)))
            return (
              <Link key={s.slug} to={`/library/${s.slug}`} className="group relative overflow-hidden rounded-xl border border-line/60 bg-surface transition-colors hover:border-accent/60">
                <ExerciseImage exercise={{ image_id: s.cover, name: group.name, classification: 'compound' }} className="aspect-[16/10] w-full opacity-90 grayscale-[35%] transition group-hover:grayscale-0" />
                <div className="flex items-end justify-between gap-2 p-4">
                  <div>
                    <h2 className="display text-2xl">{group.name}</h2>
                    <p className="mt-1 text-sm text-muted num">
                      {s.slug === 'cardio' ? `${items.length} activities` : `${items.filter((e) => e.classification === 'compound').length} compound · ${items.filter((e) => e.classification === 'isolation').length} isolation`}
                    </p>
                  </div>
                  <ArrowUpRight className="size-5 text-faint transition group-hover:text-accent" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
