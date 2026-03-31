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

  const interimFlightOptions = useMemo(() => {
    for (let i = sortedEvents.length - 1; i >= 0; i -= 1) {
      const ev = sortedEvents[i]
      if (ev.event_type !== 'agent_report') continue
      if (ev.agent_name !== 'Flight Negotiator') continue
      const payload = ev.payload
      if (payload && Array.isArray(payload['flight_options'])) {
        return payload['flight_options'] as unknown[]
      }
    }
    return [] as unknown[]
  }, [sortedEvents])

  const interimHotelOptions = useMemo(() => {
    for (let i = sortedEvents.length - 1; i >= 0; i -= 1) {
      const ev = sortedEvents[i]
      if (ev.event_type !== 'agent_report') continue
      if (ev.agent_name !== 'Accommodation Scout') continue
      const payload = ev.payload
      if (payload && Array.isArray(payload['hotel_options'])) {
        return payload['hotel_options'] as unknown[]
      }
    }
    return [] as unknown[]
  }, [sortedEvents])

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

      const fetchRunAndEvents = async () => {
        const [{ data: runRows, error: runErr }, { data: eventRows, error: eventErr }] = await Promise.all([
          sb.from('agent_runs').select('id,created_at,prompt,status').eq('id', runId).limit(1),
          sb.from('agent_events').select('*').eq('run_id', runId).order('id', { ascending: true }),
        ])

        if (runErr) throw runErr
        if (eventErr) throw eventErr

        setRun((runRows?.[0] as AgentRunRow | undefined) ?? null)
        for (const ev of (eventRows as AgentEvent[]) ?? []) upsertEvent(ev)
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
          .subscribe((status) => {
            // Intentionally no-op; we use status below when awaiting subscription.
          })

        channelRef.current = channel

        // Wait briefly for the realtime channel to confirm subscription.
        // This reduces the chance we miss later inserts and need a manual reload.
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

        // Fallback: while a run is active, periodically refetch until it completes.
        // This makes the UI resilient to occasional realtime dropouts.
        let tries = 0
        const intervalId = window.setInterval(async () => {
          tries += 1
          try {
            await fetchRunAndEvents()
            const latestStatus = (await sb.from('agent_runs').select('status').eq('id', runId).limit(1)).data?.[0]
              ?.status as string | undefined
            if (latestStatus && latestStatus !== 'running' && latestStatus !== 'queued') {
              window.clearInterval(intervalId)
            }
          } catch {
            // Ignore transient network issues.
          }

          if (tries >= 10) {
            window.clearInterval(intervalId)
          }
        }, 1200)

        return () => window.clearInterval(intervalId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    }

    const cleanup = load()
    return () => {
      void cleanup
    }
  }, [canRead, runId])

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Trip details</h1>
          <Link to="/my-trips" className="text-sm font-medium text-slate-900 underline dark:text-slate-50">
            My Trips
          </Link>
        </div>
        <div className="text-sm text-slate-600">
          Trip ID: <span className="font-mono text-xs">{runId}</span>
        </div>
      </section>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-950 dark:hover:border-white/20">
        {isLoading ? (
          <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
        ) : run ? (
          <>
            <div className="text-sm font-semibold">Prompt</div>
            <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{run.prompt}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span>{new Date(run.created_at).toLocaleString()}</span>
              <span>Status: {run.status}</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-400">Trip not found (or not readable).</div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10">
          <h2 className="text-sm font-semibold">Live updates</h2>
          <span className="text-xs text-slate-600 dark:text-slate-400">Streaming via Supabase Realtime</span>
        </div>

        {(interimFlightOptions.length || interimHotelOptions.length) ? (
          <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-white/10">
            {interimFlightOptions.length ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-950 dark:ring-white/10 dark:hover:ring-white/20">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Flight options (live)</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {interimFlightOptions.slice(0, 6).map((raw, idx) => {
                    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
                    if (!o) return null
                    const carrier = typeof o.carrier === 'string' ? o.carrier : 'Airline'
                    const route = typeof o.route === 'string' ? o.route : 'Route'
                    const stops = typeof o.stops === 'number' ? o.stops : null
                    const price = typeof o.price_usd === 'number' ? o.price_usd : null
                    const departTime = typeof o.depart_time === 'string' ? o.depart_time : null
                    const arriveTime = typeof o.arrive_time === 'string' ? o.arrive_time : null
                    return (
                      <div key={`${carrier}-live-${idx}`} className="rounded-md border border-slate-200 p-3 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{carrier}</div>
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{route}</div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                          {departTime || arriveTime ? <span>{departTime ?? '—'} → {arriveTime ?? '—'}</span> : null}
                          {stops !== null ? <span>{stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'}`}</span> : null}
                          {price !== null ? <span className="font-semibold">${price}</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {interimHotelOptions.length ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-950 dark:ring-white/10 dark:hover:ring-white/20">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Hotel options (live)</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {interimHotelOptions.slice(0, 6).map((raw, idx) => {
                    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
                    if (!o) return null
                    const name = typeof o.name === 'string' ? o.name : 'Hotel'
                    const area = typeof o.area === 'string' ? o.area : null
                    const rating = typeof o.rating === 'number' ? o.rating : null
                    const nightly = typeof o.nightly_usd === 'number' ? o.nightly_usd : null
                    const total = typeof o.total_usd === 'number' ? o.total_usd : null
                    const perks = Array.isArray(o.perks) ? (o.perks.filter((x) => typeof x === 'string') as string[]) : []
                    return (
                      <div key={`${name}-live-${idx}`} className="rounded-md border border-slate-200 p-3 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{name}</div>
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {area ? <span>{area}</span> : null}
                          {rating !== null ? <span>{area ? ' • ' : ''}{rating.toFixed(1)}★</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                          {nightly !== null ? <span>${nightly}/night</span> : null}
                          {total !== null ? <span className="font-semibold">Total: ${total}</span> : null}
                        </div>
                        {perks.length ? <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">{perks.join(' • ')}</div> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-[60vh] overflow-auto p-4">
          {sortedEvents.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">No events yet.</div>
          ) : (
            <ul className="grid gap-3">
              {sortedEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md bg-slate-50 p-3 transition hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-900/55"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{ev.agent_name}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(ev.created_at).toLocaleTimeString()}</span>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ring-1 ${badgeClassForEventType(ev.event_type)}`}>
                      {ev.event_type}
                    </span>
                  </div>
                  {ev.content ? (
                    <div className="mt-2 border-l border-slate-200 pl-3 text-sm text-slate-900 dark:border-white/10 dark:text-slate-100">
                      <div className="whitespace-pre-wrap">{ev.content}</div>
                    </div>
                  ) : null}

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

                    const budgetSplit = ev.payload.budget_split && typeof ev.payload.budget_split === 'object'
                      ? (ev.payload.budget_split as Record<string, unknown>)
                      : null
                    const flightBudget = budgetSplit && typeof budgetSplit['flight'] === 'number' ? (budgetSplit['flight'] as number) : null
                    const hotelBudget = budgetSplit && typeof budgetSplit['hotel'] === 'number' ? (budgetSplit['hotel'] as number) : null

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

                    const flightOptions = Array.isArray(ev.payload.flight_options)
                      ? (ev.payload.flight_options as unknown[])
                      : []
                    const hotelOptions = Array.isArray(ev.payload.hotel_options)
                      ? (ev.payload.hotel_options as unknown[])
                      : []

                    return (
                      <div className="mt-3 grid gap-2">
                        <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-950 dark:ring-white/10 dark:hover:ring-white/20">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Itinerary summary</div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
                            {destination ? <span>Destination: {destination}</span> : null}
                            {days ? <span>Days: {days}</span> : null}
                            {budget ? <span>Budget: ${budget}</span> : null}
                            {flightBudget !== null ? <span>Flights budget: ${flightBudget}</span> : null}
                            {hotelBudget !== null ? <span>Hotels budget: ${hotelBudget}</span> : null}
                            {interests.length ? <span>Interests: {interests.join(', ')}</span> : null}
                            {depart || ret ? <span>Travel dates: {depart ?? '—'} → {ret ?? '—'}</span> : null}
                            {checkIn || checkOut ? <span>Stay dates: {checkIn ?? '—'} → {checkOut ?? '—'}</span> : null}
                          </div>
                        </div>

                        {flightOptions.length ? (
                          <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-white/10">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Flight options</div>
                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                              {flightOptions.slice(0, 6).map((raw, idx) => {
                                const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
                                if (!o) return null
                                const carrier = typeof o.carrier === 'string' ? o.carrier : 'Airline'
                                const route = typeof o.route === 'string' ? o.route : 'Route'
                                const stops = typeof o.stops === 'number' ? o.stops : null
                                const price = typeof o.price_usd === 'number' ? o.price_usd : null
                                const departTime = typeof o.depart_time === 'string' ? o.depart_time : null
                                const arriveTime = typeof o.arrive_time === 'string' ? o.arrive_time : null
                                return (
                                  <div key={`${carrier}-${idx}`} className="rounded-md border border-slate-200 p-3 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{carrier}</div>
                                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{route}</div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                                      {departTime || arriveTime ? <span>{departTime ?? '—'} → {arriveTime ?? '—'}</span> : null}
                                      {stops !== null ? <span>{stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'}`}</span> : null}
                                      {price !== null ? <span className="font-semibold">${price}</span> : null}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {hotelOptions.length ? (
                          <div className="rounded-md bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-950 dark:ring-white/10 dark:hover:ring-white/20">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">Hotel options</div>
                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                              {hotelOptions.slice(0, 6).map((raw, idx) => {
                                const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
                                if (!o) return null
                                const name = typeof o.name === 'string' ? o.name : 'Hotel'
                                const area = typeof o.area === 'string' ? o.area : null
                                const rating = typeof o.rating === 'number' ? o.rating : null
                                const nightly = typeof o.nightly_usd === 'number' ? o.nightly_usd : null
                                const total = typeof o.total_usd === 'number' ? o.total_usd : null
                                const perks = Array.isArray(o.perks) ? (o.perks.filter((x) => typeof x === 'string') as string[]) : []
                                return (
                                  <div key={`${name}-${idx}`} className="rounded-md border border-slate-200 p-3 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{name}</div>
                                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                      {area ? <span>{area}</span> : null}
                                      {rating !== null ? <span>{area ? ' • ' : ''}{rating.toFixed(1)}★</span> : null}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                                      {nightly !== null ? <span>${nightly}/night</span> : null}
                                      {total !== null ? <span className="font-semibold">Total: ${total}</span> : null}
                                    </div>
                                    {perks.length ? <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">{perks.join(' • ')}</div> : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {itinerary.map((item) => (
                          <div key={item.day} className="rounded-md bg-white p-3 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-950 dark:ring-white/10 dark:hover:ring-white/20">
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
