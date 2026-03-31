import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createRun } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'

export default function HomePage() {
  const navigate = useNavigate()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prompt, setPrompt] = useState('Plan a 3-day trip to Tokyo focused on food and museums under $1200')
  const [budget, setBudget] = useState('1200')

  const composedPrompt = useMemo(() => {
    const raw = prompt.trim()
    const numericBudget = budget.trim()
    if (!raw) return ''
    if (!numericBudget) return raw
    const hasBudgetAlready = /\$\s*[0-9]/.test(raw) || /\bunder\b|\bwithin\b|\bbudget\b/i.test(raw)
    if (hasBudgetAlready) return raw
    return `${raw} under $${numericBudget}`
  }, [prompt, budget])

  async function handleRun(nextPrompt: string) {
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
      <section className="relative overflow-hidden rounded-2xl bg-slate-900 text-white">
        <img
          src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=60"
          alt="Travel inspiration"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-slate-900/55 to-slate-900/60" />

        <div className="relative grid gap-6 px-6 py-10 md:px-10 md:py-14">
          <div className="grid gap-3">
            <div className="text-xs font-semibold tracking-wide text-white/70">VOYAGEMIND</div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Plan travel with an AI prompt</h1>
            <p className="max-w-2xl text-sm text-white/80 md:text-base">
              Describe your trip in plain English. You’ll get flight + hotel options that fit your budget, plus an
              itinerary — streamed live via Supabase Realtime.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur transition hover:bg-white/[0.12]">
            <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-white/10 dark:bg-slate-950">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Your travel prompt</span>
                <textarea
                  className="min-h-[120px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-slate-200 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:focus:ring-white/10"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Plan a 4-day trip to Paris focused on art and cafes"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Total budget (USD)</span>
                  <input
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-slate-200 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:focus:ring-white/10"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="1200"
                    inputMode="numeric"
                  />
                  <div className="text-xs text-slate-500 dark:text-slate-400">Default split: 50% flights, 50% hotels.</div>
                </label>

                <button
                  type="button"
                  className="mt-5 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 disabled:hover:bg-blue-600"
                  onClick={() => handleRun(composedPrompt)}
                  disabled={Boolean(isStarting) || composedPrompt.trim().length === 0}
                >
                  {isStarting ? 'Starting…' : 'Run'}
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">Tip: include interests (food, museums) and dates if you want.</div>
            </div>
          </div>

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
            <div key={img.title} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-950 dark:hover:border-white/20">
              <img src={img.src} alt={img.title} className="h-40 w-full object-cover" loading="lazy" />
              <div className="p-4">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{img.title}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{img.subtitle}</div>
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
              onClick={() => {
                setPrompt(card.prompt)
                const match = card.prompt.match(/\$\s*([0-9][0-9,]*)/)
                if (match) setBudget(match[1].replace(/,/g, ''))
              }}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm dark:border-white/10 dark:bg-slate-950 dark:hover:border-white/20 dark:hover:bg-slate-900/40"
              disabled={isStarting}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{card.title}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{card.prompt}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
