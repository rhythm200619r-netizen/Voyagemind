import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import SearchCard from '../components/SearchCard'
import { createRun } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'

export default function HomePage() {
  const navigate = useNavigate()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(params: { mode: 'flights' | 'stays'; prompt: string }) {
    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const data = await createRun(params.prompt)
      navigate(`/trips/${data.run_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="grid gap-8">
      <section className="relative overflow-hidden rounded-2xl bg-slate-900 text-white">
        <img
          src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=60"
          alt="Travel inspiration"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-900/60" />

        <div className="relative grid gap-6 px-6 py-10 md:px-10 md:py-14">
          <div className="grid gap-3">
            <div className="text-xs font-semibold tracking-wide text-white/70">VOYAGEMIND</div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Plan travel & stays with an AI concierge</h1>
            <p className="max-w-2xl text-sm text-white/80 md:text-base">
              Search like a travel site. Get an itinerary like a concierge. This is an MVP scaffold wired to Supabase
              Realtime.
            </p>
          </div>

          <SearchCard modes={['flights']} onSearch={handleSearch} isLoading={isStarting} />

          {error ? <div className="text-sm text-red-200">{error}</div> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Get inspired</h2>
          <div className="text-xs text-slate-600">Real photos (Unsplash)</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Tokyo',
              subtitle: 'Night markets • Museums • Street food',
              src: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1400&q=60',
            },
            {
              title: 'Paris',
              subtitle: 'Cafés • Art • Walkable neighborhoods',
              src: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1400&q=60',
            },
            {
              title: 'Seoul',
              subtitle: 'Street food • Night views • Culture',
              src: 'https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=1400&q=60',
            },
          ].map((img) => (
            <div key={img.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <img src={img.src} alt={img.title} className="h-40 w-full object-cover" loading="lazy" />
              <div className="p-4">
                <div className="text-sm font-semibold text-slate-900">{img.title}</div>
                <div className="mt-1 text-xs text-slate-600">{img.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Popular starts</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { title: 'Tokyo', prompt: 'Plan a 3-day trip to Tokyo for food and museums under $1200' },
            { title: 'Paris', prompt: 'Plan a 4-day trip to Paris focused on art and cafes under $1800' },
            { title: 'Seoul', prompt: 'Plan a 2-day trip to Seoul for food under $600' },
          ].map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => handleSearch({ mode: 'flights', prompt: card.prompt })}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:bg-slate-50"
              disabled={isStarting}
            >
              <div className="text-sm font-semibold text-slate-900">{card.title}</div>
              <div className="mt-1 text-xs text-slate-600">{card.prompt}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
