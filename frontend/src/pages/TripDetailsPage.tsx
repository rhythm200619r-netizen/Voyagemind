import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Link, useParams } from 'react-router-dom'

import { supabase, supabaseConfigError } from '../supabase'
import { badgeClassForEventType, getItinerary, type AgentEvent } from '../lib/agentEvents'

type AgentRunRow = {
  id: string
  created_at: string
  prompt: string
  status: string
}

type InsertPayload<T> = {
  new: T
}

export default function TripDetailsPage() {
  const params = useParams<{ runId: string }>()
  const runId = params.runId ?? ''

  const [run, setRun] = useState<AgentRunRow | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const canRead = supabaseConfigError === null && supabase !== null

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

  useEffect(() => {
    async function load() {
      if (!runId) return
      if (!canRead) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
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
        setEvents((prev: AgentEvent[]) => {
          if (prev.some((e: AgentEvent) => e.id === next.id)) return prev
          return [...prev, next]
        })
      }

      try {
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

        const [{ data: runRows, error: runErr }, { data: eventRows, error: eventErr }] = await Promise.all([
          sb.from('agent_runs').select('id,created_at,prompt,status').eq('id', runId).limit(1),
          sb.from('agent_events').select('*').eq('run_id', runId).order('id', { ascending: true }),
        ])

        if (runErr) throw runErr
        if (eventErr) throw eventErr

        setRun((runRows?.[0] as AgentRunRow | undefined) ?? null)
        for (const ev of (eventRows as AgentEvent[]) ?? []) upsertEvent(ev)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [canRead, runId])

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Trip details</h1>
          <Link to="/my-trips" className="text-sm font-medium text-slate-900 underline">
            My Trips
          </Link>
        </div>
        <div className="text-sm text-slate-600">
          Trip ID: <span className="font-mono text-xs">{runId}</span>
        </div>
      </section>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
        {isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : run ? (
          <>
            <div className="text-sm font-semibold">Prompt</div>
            <div className="whitespace-pre-wrap text-sm text-slate-800">{run.prompt}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>{new Date(run.created_at).toLocaleString()}</span>
              <span>Status: {run.status}</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">Trip not found (or not readable).</div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold">Live updates</h2>
          <span className="text-xs text-slate-600">Streaming via Supabase Realtime</span>
        </div>

        <div className="max-h-[60vh] overflow-auto p-4">
          {sortedEvents.length === 0 ? (
            <div className="text-sm text-slate-600">No events yet.</div>
          ) : (
            <ul className="grid gap-3">
              {sortedEvents.map((ev) => (
                <li key={ev.id} className="rounded-md bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-slate-800">{ev.agent_name}</span>
                    <span className="text-xs text-slate-600">{new Date(ev.created_at).toLocaleTimeString()}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ring-1 ${badgeClassForEventType(ev.event_type)}`}>
                      {ev.event_type}
                    </span>
                  </div>
                  {ev.content ? <div className="mt-2 whitespace-pre-wrap text-sm">{ev.content}</div> : null}

                  {ev.event_type === 'result' && ev.payload ? (() => {
                    const itinerary = getItinerary(ev.payload)
                    if (!itinerary) {
                      return (
                        <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-slate-200">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      )
                    }

                    const destination = typeof ev.payload.destination === 'string' ? ev.payload.destination : null
                    const days = typeof ev.payload.days === 'number' ? ev.payload.days : null
                    const budget = typeof ev.payload.budget_usd === 'number' ? ev.payload.budget_usd : null

                    const interests = Array.isArray(ev.payload.interests)
                      ? (ev.payload.interests.filter((x) => typeof x === 'string') as string[])
                      : []

                    const dates = ev.payload.dates && typeof ev.payload.dates === 'object'
                      ? (ev.payload.dates as Record<string, unknown>)
                      : null

                    const depart = dates && typeof dates['depart'] === 'string' ? (dates['depart'] as string) : null
                    const ret = dates && typeof dates['return'] === 'string' ? (dates['return'] as string) : null
                    const checkIn = dates && typeof dates['check_in'] === 'string' ? (dates['check_in'] as string) : null
                    const checkOut = dates && typeof dates['check_out'] === 'string' ? (dates['check_out'] as string) : null

                    return (
                      <div className="mt-3 grid gap-2">
                        <div className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                          <div className="text-xs font-semibold text-slate-900">Itinerary summary</div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                            {destination ? <span>Destination: {destination}</span> : null}
                            {days ? <span>Days: {days}</span> : null}
                            {budget ? <span>Budget: ${budget}</span> : null}
                            {interests.length ? <span>Interests: {interests.join(', ')}</span> : null}
                            {depart || ret ? <span>Travel dates: {depart ?? '—'} → {ret ?? '—'}</span> : null}
                            {checkIn || checkOut ? <span>Stay dates: {checkIn ?? '—'} → {checkOut ?? '—'}</span> : null}
                          </div>
                        </div>
                        {itinerary.map((item) => (
                          <div key={item.day} className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                            <div className="text-sm font-semibold text-slate-900">
                              Day {item.day}{item.title ? ` — ${item.title}` : ''}
                            </div>
                            {item.notes ? <div className="mt-1 text-sm text-slate-700">{item.notes}</div> : null}
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
