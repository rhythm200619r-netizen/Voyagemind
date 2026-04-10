import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import AgentEventFeed from '../components/AgentEventFeed'
import { bookRun, getRun, getRunOffers } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'
import type { AgentEvent } from '../lib/agentEvents'

type AgentRunRow = {
  id: string
  created_at: string
  prompt: string | Record<string, unknown>
  status: string
  booked: boolean
  booked_at: string | null
  selected_flight_offer_id: string | null
  selected_hotel_offer_id: string | null
}

type RunOffers = {
  flight_offers: Array<{
    id: string
    created_at: string
    provider: string
    provider_offer_id: string
    rank: number
    destination?: string | null
    route?: string | null
    depart_date?: string | null
    return_date?: string | null
    depart_time?: string | null
    arrive_time?: string | null
    carrier?: string | null
    stops?: number | null
    price_usd?: number | null
    currency?: string | null
    raw_payload: Record<string, unknown>
  }>
  hotel_offers: Array<{
    id: string
    created_at: string
    provider: string
    provider_offer_id: string
    rank: number
    hotel_name?: string | null
    city?: string | null
    area?: string | null
    check_in?: string | null
    check_out?: string | null
    nights?: number | null
    nightly_usd?: number | null
    total_usd?: number | null
    rating?: number | null
    currency?: string | null
    raw_payload: Record<string, unknown>
  }>
  booked: boolean
  booked_at?: string | null
  selected_flight_offer_id?: string | null
  selected_hotel_offer_id?: string | null
}

type InsertPayload<T> = {
  new: T
}

function formatErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatPrompt(prompt: AgentRunRow['prompt']) {
  if (typeof prompt === 'string') return prompt
  if (prompt && typeof prompt === 'object') {
    const record = prompt as Record<string, unknown>
    return (typeof record.prompt === 'string' && record.prompt) || (typeof record.text === 'string' && record.text) || JSON.stringify(record)
  }
  return String(prompt)
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
  const [offers, setOffers] = useState<RunOffers | null>(null)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [selectedFlightOfferId, setSelectedFlightOfferId] = useState<string | null>(null)
  const [selectedHotelOfferId, setSelectedHotelOfferId] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingMessage, setBookingMessage] = useState<string | null>(null)
  const [isBooking, setIsBooking] = useState(false)
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
      setOffers(null)
      setOffersError(null)
      setSelectedFlightOfferId(null)
      setSelectedHotelOfferId(null)
      setBookingError(null)
      setBookingMessage(null)

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
        const foundRun = (await getRun(runId)) as AgentRunRow
        setRun(foundRun)
        setSelectedFlightOfferId(foundRun.selected_flight_offer_id ?? null)
        setSelectedHotelOfferId(foundRun.selected_hotel_offer_id ?? null)
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

      const fetchOffers = async () => {
        try {
          const nextOffers = await getRunOffers(runId)
          setOffers(nextOffers)
          setOffersError(null)
        } catch (offerErr) {
          setOffersError(offerErr instanceof Error ? offerErr.message : String(offerErr))
          setOffers({ flight_offers: [], hotel_offers: [], booked: false })
        }
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
        await fetchOffers()

        intervalId = window.setInterval(async () => {
          if (cancelled) return
          try {
            await fetchRunAndEvents()
            await fetchOffers()
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
        setError(formatErrorMessage(e))
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

  const isBooked = Boolean(run?.booked)
  const selectedFlightOffer = offers?.flight_offers.find((offer) => offer.id === selectedFlightOfferId) ?? null
  const selectedHotelOffer = offers?.hotel_offers.find((offer) => offer.id === selectedHotelOfferId) ?? null

  async function handleBookTrip() {
    if (!run) return
    if (!selectedFlightOfferId || !selectedHotelOfferId) {
      setBookingError('Select one flight and one hotel before booking.')
      return
    }

    setIsBooking(true)
    setBookingError(null)
    setBookingMessage(null)

    try {
      const result = await bookRun(runId, selectedFlightOfferId, selectedHotelOfferId)
      setRun((prev) =>
        prev
          ? {
              ...prev,
              booked: true,
              booked_at: result.booked_at ?? prev.booked_at,
              selected_flight_offer_id: result.flight_offer_id,
              selected_hotel_offer_id: result.hotel_offer_id,
            }
          : prev,
      )
      setOffers((prev) =>
        prev
          ? {
              ...prev,
              booked: true,
              booked_at: result.booked_at ?? prev.booked_at,
              selected_flight_offer_id: result.flight_offer_id,
              selected_hotel_offer_id: result.hotel_offer_id,
            }
          : prev,
      )
      setSelectedFlightOfferId(result.flight_offer_id)
      setSelectedHotelOfferId(result.hotel_offer_id)
      setBookingMessage('Trip booked successfully. My Trips will now show this booking only.')
    } catch (e) {
      setBookingError(formatErrorMessage(e))
    } finally {
      setIsBooking(false)
    }
  }

  function renderFlightCard(offer: RunOffers['flight_offers'][number]) {
    const payload = offer.raw_payload as Record<string, unknown>
    const carrier = offer.carrier ?? String(payload.carrier ?? offer.provider_offer_id)
    const route = offer.route ?? String(payload.route ?? 'Flight option')
    const price = offer.price_usd ?? Number(payload.price_usd ?? NaN)
    const currency = offer.currency ?? 'USD'
    const stopsText = typeof offer.stops === 'number' ? `${offer.stops} stop${offer.stops === 1 ? '' : 's'}` : null
    const timeText = offer.depart_time && offer.arrive_time ? `${offer.depart_time} - ${offer.arrive_time}` : null
    const selected = selectedFlightOfferId === offer.id
    const disabled = isBooked

    return (
      <button
        key={offer.id}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => {
          setSelectedFlightOfferId(offer.id)
          setBookingError(null)
          setBookingMessage(null)
        }}
        className={`rounded-[18px] border p-3 text-left transition ${
          selected
            ? 'border-[rgba(212,136,58,0.45)] bg-[rgba(212,136,58,0.08)]'
            : 'border-[var(--fog-border)] hover:border-[rgba(212,136,58,0.22)]'
        } ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[color:var(--page-text)]">{carrier}</div>
            <div className="mt-1 text-xs text-[color:var(--body-muted)]">{route}</div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--amber)]">
            <span className={`h-2.5 w-2.5 rounded-full border ${selected ? 'border-[color:var(--amber)] bg-[color:var(--amber)]' : 'border-white/35 bg-transparent'}`} />
            {selected ? 'Selected' : 'Select'}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--body-muted)]">
          {timeText ? <span>{timeText}</span> : null}
          {offer.depart_date ? <span>{offer.depart_date}</span> : null}
          {stopsText ? <span>{stopsText}</span> : null}
        </div>
        <div className="mt-2 text-sm text-[color:var(--page-text)]">
          {Number.isFinite(price) ? `$${price} ${currency}` : 'Price unavailable'}
        </div>
      </button>
    )
  }

  function renderHotelCard(offer: RunOffers['hotel_offers'][number]) {
    const payload = offer.raw_payload as Record<string, unknown>
    const name = offer.hotel_name ?? String(payload.name ?? offer.provider_offer_id)
    const area = offer.area ?? String(payload.area ?? 'Stay option')
    const total = offer.total_usd ?? Number(payload.total_usd ?? NaN)
    const nightly = offer.nightly_usd ?? Number(payload.nightly_usd ?? NaN)
    const nightsText = typeof offer.nights === 'number' && offer.nights > 0 ? `${offer.nights} night${offer.nights === 1 ? '' : 's'}` : null
    const ratingText = typeof offer.rating === 'number' ? `Rating ${offer.rating.toFixed(1)}` : null
    const currency = offer.currency ?? 'USD'
    const selected = selectedHotelOfferId === offer.id
    const disabled = isBooked

    return (
      <button
        key={offer.id}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => {
          setSelectedHotelOfferId(offer.id)
          setBookingError(null)
          setBookingMessage(null)
        }}
        className={`rounded-[18px] border p-3 text-left transition ${
          selected
            ? 'border-[rgba(212,136,58,0.45)] bg-[rgba(212,136,58,0.08)]'
            : 'border-[var(--fog-border)] hover:border-[rgba(212,136,58,0.22)]'
        } ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[color:var(--page-text)]">{name}</div>
            <div className="mt-1 text-xs text-[color:var(--body-muted)]">{area}</div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--amber)]">
            <span className={`h-2.5 w-2.5 rounded-full border ${selected ? 'border-[color:var(--amber)] bg-[color:var(--amber)]' : 'border-white/35 bg-transparent'}`} />
            {selected ? 'Selected' : 'Select'}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--body-muted)]">
          {nightsText ? <span>{nightsText}</span> : null}
          {ratingText ? <span>{ratingText}</span> : null}
          {offer.check_in && offer.check_out ? <span>{offer.check_in} - {offer.check_out}</span> : null}
        </div>
        <div className="mt-2 text-sm text-[color:var(--page-text)]">
          {Number.isFinite(total) ? `$${total} ${currency} total` : 'Total unavailable'}
          {Number.isFinite(nightly) ? ` · $${nightly}/night` : ''}
        </div>
      </button>
    )
  }

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
            <div className="whitespace-pre-wrap text-sm text-[#f5eee5]">{formatPrompt(run.prompt)}</div>
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

      <section className="grid gap-3 rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-sm font-semibold text-[#f5eee5]">Stored offers</h2>
          <span className="text-xs text-[color:var(--muted)]">Loaded from the database</span>
        </div>

        {run?.booked ? (
          <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            This trip is booked and locked. The selections below are read-only.
            {run.booked_at ? <div className="mt-1 text-xs text-emerald-100/75">Booked at {new Date(run.booked_at).toLocaleString()}</div> : null}
          </div>
        ) : null}

        {offersError ? (
          <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            Could not load stored offers yet: {offersError}
          </div>
        ) : null}

        {bookingError ? (
          <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            {bookingError}
          </div>
        ) : null}

        {bookingMessage ? (
          <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {bookingMessage}
          </div>
        ) : null}

        <div className="grid gap-3 rounded-[18px] border border-[var(--fog-border)] bg-[rgba(255,255,255,0.02)] p-4 shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Booking</div>
              <div className="mt-1 text-sm text-[color:var(--page-text)]">Pick one flight and one hotel, then confirm once.</div>
            </div>
            <button
              type="button"
              onClick={handleBookTrip}
              disabled={isBooked || isBooking || !selectedFlightOfferId || !selectedHotelOfferId}
              className="vm-primary-button shrink-0 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBooked ? 'Booked' : isBooking ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>

          <div className="grid gap-2 text-sm text-[color:var(--body-muted)] sm:grid-cols-2">
            <div>
              Flight: {selectedFlightOffer ? selectedFlightOffer.carrier ?? selectedFlightOffer.provider_offer_id : 'Select a flight'}
            </div>
            <div>
              Hotel: {selectedHotelOffer ? selectedHotelOffer.hotel_name ?? selectedHotelOffer.provider_offer_id : 'Select a hotel'}
            </div>
          </div>

          {!selectedFlightOfferId || !selectedHotelOfferId ? (
            <div className="text-xs text-[color:var(--body-muted)]">The booking button appears once both selections are made.</div>
          ) : null}

          {run?.booked_at ? <div className="text-xs text-emerald-100/85">Booked at {new Date(run.booked_at).toLocaleString()}</div> : null}
        </div>

        {offers ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Flights</div>
                <div className="text-xs text-[color:var(--body-muted)]">Pick one flight option</div>
              </div>
              {offers.flight_offers.length > 0 ? (
                <div className="grid gap-2">
                  {offers.flight_offers.map((offer) => renderFlightCard(offer))}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--body-muted)]">No flight offers stored yet.</div>
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Hotels</div>
                <div className="text-xs text-[color:var(--body-muted)]">Pick one hotel option</div>
              </div>
              {offers.hotel_offers.length > 0 ? (
                <div className="grid gap-2">
                  {offers.hotel_offers.map((offer) => renderHotelCard(offer))}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--body-muted)]">No hotel offers stored yet.</div>
              )}
            </div>

            <div className="grid gap-3 rounded-[18px] border border-[var(--fog-border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Selections</div>
                <div className="text-xs text-[color:var(--body-muted)]">Cards are clickable</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[color:var(--body-muted)]">Offers will appear here once the run writes them to the database.</div>
        )}
      </section>
    </div>
  )
}
