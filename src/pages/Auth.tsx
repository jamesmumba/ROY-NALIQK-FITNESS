import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { Wordmark } from '../components/Layout'
import { Button, ErrorNote, Field, Input } from '../components/ui'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'register') {
      if (name.trim().length < 2) return setError('Please enter your full name.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
      if (password !== confirm) return setError('Passwords do not match.')
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        nav(from, { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin + '/onboarding' },
        })
        if (error) throw error
        if (data.session) nav('/onboarding', { replace: true })
        else setSent(true)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-line/60 p-12">
        <Wordmark />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-1/2 -translate-y-1/2 size-[34rem] rounded-full border-[3.5rem] border-accent/10" />
        <h1 className="display relative text-[clamp(3.5rem,7vw,7.5rem)] leading-[0.86]">
          Train smarter.<br />Build stronger.<br /><span className="text-accent">Perform better.</span>
        </h1>
        <p className="relative max-w-md text-muted">
          Plan your week, log every set, and get coaching built on your own numbers, at home or in the gym.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-rise">
          <Wordmark className="lg:hidden mb-10 block" />
          {sent ? (
            <div>
              <h2 className="display text-4xl">Check your inbox</h2>
              <p className="mt-3 text-muted">We sent a confirmation link to <span className="text-fg">{email}</span>. Open it to activate your account, then sign in.</p>
              <Link to="/login" className="mt-6 inline-block text-accent hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <>
              <h2 className="display text-4xl">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
              <p className="mt-2 mb-8 text-muted">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Two minutes to set up, then we build your programme.'}</p>
              <form onSubmit={submit} className="space-y-4" noValidate>
                {mode === 'register' && (
                  <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
                )}
                <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
                <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
                </Field>
                {mode === 'register' && (
                  <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
                )}
                <ErrorNote error={error} />
                <Button type="submit" variant="primary" size="lg" busy={busy} className="w-full">
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </Button>
              </form>
              <p className="mt-6 text-sm text-muted">
                {mode === 'login' ? <>New here? <Link to="/register" className="text-accent hover:underline">Create an account</Link></>
                  : <>Already registered? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
