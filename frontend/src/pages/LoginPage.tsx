import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

type RedirectState = {
  from?: {
    pathname?: string
  }
  notice?: string
}

export default function LoginPage() {
  const { signIn, isConfigured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectPath = useMemo(() => {
    const state = location.state as RedirectState | null
    return state?.from?.pathname || '/my-trips'
  }, [location.state])

  const notice = useMemo(() => {
    const state = location.state as RedirectState | null
    return state?.notice ?? null
  }, [location.state])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!isConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    setIsSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate(redirectPath, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
      <div className="mb-5 grid gap-2">
        <h1 className="display text-2xl font-semibold text-[color:var(--page-text)]">Log in</h1>
        <p className="text-sm text-[color:var(--body-muted)]">Access your saved trips and run history.</p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--body-muted)]">Email</span>
          <input
            className="vm-field px-4 py-3"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--body-muted)]">Password</span>
          <input
            className="vm-field px-4 py-3"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

        <button type="submit" className="vm-primary-button py-3 text-sm font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      {notice ? <div className="mt-4 rounded-[14px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div> : null}

      <div className="mt-4 text-sm text-[color:var(--body-muted)]">
        New here?{' '}
        <Link className="text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.3)] underline-offset-4" to="/signup">
          Create an account
        </Link>
      </div>
    </div>
  )
}
