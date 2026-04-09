import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function ForgotPasswordPage() {
  const { requestPasswordReset, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [cooldownUntil])

  const isCooldownActive = cooldownUntil > now
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!isConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    if (isCooldownActive) {
      setError(`Please wait ${cooldownSeconds}s before requesting another reset email.`)
      return
    }

    setIsSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setNotice('If that email exists, we sent a password reset link. Check your inbox.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
        const cooldownMs = 60_000
        setCooldownUntil(Date.now() + cooldownMs)
        setNow(Date.now())
        setError('Too many reset emails requested. Please wait 60s, then try again.')
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
      <div className="mb-5 grid gap-2">
        <h1 className="display text-2xl font-semibold text-[color:var(--page-text)]">Forgot password</h1>
        <p className="text-sm text-[color:var(--body-muted)]">Enter your account email and we will send a reset link.</p>
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

        {error ? <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        {notice ? <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div> : null}

        <button type="submit" className="vm-primary-button py-3 text-sm font-semibold" disabled={isSubmitting || isCooldownActive}>
          {isSubmitting ? 'Sending reset link...' : isCooldownActive ? `Try again in ${cooldownSeconds}s` : 'Send reset link'}
        </button>
      </form>

      <div className="mt-4 text-sm text-[color:var(--body-muted)]">
        Remembered it?{' '}
        <Link className="text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.3)] underline-offset-4" to="/login">
          Back to login
        </Link>
      </div>
    </div>
  )
}