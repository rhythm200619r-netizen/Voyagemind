import { AnimatePresence, motion } from 'framer-motion'

import InfoPopover from './InfoPopover'
import { AgentOrb } from './3d/AgentOrb'
import { badgeClassForEventType, getItinerary, type AgentEvent } from '../lib/agentEvents'

// @copilot: AnimatePresence exit animation, blur out upward

type AgentEventFeedProps = {
  events: AgentEvent[]
  isStreaming: boolean
  agentDescriptions: Record<string, string>
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
      <span className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--amber)]">Planning</span>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-[6px] w-[6px] rounded-full bg-[color:var(--amber)]"
            style={{ animation: 'fadeUp 0.5s ease-in-out infinite', animationDelay: `${index * 80}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

function agentStatusForEvent(event: AgentEvent): 'running' | 'done' | 'failed' | 'pending' {
  if (event.event_type === 'error') return 'failed'
  if (event.event_type === 'run_started') return 'pending'
  if (event.event_type === 'run_completed' || event.event_type === 'result') return 'done'
  if (event.event_type === 'agent_report') return 'done'
  return 'running'
}

function agentNameForEvent(event: AgentEvent): string {
  return event.agent_name || 'Agent'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function formatCurrency(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `$${value.toLocaleString()}`
}

function FlightOptions({ payload }: { payload: Record<string, unknown> }) {
  const options = Array.isArray(payload.flight_options) ? payload.flight_options : []
  if (!options.length) return null

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="display text-sm text-[color:var(--page-text)]">Flight options</h4>
        <span className="text-xs text-[color:var(--body-muted)]">{options.length} option{options.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {options.slice(0, 6).map((raw, index) => {
          const option = asRecord(raw)
          if (!option) return null

          const carrier = getString(option.carrier) ?? 'Airline'
          const route = getString(option.route) ?? 'Route'
          const departTime = getString(option.depart_time)
          const arriveTime = getString(option.arrive_time)
          const stops = getNumber(option.stops)
          const price = getNumber(option.price_usd)

          return (
            <div key={`${carrier}-${index}`} className="rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="display truncate text-sm text-[color:var(--page-text)]">{carrier}</div>
                  <div className="mt-1 text-xs text-[color:var(--body-muted)]">{route}</div>
                </div>
                {formatCurrency(price) ? (
                  <div className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-xs font-semibold text-[color:var(--amber)]">
                    {formatCurrency(price)}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--body-muted)]">
                {departTime || arriveTime ? <span>{departTime ?? '—'} to {arriveTime ?? '—'}</span> : null}
                {stops !== null ? <span>{stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'}`}</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HotelOptions({ payload }: { payload: Record<string, unknown> }) {
  const options = Array.isArray(payload.hotel_options) ? payload.hotel_options : []
  if (!options.length) return null

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="display text-sm text-[color:var(--page-text)]">Hotel options</h4>
        <span className="text-xs text-[color:var(--body-muted)]">{options.length} option{options.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {options.slice(0, 6).map((raw, index) => {
          const option = asRecord(raw)
          if (!option) return null

          const name = getString(option.name) ?? 'Hotel'
          const area = getString(option.area)
          const rating = getNumber(option.rating)
          const nightly = getNumber(option.nightly_usd)
          const total = getNumber(option.total_usd)
          const perks = getStringArray(option.perks)

          return (
            <div key={`${name}-${index}`} className="rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="display truncate text-sm text-[color:var(--page-text)]">{name}</div>
                  <div className="mt-1 text-xs text-[color:var(--body-muted)]">
                    {area ? <span>{area}</span> : null}
                    {area && rating !== null ? <span> • </span> : null}
                    {rating !== null ? <span>{rating.toFixed(1)} rating</span> : null}
                  </div>
                </div>
                {formatCurrency(total) ? (
                  <div className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-xs font-semibold text-[color:var(--amber)]">
                    {formatCurrency(total)} total
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--body-muted)]">
                {formatCurrency(nightly) ? <span>{formatCurrency(nightly)} / night</span> : null}
                {perks.length ? <span>{perks.join(' • ')}</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function AgentEventFeed({ events, isStreaming, agentDescriptions }: AgentEventFeedProps) {
  const sortedEvents = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const latestResult = [...sortedEvents].reverse().find((event) => event.event_type === 'result' && event.payload)
  const latestResultPayload = asRecord(latestResult?.payload)
  const itinerary = getItinerary(latestResultPayload)

  return (
    <div className="grid gap-3">
      {latestResult ? (
        <div className="theme-surface grid gap-3 rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div className="display text-sm text-[color:var(--page-text)]">Trip plan</div>
            {latestResult.event_type === 'result' ? (
              <span className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--amber)]">
                Complete
              </span>
            ) : null}
          </div>

          {latestResultPayload ? (
            <div className="grid gap-2 rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-3 text-sm text-[color:var(--page-text)]">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--body-muted)]">
                {getString(latestResultPayload.destination) ? <span>Destination: {getString(latestResultPayload.destination)}</span> : null}
                {getNumber(latestResultPayload.days) ? <span>{getNumber(latestResultPayload.days)} days</span> : null}
                {getNumber(latestResultPayload.budget_usd) ? <span>Budget: {formatCurrency(getNumber(latestResultPayload.budget_usd))}</span> : null}
              </div>
              {getStringArray(latestResultPayload.interests).length ? (
                <div className="text-xs text-[color:var(--body-muted)]">
                  Interests: {getStringArray(latestResultPayload.interests).join(', ')}
                </div>
              ) : null}
            </div>
          ) : null}

          {itinerary ? (
            <div className="grid gap-2">
              {itinerary.map((item) => (
                <div
                  key={item.day}
                  className="rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-3 text-sm text-[color:var(--page-text)]"
                >
                  <div className="font-semibold text-[color:var(--page-text)]">
                    Day {item.day}
                    {item.title ? ` — ${item.title}` : ''}
                  </div>
                  {item.notes ? <div className="mt-1 text-sm text-[color:var(--muted)]">{item.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {latestResultPayload ? (
            <div className="grid gap-4">
              <FlightOptions payload={latestResultPayload} />
              <HotelOptions payload={latestResultPayload} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="display text-lg text-[color:var(--page-text)]">Live updates</h3>
        {isStreaming ? <TypingIndicator /> : null}
      </div>

      <AnimatePresence mode="popLayout">
        {sortedEvents.map((event) => {
          const agentName = agentNameForEvent(event)
          const status = agentStatusForEvent(event)
          const description = agentDescriptions[agentName] ?? 'AI agent activity'
          const content = event.content ?? ''

          return (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, x: -20, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="theme-surface grid gap-3 rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.14)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <AgentOrb status={status} />
                  <div className="min-w-0">
                    <InfoPopover title={agentName} badge="AI Agent" description={description}>
                      <span className="display cursor-help text-sm text-[color:var(--page-text)] underline decoration-dotted decoration-[color:var(--amber)] underline-offset-4">
                        {agentName}
                      </span>
                    </InfoPopover>
                    <div className="mt-1 text-xs text-[color:var(--body-muted)]">
                      {new Date(event.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ring-1 ${badgeClassForEventType(event.event_type)}`}>
                  {event.event_type}
                </span>
              </div>

              {content ? (
                <div className="border-l border-[rgba(212,136,58,0.22)] pl-3 text-sm leading-relaxed text-[color:var(--page-text)]">
                  {content}
                </div>
              ) : null}

            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
