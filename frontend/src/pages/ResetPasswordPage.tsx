import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { supabase } from '../supabase'

export default function ResetPasswordPage() {
  const { updatePassword, signOut, isConfigured } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingRecovery, setIsPreparingRecovery] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function prepareRecoverySession() {
      if (!isConfigured || !supabase) {
        if (mounted) {
          setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
          setIsPreparingRecovery(false)
        }
        return
      }

      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setSessionError) throw setSessionError

          // Remove sensitive tokens from URL once consumed.
          window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
        } else {
          const url = new URL(window.location.href)
          const code = url.searchParams.get('code')
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) throw exchangeError
          }
        }

        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          throw new Error('Invalid or expired reset link. Please request a new password reset email.')
        }

        if (mounted) {
          setError(null)
          setIsPreparingRecovery(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to verify reset link. Please request a new one.')
          setIsPreparingRecovery(false)
        }
      }
    }

    void prepareRecoverySession()

    return () => {
      mounted = false
    }
  }, [isConfigured])

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
      await updatePassword(password)
      await signOut()
      navigate('/login', {
        replace: true,
        state: { notice: 'Password updated. Please log in with your new password.' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password. Open the reset link from your email again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
      <div className="mb-5 grid gap-2">
        <h1 className="display text-2xl font-semibold text-[color:var(--page-text)]">Reset password</h1>
        <p className="text-sm text-[color:var(--body-muted)]">Set a new password for your account.</p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--body-muted)]">New password</span>
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
          <span className="text-[color:var(--body-muted)]">Confirm new password</span>
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

        <button type="submit" className="vm-primary-button py-3 text-sm font-semibold" disabled={isSubmitting || isPreparingRecovery}>
          {isSubmitting ? 'Updating password...' : 'Update password'}
        </button>

        {isPreparingRecovery ? <div className="text-xs text-[color:var(--body-muted)]">Validating reset link...</div> : null}
      </form>

      <div className="mt-4 text-sm text-[color:var(--body-muted)]">
        Back to{' '}
        <Link className="text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.3)] underline-offset-4" to="/login">
          login
        </Link>
      </div>
    </div>
  )
}