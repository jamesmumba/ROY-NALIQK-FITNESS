import { Link, Navigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { ExerciseCard, useLibraryFilter } from '../components/LibraryFilters'
import { Empty, PageHeader, SectionTitle, Spinner, useAsync } from '../components/ui'
import { loadLibrary } from '../lib/data'
import type { Exercise } from '../lib/types'

export default function MuscleGroupPage() {
  const { group = '' } = useParams()
  const { data: lib } = useAsync(loadLibrary, [])
  const { visible, controls } = useLibraryFilter(lib)
  if (!lib) return <Spinner />
  const g = lib.groups.find((x) => x.slug === group)
  if (!g) return <Navigate to="/library" replace />

  const children = lib.groups.filter((x) => x.parent_slug === g.slug)
  const parts = children.length ? children : [g]

  return (
    <div className="animate-rise">
      <Link to="/library" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Library</Link>
      <PageHeader eyebrow="Exercise Library" title={g.name} />
      <div className="mb-8">{controls}</div>

      {parts.map((part) => {
        const items = visible.filter((e) => e.muscles.includes(part.slug))
        return (
          <section key={part.slug} className="mb-10">
            {children.length > 0 && <h2 className="display mb-4 text-3xl text-muted">{part.name}</h2>}
            {part.slug === 'cardio' ? <Grid items={items} /> : (
              <div className="space-y-6">
                <div><SectionTitle>Compound movements</SectionTitle><Grid items={items.filter((e) => e.classification === 'compound')} /></div>
                <div><SectionTitle>Isolation movements</SectionTitle><Grid items={items.filter((e) => e.classification === 'isolation')} /></div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Grid({ items }: { items: Exercise[] }) {
  if (!items.length) return <Empty title="None available">Nothing matches the current environment and equipment filters.</Empty>
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((e) => <ExerciseCard key={e.id} e={e} />)}</div>
}
