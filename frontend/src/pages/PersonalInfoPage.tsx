import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { supabase, supabaseConfigError } from '../supabase'

type RunStats = {
  total: number
  completed: number
  running: number
  failed: number
}

export default function PersonalInfoPage() {
  const { user, updatePassword, signOut, isConfigured } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState<RunStats>({ total: 0, completed: 0, running: 0, failed: 0 })
  const [preferenceCount, setPreferenceCount] = useState(0)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)

  const memberSince = useMemo(() => {
    if (!user?.created_at) return 'Unknown'
    return new Date(user.created_at).toLocaleDateString()
  }, [user?.created_at])

  useEffect(() => {
    async function loadSummary() {
      if (!user || !supabase || supabaseConfigError) return

      setIsLoadingStats(true)
      try {
        const { data: runRows, error: runError } = await supabase
          .from('agent_runs')
          .select('status')
          .eq('user_id', user.id)

        if (!runError && runRows) {
          const nextStats: RunStats = { total: runRows.length, completed: 0, running: 0, failed: 0 }
          for (const row of runRows) {
            const status = String(row.status ?? '').toLowerCase()
            if (status === 'completed' || status === 'complete') nextStats.completed += 1
            else if (status === 'running') nextStats.running += 1
            else if (status === 'failed') nextStats.failed += 1
          }
          setStats(nextStats)
        }

        const { data: prefRows, error: prefError } = await supabase
          .from('user_preferences')
          .select('preference_key')
          .eq('user_id', user.id)

        if (!prefError && prefRows) {
          setPreferenceCount(new Set(prefRows.map((row) => row.preference_key)).size)
        }
      } finally {
        setIsLoadingStats(false)
      }
    }

    loadSummary()
  }, [user])

  async function handlePasswordUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordNotice(null)

    if (!isConfigured) {
      setPasswordError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setIsUpdatingPassword(true)
    try {
      await updatePassword(newPassword)
      await signOut()
      navigate('/login', {
        replace: true,
        state: { notice: 'Password changed successfully. Please log in again.' },
      })
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="display text-3xl font-semibold text-[color:var(--page-text)]">Personal Info</h1>
        <p className="max-w-2xl text-sm text-[color:var(--body-muted)]">
          Manage your account profile and security settings here. For travel history and plan results, use My Trips.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="theme-surface rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Email</div>
          <div className="mt-2 break-all text-sm text-[color:var(--page-text)]">{user?.email ?? 'Unknown'}</div>
        </article>
        <article className="theme-surface rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Member Since</div>
          <div className="mt-2 text-sm text-[color:var(--page-text)]">{memberSince}</div>
        </article>
        <article className="theme-surface rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Account ID</div>
          <div className="mt-2 break-all font-mono text-xs text-[color:var(--body-muted)]">{user?.id ?? 'Unknown'}</div>
        </article>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <article className="theme-surface rounded-[22px] border p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Total Trips</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--page-text)]">{isLoadingStats ? '...' : stats.total}</div>
        </article>
        <article className="theme-surface rounded-[22px] border p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Completed</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--page-text)]">{isLoadingStats ? '...' : stats.completed}</div>
        </article>
        <article className="theme-surface rounded-[22px] border p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Running</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--page-text)]">{isLoadingStats ? '...' : stats.running}</div>
        </article>
        <article className="theme-surface rounded-[22px] border p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Preference Keys</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--page-text)]">{isLoadingStats ? '...' : preferenceCount}</div>
        </article>
      </section>

      <section className="theme-surface rounded-[22px] border p-5 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
        <div className="mb-4 grid gap-1">
          <h2 className="display text-2xl font-semibold text-[color:var(--page-text)]">Security</h2>
          <p className="text-sm text-[color:var(--body-muted)]">Change your password and secure your account.</p>
        </div>

        <form className="grid gap-4 md:max-w-xl" onSubmit={handlePasswordUpdate}>
          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--body-muted)]">New password</span>
            <input
              className="vm-field px-4 py-3"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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

          {passwordError ? <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{passwordError}</div> : null}
          {passwordNotice ? <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{passwordNotice}</div> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="vm-primary-button px-5 py-3 text-sm font-semibold" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Updating password...' : 'Update password'}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-[12px] border border-[var(--surface-border)] px-4 py-2 text-sm font-semibold text-[color:var(--page-text)] transition hover:border-[rgba(212,136,58,0.4)] hover:text-[color:var(--amber)]"
            >
              Sign out
            </button>

            <Link
              to="/my-trips"
              className="text-sm text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.3)] underline-offset-4"
            >
              Back to My Trips
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
