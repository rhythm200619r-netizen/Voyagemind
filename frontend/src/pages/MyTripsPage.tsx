import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

import { useAuth } from '../auth/AuthContext'
import Tooltip from '../components/Tooltip'
import TravelDNACard from '../components/TravelDNACard'
import { TripCard3D } from '../components/3d/TripCard3D'
import { supabase, supabaseConfigError } from '../supabase'

type AgentRunRow = {
  id: string
  created_at: string
  prompt: string
  status: string
}

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any },
  },
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()

  if (normalized === 'running') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(212,136,58,0.2)] bg-[rgba(212,136,58,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--amber)]">
        <span className="h-2 w-2 rounded-full bg-[color:var(--amber)] animate-[orbPulse_2s_ease-in-out_infinite]" />
        Running
      </span>
    )
  }

  if (normalized === 'completed' || normalized === 'complete') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" style={{ strokeDasharray: '24', strokeDashoffset: 24, animation: 'drawCheck 0.45s ease forwards' }} />
        </svg>
        Complete
      </span>
    )
  }

  if (normalized === 'failed') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-[linear-gradient(120deg,rgba(192,57,43,0.16),rgba(212,136,58,0.12),rgba(192,57,43,0.16))] bg-[length:200%_100%] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200 animate-[shimmer_1.4s_linear_infinite]">
        Failed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f3ede4]/70">
      Pending
    </span>
  )
}

export default function MyTripsPage() {
  const { user } = useAuth()
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRead = supabaseConfigError === null && supabase !== null

  const sorted = useMemo(() => {
    return [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [runs])

  useEffect(() => {
    async function load() {
      if (!canRead) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        return
      }
      if (!user) {
        setRuns([])
        return
      }
      const sb = supabase
      if (!sb) {
        setError('Supabase client is not configured')
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchErr } = await sb
          .from('agent_runs')
          .select('id,created_at,prompt,status')
          .eq('user_id', user.id)
          .eq('booked', true)
          .order('created_at', { ascending: false })
          .limit(20)

        if (fetchErr) throw fetchErr
        setRuns((data ?? []) as AgentRunRow[])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [canRead, user])

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="display text-3xl font-semibold text-[color:var(--page-text)]">My Trips</h1>
        <p className="max-w-2xl text-sm text-[color:var(--body-muted)]">Confirmed bookings only. Generated runs stay in Trip details until you lock a flight and hotel.</p>
      </section>

      {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      <TravelDNACard />

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid gap-3">
        {isLoading ? (
          <div className="text-sm text-[color:var(--body-muted)]">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-[color:var(--body-muted)]">No booked trips yet.</div>
        ) : (
          sorted.map((run) => (
            <motion.div key={run.id} variants={itemVariants}>
              <TripCard3D className="h-full">
                <div className="theme-surface rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.14)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-3">
                      <Tooltip label={run.prompt} placement="top">
                        <div className="display truncate text-base font-medium text-[color:var(--page-text)]">{run.prompt}</div>
                      </Tooltip>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--body-muted)]">
                        <span>{new Date(run.created_at).toLocaleString()}</span>
                        <StatusBadge status={run.status} />
                        <Tooltip label={run.id} placement="top">
                          <span className="cursor-help font-mono text-[color:var(--page-text)] underline decoration-dotted decoration-[rgba(212,136,58,0.2)] underline-offset-4">
                            {run.id.slice(0, 8)}...
                          </span>
                        </Tooltip>
                      </div>
                    </div>

                    <Link
                      to={`/trips/${run.id}`}
                      className="vm-primary-button shrink-0 px-4 py-2.5 text-xs font-semibold"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </TripCard3D>
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  )
}
