import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function SignupPage() {
  const { signUp, isConfigured } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!isConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await signUp(email.trim(), password)
      if (result.requiresEmailConfirmation) {
        navigate('/login', {
          replace: true,
          state: { notice: 'Check your email to confirm your account, then log in.' },
        })
        return
      }
      navigate('/my-trips', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
      <div className="mb-5 grid gap-2">
        <h1 className="display text-2xl font-semibold text-[color:var(--page-text)]">Create account</h1>
        <p className="text-sm text-[color:var(--body-muted)]">Sign up to keep trips private to your account.</p>
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--body-muted)]">Confirm password</span>
          <input
            className="vm-field px-4 py-3"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

        {error ? <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        <button type="submit" className="vm-primary-button py-3 text-sm font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Sign up'}
        </button>
      </form>

      <div className="mt-4 text-sm text-[color:var(--body-muted)]">
        Already have an account?{' '}
        <Link className="text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.3)] underline-offset-4" to="/login">
          Log in
        </Link>
      </div>
    </div>
  )
}
