import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'

import { supabase, supabaseConfigError } from '../supabase'
import { badgeClassForEventType, getItinerary, type AgentEvent } from '../lib/agentEvents'

type InsertPayload<T> = {
  new: T
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export default function PlanPage() {
  const [prompt, setPrompt] = useState('Plan a 3-day trip to Tokyo for food and museums under $1200')
  const [persona, setPersona] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const canStream = supabaseConfigError === null && supabase !== null

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [events])

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
  }, [sortedEvents.length])

  async function startRun() {
    if (!canStream) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      return
    }

    const sb = supabase
    if (!sb) {
      setError('Supabase client is not configured')
      return
    }

    setIsStarting(true)
    setError(null)
    setEvents([])
    setRunId(null)

    if (channelRef.current) {
      await sb.removeChannel(channelRef.current)
      channelRef.current = null
    }

    try {
      const resp = await fetch(`${API_URL}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          orchestrator_persona: persona || null,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`API error: ${resp.status} ${text}`)
      }

      const data = (await resp.json()) as { run_id: string }
      setRunId(data.run_id)

      const upsertEvent = (next: AgentEvent) => {
        setEvents((prev: AgentEvent[]) => {
          if (prev.some((e: AgentEvent) => e.id === next.id)) return prev
          return [...prev, next]
        })
      }

      const channel = sb
        .channel(`agent-events-${data.run_id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_events',
            filter: `run_id=eq.${data.run_id}`,
          },
          (payload: InsertPayload<AgentEvent>) => {
            upsertEvent(payload.new)
          },
        )
        .subscribe()

      channelRef.current = channel

      const { data: existing, error: fetchErr } = await sb
        .from('agent_events')
        .select('*')
        .eq('run_id', data.run_id)
        .order('id', { ascending: true })

      if (fetchErr) throw fetchErr
      for (const ev of (existing as AgentEvent[]) ?? []) upsertEvent(ev)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">Plan a trip</h1>
        <p className="text-sm text-slate-600">Start a run and watch agent events stream live.</p>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
        <label className="grid gap-2">
          <span className="text-sm font-medium dark:text-slate-100">Trip prompt</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:ring-white/10"
            value={prompt}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium dark:text-slate-100">Orchestrator persona (optional)</span>
          <input
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-white/10"
            value={persona}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPersona(e.target.value)}
            placeholder="e.g. concise, luxury-focused, budget-friendly"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 active:bg-slate-950 disabled:opacity-50 disabled:hover:bg-slate-900"
            onClick={startRun}
            disabled={!canStream || isStarting || prompt.trim().length === 0}
          >
            {isStarting ? 'Starting…' : 'Start run'}
          </button>

          <div className="text-sm text-slate-700 dark:text-slate-300">
            {runId ? (
              <span>
                Run ID: <span className="font-mono text-xs">{runId}</span>
              </span>
            ) : (
              <span>Not running</span>
            )}
          </div>

          {runId ? (
            <Link to={`/runs/${runId}`} className="text-sm font-medium text-slate-900 underline">
              Open details
            </Link>
          ) : null}
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10">
          <h2 className="text-sm font-semibold">Live agent events</h2>
          <span className="text-xs text-slate-600 dark:text-slate-400">Streaming via Supabase Realtime</span>
        </div>

        <div className="max-h-[60vh] overflow-auto p-4">
          {sortedEvents.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">No events yet.</div>
          ) : (
            <ul className="grid gap-3">
              {sortedEvents.map((ev) => (
                <li key={ev.id} className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{ev.agent_name}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(ev.created_at).toLocaleTimeString()}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ring-1 ${badgeClassForEventType(ev.event_type)}`}>
                      {ev.event_type}
                    </span>
                  </div>
                  {ev.content ? <div className="mt-2 whitespace-pre-wrap text-sm">{ev.content}</div> : null}

                  {ev.event_type === 'result' && ev.payload ? (() => {
                    const itinerary = getItinerary(ev.payload)
                    if (!itinerary) {
                      return (
                        <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-white/10">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      )
                    }

                    const destination = typeof ev.payload.destination === 'string' ? ev.payload.destination : null
                    const days = typeof ev.payload.days === 'number' ? ev.payload.days : null
                    const budget = typeof ev.payload.budget_usd === 'number' ? ev.payload.budget_usd : null

                    return (
                      <div className="mt-3 grid gap-2">
                        <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-white/10">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Itinerary summary</div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
                            {destination ? <span>Destination: {destination}</span> : null}
                            {days ? <span>Days: {days}</span> : null}
                            {budget ? <span>Budget: ${budget}</span> : null}
                          </div>
                        </div>
                        {itinerary.map((item) => (
                          <div key={item.day} className="rounded-md bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-white/10">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                              Day {item.day}{item.title ? ` — ${item.title}` : ''}
                            </div>
                            {item.notes ? <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    )
                  })() : null}
                </li>
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </section>
    </div>
  )
}
