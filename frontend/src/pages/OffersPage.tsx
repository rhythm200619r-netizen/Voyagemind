import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { createRun } from '../lib/api'

export default function OffersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const offers = [
    {
      title: 'Tokyo flash fare',
      route: 'Roundtrip from major hubs',
      price: '$649',
      duration: '3 nights',
      tags: ['Food', 'Museums', 'City break'],
      prompt: 'Plan a 3-day trip to Tokyo focused on food and museums under $1200',
    },
    {
      title: 'Lisbon slow weekend',
      route: 'Sunset views and coastal cafes',
      price: '$489',
      duration: '4 nights',
      tags: ['Warm weather', 'Walkable', 'Value'],
      prompt: 'Plan a 4-day trip to Lisbon focused on cafes and viewpoints under $1500',
    },
    {
      title: 'Seoul city sprint',
      route: 'Late-night food and shopping',
      price: '$579',
      duration: '3 nights',
      tags: ['Nightlife', 'Food', 'Shopping'],
      prompt: 'Plan a 3-day trip to Seoul for food and shopping under $1000',
    },
  ]

  async function startFromOffer(prompt: string) {
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
        <div className="display text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--amber)]">Offers</div>
        <h1 className="display text-3xl font-semibold text-[color:var(--page-text)]">Curated deals you can launch instantly</h1>
        <p className="max-w-2xl text-sm text-[color:var(--body-muted)]">
          This page should feel like a live shortlist: clean prices, trip length, and a one-click path into planning.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {offers.map((offer) => (
          <article key={offer.title} className="theme-surface grid gap-4 rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="display text-lg text-[color:var(--page-text)]">{offer.title}</div>
                <div className="mt-1 text-xs text-[color:var(--body-muted)]">{offer.route}</div>
              </div>
              <div className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-xs font-semibold text-[color:var(--amber)]">
                {offer.price}
              </div>
            </div>

            <div className="text-sm text-[color:var(--page-text)]">Trip length: {offer.duration}</div>

            <div className="flex flex-wrap gap-2">
              {offer.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[var(--surface-border)] px-3 py-1 text-xs text-[color:var(--body-muted)]">
                  {tag}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void startFromOffer(offer.prompt)}
              className="vm-primary-button w-full px-4 py-3 text-sm font-semibold"
            >
              Start from this offer
            </button>
          </article>
        ))}
      </section>

      <section className="grid gap-3 rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-5">
        <h2 className="display text-xl text-[color:var(--page-text)]">What to add here next</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            'Price tiles with expiry / urgency badges',
            'Filters for budget, duration, and departure city',
            'A compare mode that can open a planning run from any card',
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
