import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BrainCircuit, CalendarDays, ChartLine, Dumbbell, HeartPulse, House, LayoutDashboard, Library, Menu, Play, Settings, UserRound, Warehouse, X } from 'lucide-react'
import { useProfile } from '../auth'
import { getOpenSession } from '../lib/data'
import type { Env, Session } from '../lib/types'
import { cx, Segmented } from './ui'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workouts', label: 'My Workouts', icon: Dumbbell },
  { to: '/library', label: 'Exercise Library', icon: Library },
  { to: '/planner', label: 'Workout Planner', icon: CalendarDays },
  { to: '/analytics', label: 'Performance Analytics', icon: ChartLine },
  { to: '/coach', label: 'Fitness Coach', icon: BrainCircuit },
  { to: '/cardio', label: 'Cardio', icon: HeartPulse },
  { to: '/profile', label: 'My Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]
const TABS = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[5]]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('display whitespace-nowrap text-[1.35rem] leading-none tracking-tight', className)}>
      Roy Naliqk<span className="text-accent"> Fitness</span>
    </span>
  )
}

function EnvSwitch() {
  const { profile, patchProfile } = useProfile()
  return (
    <Segmented<Env>
      label="Training environment"
      value={profile.active_env}
      onChange={(v) => patchProfile({ active_env: v })}
      options={[
        { value: 'home', label: <span className="flex items-center gap-1.5"><House className="size-3.5" /><span className="max-sm:sr-only">Home</span></span> },
        { value: 'gym', label: <span className="flex items-center gap-1.5"><Warehouse className="size-3.5" /><span className="max-sm:sr-only">Gym</span></span> },
      ]}
    />
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) => cx(
            'group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sm transition-colors',
            isActive ? 'bg-raised text-fg font-medium' : 'text-muted hover:text-fg hover:bg-raised/50',
          )}
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" aria-hidden />}
              <Icon className={cx('size-[1.05rem]', isActive ? 'text-accent' : 'text-faint group-hover:text-muted')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const { profile } = useProfile()
  const [drawer, setDrawer] = useState(false)
  const [open, setOpen] = useState<Session | null>(null)
  const { pathname } = useLocation()

  useEffect(() => { getOpenSession().then(setOpen).catch(() => setOpen(null)) }, [pathname])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  const first = profile.full_name.split(' ')[0] || 'Athlete'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col border-r border-line/60 bg-bg px-3 py-5">
        <Link to="/" className="px-3 mb-7"><Wordmark /></Link>
        <NavItems />
        <div className="mt-auto space-y-4 px-1">
          <EnvSwitch />
          <Link to="/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised/50">
            <span className="grid size-8 place-items-center rounded-full bg-accent-lo text-accent font-semibold text-sm">{first[0]}</span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">{profile.full_name || 'Your profile'}</span>
              <span className="block text-xs text-faint capitalize">{profile.experience ?? 'Set your level'}</span>
            </span>
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/60 bg-bg/95 backdrop-blur px-4 h-14">
        <Link to="/"><Wordmark className="text-lg" /></Link>
        <div className="flex items-center gap-2">
          <EnvSwitch />
          <button className="grid size-10 place-items-center rounded-lg text-muted hover:text-fg" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
        </div>
      </header>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setDrawer(false)}>
          <div className="animate-rise absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-bg border-l border-line p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <Wordmark className="text-lg" />
              <button className="grid size-10 place-items-center rounded-lg text-muted" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <NavItems onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 sm:px-6 lg:px-10 pt-6 pb-28 lg:pb-12 max-w-[1400px]">
        {open && !pathname.startsWith('/session') && (
          <Link to={`/session/${open.id}`} className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 text-bg">
            <span className="text-sm font-semibold">Workout in progress: {open.name}</span>
            <span className="flex items-center gap-1 text-sm font-semibold"><Play className="size-4 fill-current" /> Resume</span>
          </Link>
        )}
        <Outlet />
      </main>

      {/* Mobile tab bar (hidden mid-workout so it can't be tapped by accident) */}
      {!pathname.startsWith('/session') && <nav aria-label="Quick" className="lg:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t border-line/60 bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2 text-[0.65rem]', isActive ? 'text-accent' : 'text-faint')}>
            <Icon className="size-5" />
            <span className="truncate max-w-full px-1">{label.replace('Exercise ', '').replace('Workout ', '').replace('My ', '').replace('Fitness ', '')}</span>
          </NavLink>
        ))}
      </nav>}
    </div>
  )
}
