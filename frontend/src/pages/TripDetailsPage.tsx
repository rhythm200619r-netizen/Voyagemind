import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import AgentEventFeed from '../components/AgentEventFeed'
import { supabase, supabaseConfigError } from '../supabase'
import type { AgentEvent } from '../lib/agentEvents'

type AgentRunRow = {
  id: string
  created_at: string
  prompt: string
  status: string
}

type InsertPayload<T> = {
  new: T
}

const agentDescriptions: Record<string, string> = {
  'Flight Negotiator': 'Searches and ranks flight options by price, duration, and comfort',
  'Accommodation Scout': 'Finds hotels and rentals matching your style and budget',
  'Local Itinerary Expert': 'Builds a day-by-day schedule with timing and logistics',
  'Budget Analyst': 'Monitors spend across all bookings against your total budget',
  Orchestrator: 'Coordinates the trip plan and combines all agent outputs',
  'Prompt Parser': 'Extracts trip details, dates, budget, and intent from your prompt',
  'run_started': 'Signals that planning has begun',
}

export default function TripDetailsPage() {
  const { user } = useAuth()
  const params = useParams<{ runId: string }>()
  const runId = params.runId ?? ''

  const [run, setRun] = useState<AgentRunRow | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const canRead = supabaseConfigError === null && supabase !== null

  useEffect(() => {
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [events.length])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | undefined

    async function load() {
      if (!runId) return
      if (!canRead) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        return
      }
      if (!user) {
        setRun(null)
        setEvents([])
        return
      }

      const sb = supabase
      if (!sb) {
        setError('Supabase client is not configured')
        return
      }

      setIsLoading(true)
      setError(null)
      setRun(null)
      setEvents([])

      if (channelRef.current) {
        await sb.removeChannel(channelRef.current)
        channelRef.current = null
      }

      const upsertEvent = (next: AgentEvent) => {
        setEvents((prev) => {
          if (prev.some((event) => event.id === next.id)) return prev
          return [...prev, next]
        })
      }

      const fetchRunAndEvents = async () => {
        const { data: runRows, error: runErr } = await sb
          .from('agent_runs')
          .select('id,created_at,prompt,status')
          .eq('id', runId)
          .eq('user_id', user.id)
          .limit(1)

        if (runErr) throw runErr

        const foundRun = (runRows?.[0] as AgentRunRow | undefined) ?? null
        setRun(foundRun)
        if (!foundRun) {
          setEvents([])
          return
        }

        const { data: eventRows, error: eventErr } = await sb
          .from('agent_events')
          .select('*')
          .eq('run_id', runId)
          .order('id', { ascending: true })

        if (eventErr) throw eventErr

        for (const event of (eventRows as AgentEvent[]) ?? []) upsertEvent(event)
      }

      try {
        const runLookup = await sb
          .from('agent_runs')
          .select('id')
          .eq('id', runId)
          .eq('user_id', user.id)
          .limit(1)

        if (runLookup.error) throw runLookup.error
        if (!runLookup.data?.length) {
          setRun(null)
          setEvents([])
          return
        }

        const channel = sb
          .channel(`agent-events-${runId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'agent_events',
              filter: `run_id=eq.${runId}`,
            },
            (payload: InsertPayload<AgentEvent>) => upsertEvent(payload.new),
          )
          .subscribe()

        channelRef.current = channel

        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => resolve(), 1200)
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              window.clearTimeout(timeout)
              resolve()
            }
          })
        })

        await fetchRunAndEvents()

        intervalId = window.setInterval(async () => {
          if (cancelled) return
          try {
            await fetchRunAndEvents()
            const latestStatus = (await sb.from('agent_runs').select('status').eq('id', runId).limit(1)).data?.[0]
              ?.status as string | undefined
            if (latestStatus && latestStatus !== 'running' && latestStatus !== 'queued') {
              if (intervalId) window.clearInterval(intervalId)
            }
          } catch {
            // Ignore transient network issues.
          }
        }, 1200)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [canRead, runId, user])

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-semibold text-[#f5eee5]">Trip details</h1>
          <Link
            to="/my-trips"
            className="text-sm font-medium text-[color:var(--amber)] underline decoration-[rgba(212,136,58,0.32)] underline-offset-4 transition hover:text-[#f7c57f]"
          >
            My Trips
          </Link>
        </div>
        <div className="text-sm text-[color:var(--muted)]">
          Trip ID: <span className="font-mono text-xs text-[#f5eee5]/80">{runId}</span>
        </div>
      </section>

      {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      <section className="grid gap-3 rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)] transition hover:border-[rgba(212,136,58,0.22)]">
        {isLoading ? (
          <div className="text-sm text-[#f5eee5]/62">Loading…</div>
        ) : run ? (
          <>
            <div className="display text-sm uppercase tracking-[0.22em] text-[color:var(--amber)]">Prompt</div>
            <div className="whitespace-pre-wrap text-sm text-[#f5eee5]">{run.prompt}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]">
              <span>{new Date(run.created_at).toLocaleString()}</span>
              <span>Status: {run.status}</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-[color:var(--muted)]">Trip not found (or not readable).</div>
        )}
      </section>

      <section className="rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] shadow-[0_16px_50px_rgba(0,0,0,0.14)]">
        <div className="flex items-center justify-between border-b border-[var(--fog-border)] p-4">
          <h2 className="display text-sm font-semibold text-[#f5eee5]">Live updates</h2>
          <span className="text-xs text-[color:var(--muted)]">Streaming via Supabase Realtime</span>
        </div>

        <div className="p-4">
          <AgentEventFeed
            events={events}
            isStreaming={Boolean(run && (run.status === 'running' || run.status === 'queued'))}
            agentDescriptions={agentDescriptions}
          />
          <div ref={bottomRef} />
        </div>
      </section>
    </div>
  )
}
