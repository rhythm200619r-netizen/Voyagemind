import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { createRun } from '../lib/api'

export default function HolidaysPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const packages = [
    {
      title: 'Beach reset',
      subtitle: '4 days · sun, swim, slow mornings',
      meta: 'Best for: couples or solo recharge',
      prompt: 'Plan a 4-day beach holiday with relaxed stays and a moderate budget',
    },
    {
      title: 'Family city escape',
      subtitle: '5 days · easy transit, mixed activities',
      meta: 'Best for: multi-age groups',
      prompt: 'Plan a 5-day family holiday with museums, parks, and comfortable hotels',
    },
    {
      title: 'Luxury weekend',
      subtitle: '3 days · premium dining + standout stay',
      meta: 'Best for: special occasions',
      prompt: 'Plan a 3-day luxury holiday with a premium stay and memorable dining under $2500',
    },
  ]

  async function startPackage(prompt: string) {
    if (!user) {
      navigate('/login')
      return
    }

    const data = await createRun(prompt)
    navigate(`/trips/${data.run_id}`)
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="display text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--amber)]">Holidays</div>
        <h1 className="display text-3xl font-semibold text-[color:var(--page-text)]">Curated holiday packages</h1>
        <p className="max-w-2xl text-sm text-[color:var(--body-muted)]">
          Use this as a package browser for ready-made trip themes. Each card should open a fresh planning run with a strong starting brief.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {packages.map((pkg) => (
          <article key={pkg.title} className="theme-surface grid gap-4 rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
            <div>
              <div className="display text-lg text-[color:var(--page-text)]">{pkg.title}</div>
              <div className="mt-1 text-sm text-[color:var(--body-muted)]">{pkg.subtitle}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-[color:var(--amber)]">{pkg.meta}</div>
            </div>

            <button
              type="button"
              onClick={() => void startPackage(pkg.prompt)}
              className="vm-primary-button px-4 py-3 text-sm font-semibold"
            >
              Build this holiday
            </button>
          </article>
        ))}
      </section>

      <section className="grid gap-3 rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-5">
        <h2 className="display text-xl text-[color:var(--page-text)]">What to add here next</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            'Seasonal picks: winter sun, summer escape, shoulder season deals',
            'Package labels: family, couple, solo, luxury, budget',
            'Itinerary previews that show the first 3 days before launch',
          ].map((item) => (
            <div key={item} className="rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--body-muted)]">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
