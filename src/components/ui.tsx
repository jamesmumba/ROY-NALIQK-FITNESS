import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent-hi font-semibold',
  secondary: 'bg-raised text-fg hover:bg-line border border-line',
  ghost: 'text-muted hover:text-fg hover:bg-raised',
  danger: 'text-bad hover:bg-bad/10 border border-bad/30',
}

export function Button({ variant = 'secondary', size = 'md', busy, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none select-none',
        size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
        VARIANTS[variant], className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('rounded-xl bg-surface border border-line/60', className)}>{children}</div>
}

export function PageHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-4xl sm:text-5xl text-fg">{title}</h1>
        {children && <div className="mt-2 text-muted max-w-2xl">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 [&>select]:max-w-full">
      <h2 className="text-[0.95rem] font-semibold text-fg [font-stretch:90%] uppercase tracking-wide">{children}</h2>
      {action}
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

// width defaults to full unless the caller passes its own w-* class
const sized = (c?: string) => (c && /(^|\s)w-/.test(c) ? c : cx('w-full', c))
const inputCls = 'rounded-lg bg-bg border border-line px-3 h-10 text-fg placeholder:text-faint focus:border-accent focus:outline-none transition-colors'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, sized(props.className))} />
}

export function NumberInput({ value, onChange, className, ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={cx(inputCls, 'num', sized(className))}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(inputCls, 'pr-8', sized(className))}>{children}</select>
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'h-auto py-2 min-h-20', sized(props.className))} />
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-sm transition-colors',
        active ? 'border-accent bg-accent-lo text-fg' : 'border-line text-muted hover:text-fg hover:border-faint', className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-bg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-8 px-3 rounded-md text-sm transition-colors', value === o.value ? 'bg-raised text-fg font-medium' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const t = {
    neutral: 'bg-raised text-muted',
    accent: 'bg-accent-lo text-accent-hi',
    ok: 'bg-ok/12 text-ok',
    warn: 'bg-warn/12 text-warn',
    bad: 'bg-bad/12 text-bad',
  }[tone]
  return <span className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide', t)}>{children}</span>
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className={cx('display num mt-1.5 text-3xl', accent ? 'text-accent' : 'text-fg')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-faint">{sub}</p>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-semibold text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> <span className="text-sm">{label}…</span>
    </div>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title}
        className={cx('animate-rise w-full max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-surface border border-line', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 h-14 shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

/** Small async-state helper: run a loader, expose data/error/reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setError(null)
    fn().then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, reload: () => setTick((t) => t + 1), setData }
}

export { cx }
