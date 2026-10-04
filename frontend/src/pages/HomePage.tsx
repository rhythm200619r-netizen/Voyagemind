import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { createRun } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prompt, setPrompt] = useState('focused on food and museums')
  const [budget, setBudget] = useState('1200')

  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [departDate, setDepartDate] = useState('')
  const [returnDate, setReturnDate] = useState('')

  const composedPrompt = useMemo(() => {
    const parts: string[] = []
    parts.push('Plan a trip')

    const origin = fromCity.trim()
    const destination = toCity.trim()
    if (origin) parts.push(`from ${origin}`)
    if (destination) parts.push(`to ${destination}`)
    if (departDate) parts.push(`depart ${departDate}`)
    if (returnDate) parts.push(`return ${returnDate}`)

    const numericBudget = budget.trim()
    if (numericBudget) parts.push(`under $${numericBudget}`)

    const extra = prompt.trim()
    if (extra) parts.push(extra)

    return parts.join(' ')
  }, [budget, departDate, fromCity, prompt, returnDate, toCity])

  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!fromCity.trim()) missing.push('departure')
    if (!toCity.trim()) missing.push('destination')
    if (!departDate) missing.push('depart date')
    if (!returnDate) missing.push('return date')
    if (departDate && returnDate && returnDate < departDate) missing.push('valid date range')
    return missing
  }, [departDate, fromCity, returnDate, toCity])

  const quickStarts = [
    {
      title: 'Tokyo food sprint',
      meta: '3 days · museums + street food',
      prompt: 'Plan a 3-day trip to Tokyo focused on food and museums under $1200',
      budget: '1200',
    },
    {
      title: 'Paris culture break',
      meta: '4 days · art + cafés',
      prompt: 'Plan a 4-day trip to Paris focused on art and cafes under $1800',
      budget: '1800',
    },
    {
      title: 'Seoul night market run',
      meta: '2 days · food + night views',
      prompt: 'Plan a 2-day trip to Seoul for food under $600',
      budget: '600',
    },
  ]

  const featuredDestinations = [
    {
      title: 'Lisbon',
      subtitle: 'Sunsets, seafood, tram rides',
      src: 'https://images.unsplash.com/photo-1513735492246-483525079686?auto=format&fit=crop&w=1400&q=60',
    },
    {
      title: 'Kyoto',
      subtitle: 'Temples, gardens, quiet stays',
      src: 'https://images.unsplash.com/photo-1526481280695-3c46949ffc0d?auto=format&fit=crop&w=1400&q=60',
    },
    {
      title: 'Istanbul',
      subtitle: 'Markets, rooftops, ferries',
      src: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1400&q=60',
    },
  ]

  const valueProps = [
    {
      title: 'Prompt to plan',
      body: 'Describe the trip in plain language and get flights, stays, and a day-by-day plan in one run.',
    },
    {
      title: 'Budget-aware',
      body: 'The planner splits the budget and keeps suggestions within the target you give it.',
    },
    {
      title: 'Clear progress',
      body: 'Planning progress is available when you need it, without taking over the booking screen.',
    },
  ]

  const fallbackDestinationImage =
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=60'

  const editorialTrips = [
    {
      title: 'Tokyo after dark',
      meta: '3 nights · food-led city break',
      image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1400&q=60',
    },
    {
      title: 'Paris with breathing room',
      meta: '4 nights · art, cafés, walkable stays',
      image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1400&q=60',
    },
    {
      title: 'Seoul in motion',
      meta: '2 nights · street food and nightlife',
      image: 'https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=1400&q=60',
    },
  ]

  async function handleRun(nextPrompt: string) {
    if (!user) {
      navigate('/login')
      return
    }

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const data = await createRun(nextPrompt)
      navigate(`/trips/${data.run_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="grid gap-8">
      <section className="overflow-hidden rounded-lg border border-[var(--fog-border)] bg-[var(--surface-strong)] text-[#f5eee5] shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
        <div className="grid gap-8 px-6 py-10 md:px-10 md:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="grid gap-5">
            <div className="grid gap-3">
              <div className="display text-xs font-semibold tracking-[0.28em] text-[color:var(--amber)]">VOYAGEMIND</div>
              <h1 className="display max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Plan a trip with flights, stays, and itinerary together.</h1>
              <p className="max-w-2xl text-sm text-[#f5eee5]/74 md:text-base">
                Enter your route, dates, budget, and preferences. VoyageMind prepares a practical plan with comparable
                flight and stay options you can review before confirming.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {['Flights', 'Stays', 'Itinerary', 'Private to your account'].map((item) => (
                <span key={item} className="rounded-full border border-[rgba(255,255,255,0.12)] bg-white/5 px-3 py-1 text-xs text-[#f5eee5]/80">
                  {item}
                </span>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: 'Sample routes', value: '3' },
                { label: 'Planning speed', value: '< 30s' },
                { label: 'Progress', value: 'On demand' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/5 p-4">
                  <div className="display text-2xl font-semibold text-white">{stat.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#f5eee5]/60">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-[rgba(255,255,255,0.1)] bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="display text-xs uppercase tracking-[0.22em] text-[color:var(--amber)]">Featured routes</div>
                  <h2 className="display mt-1 text-2xl text-white">Start with a sample trip</h2>
                </div>
                <span className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--amber)]">
                  Private
                </span>
              </div>

              <div className="grid gap-3">
                {editorialTrips.map((trip) => (
                  <button
                    key={trip.title}
                    type="button"
                    onClick={() => {
                      setPrompt(`Plan a ${trip.meta.toLowerCase().replace(' · ', ' trip focused on ')} under $1200`)
                    }}
                    className="group grid grid-cols-[92px_1fr] gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-2 text-left transition hover:border-[rgba(212,136,58,0.24)] hover:bg-[rgba(255,255,255,0.06)]"
                  >
                    <img src={trip.image} alt={trip.title} className="h-[92px] w-[92px] rounded-md object-cover" loading="lazy" />
                    <div className="flex min-w-0 flex-col justify-center pr-2">
                      <div className="display truncate text-base text-white">{trip.title}</div>
                      <div className="mt-1 text-xs text-[#f5eee5]/68">{trip.meta}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/5 p-4">
              <div className="display text-sm uppercase tracking-[0.22em] text-[color:var(--amber)]">Quick launch</div>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Your travel prompt</span>
                <textarea
                  className="vm-field min-h-[108px] resize-y px-4 py-3 text-sm placeholder:text-[color:var(--body-muted)]"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Plan a 4-day trip to Paris focused on art and cafes"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Departure</span>
                  <input
                    className="vm-field min-w-0 px-4 py-3 text-sm placeholder:text-[color:var(--body-muted)]"
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    placeholder="City / Airport"
                  />
                </label>

                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Destination</span>
                  <input
                    className="vm-field min-w-0 px-4 py-3 text-sm placeholder:text-[color:var(--body-muted)]"
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    placeholder="City / Airport"
                  />
                </label>

                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Depart</span>
                  <input
                    className="vm-field min-w-0 px-4 py-3 text-sm"
                    type="date"
                    value={departDate}
                    onChange={(e) => setDepartDate(e.target.value)}
                  />
                </label>

                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Return</span>
                  <input
                    className="vm-field min-w-0 px-4 py-3 text-sm"
                    type="date"
                    min={departDate || undefined}
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f5eee5]/60">Total budget (USD)</span>
                  <input
                    className="vm-field min-w-0 px-4 py-3 text-sm placeholder:text-[color:var(--body-muted)]"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="1200"
                    inputMode="numeric"
                  />
                  <div className="text-xs text-[#f5eee5]/55">
                    {missingFields.length > 0
                      ? `Add ${missingFields.join(', ')} to plan.`
                      : 'Flights, stays, and itinerary planned together.'}
                  </div>
                </label>

                <button
                  type="button"
                  className="vm-primary-button mt-5 px-5 py-3 text-sm font-semibold text-[#140d07] disabled:opacity-60"
                  onClick={() => handleRun(composedPrompt)}
                  disabled={Boolean(isStarting) || missingFields.length > 0}
                >
                  {isStarting ? 'Starting...' : 'Plan trip'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-[#f5eee5]/70">
                {['Food trip', 'City break', 'Luxury weekend', 'Beach escape'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="rounded-full border border-[rgba(255,255,255,0.1)] px-3 py-1 transition hover:border-[rgba(212,136,58,0.28)] hover:text-[color:var(--amber)]"
                    onClick={() => setPrompt(`Plan a 3-day trip to ${chip.toLowerCase()} under $1200`)}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {error ? <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="display text-2xl font-semibold text-[color:var(--page-text)]">Quick starts</h2>
            <p className="text-sm text-[color:var(--body-muted)]">Use a sample, then adjust the route, dates, and budget.</p>
          </div>
          <div className="text-xs text-[color:var(--body-muted)]">Destination examples</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {quickStarts.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => {
                setPrompt(card.prompt)
                setBudget(card.budget)
              }}
              className="overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-strong)] text-left transition hover:border-[rgba(212,136,58,0.28)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.1)]"
              disabled={isStarting}
            >
              <div className="p-4">
                <div className="display text-base font-semibold text-[color:var(--page-text)]">{card.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--amber)]">{card.meta}</div>
                <div className="mt-3 text-sm text-[color:var(--body-muted)]">Load this request into the planner.</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="display text-2xl font-semibold text-[color:var(--page-text)]">Featured destinations</h2>
            <p className="text-sm text-[color:var(--body-muted)]">Common city ideas for the planner.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {featuredDestinations.map((img) => (
            <article key={img.title} className="group overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-strong)] transition hover:border-[rgba(212,136,58,0.28)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.1)]">
              <img
                src={img.src}
                alt={img.title}
                className="h-44 w-full object-cover"
                loading="lazy"
                onError={(event) => {
                  const target = event.currentTarget
                  target.onerror = null
                  target.src = fallbackDestinationImage
                }}
              />
              <div className="p-4">
                <div className="display text-base font-semibold text-[color:var(--page-text)]">{img.title}</div>
                <div className="mt-1 text-xs text-[color:var(--body-muted)]">{img.subtitle}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {valueProps.map((item) => (
          <article key={item.title} className="theme-surface grid gap-2 rounded-lg border p-4 shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
            <div className="display text-lg text-[color:var(--page-text)]">{item.title}</div>
            <p className="text-sm leading-relaxed text-[color:var(--body-muted)]">{item.body}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
