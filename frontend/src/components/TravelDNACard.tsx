import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import { API_URL } from '../lib/api'

type Preference = {
  accommodation_type?: string
  flight_preference?: string
  food_style?: string
  pace?: string
  budget_tier?: string
  interests?: string
}

type TravelDNAData = {
  preferences: Preference
  trips_count: number
}

// Map preference values to display-friendly labels and emojis
const PREFERENCE_DISPLAY: Record<string, Record<string, { label: string; emoji: string }>> = {
  accommodation_type: {
    luxury: { label: 'Luxury Hotels', emoji: '👑' },
    boutique: { label: 'Boutique Hotels', emoji: '✨' },
    'mid-range': { label: 'Mid-Range Hotels', emoji: '🏨' },
    budget: { label: 'Budget Hotels', emoji: '🏩' },
    hostel: { label: 'Hostels', emoji: '🛏️' },
  },
  flight_preference: {
    morning: { label: 'Early Morning Flights', emoji: '🌅' },
    afternoon: { label: 'Afternoon Flights', emoji: '☀️' },
    evening: { label: 'Evening Flights', emoji: '🌆' },
    flexible: { label: 'Flexible Schedule', emoji: '🧘' },
  },
  food_style: {
    'high-end': { label: 'Fine Dining', emoji: '🍽️' },
    'local-street': { label: 'Street Food', emoji: '🌮' },
    casual: { label: 'Casual Dining', emoji: '🍔' },
    mixed: { label: 'Culinary Mix', emoji: '🍜' },
  },
  pace: {
    slow: { label: 'Slow Travel', emoji: '🚶' },
    moderate: { label: 'Moderate Pace', emoji: '🚶‍♂️' },
    fast: { label: 'Fast-Paced', emoji: '🏃' },
  },
  budget_tier: {
    'ultra-budget': { label: 'Ultra-Budget', emoji: '💸' },
    budget: { label: 'Budget-Conscious', emoji: '💵' },
    'mid-range': { label: 'Mid-Range Budget', emoji: '💴' },
    premium: { label: 'Premium Budget', emoji: '💎' },
    luxury: { label: 'Luxury Budget', emoji: '💰' },
  },
}

export default function TravelDNACard() {
  const { user } = useAuth()
  const [data, setData] = useState<TravelDNAData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    async function loadPreferences() {
      const sb = supabase
      if (!sb) return

      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_URL}/users/me/preferences`, {
          headers: {
            Authorization: `Bearer ${(await sb.auth.getSession()).data.session?.access_token ?? ''}`,
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            setData({ preferences: {}, trips_count: 0 })
            return
          }
          throw new Error(`Failed to fetch preferences: ${response.statusText}`)
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preferences')
        setData({ preferences: {}, trips_count: 0 })
      } finally {
        setIsLoading(false)
      }
    }

    loadPreferences()
  }, [user])

  if (isLoading) {
    return (
      <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="text-sm text-[color:var(--body-muted)]">Loading your Travel DNA…</div>
      </div>
    )
  }

  if (!data || !data.trips_count) {
    return (
      <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="text-sm text-[color:var(--body-muted)]">Plan your first trip to discover your travel DNA.</div>
      </div>
    )
  }

  // Build preference tags
  const tags: Array<{ label: string; emoji: string }> = []

  for (const [prefKey, prefValue] of Object.entries(data.preferences)) {
    if (!prefValue) continue

    if (prefKey === 'interests') {
      // Split interests by comma
      const interestList = (prefValue as string).split(',').map((i) => i.trim())
      for (const interest of interestList) {
        if (interest) {
          tags.push({ label: interest, emoji: '🎯' })
        }
      }
    } else if (PREFERENCE_DISPLAY[prefKey]?.[prefValue]) {
      const { label, emoji } = PREFERENCE_DISPLAY[prefKey][prefValue]
      tags.push({ label, emoji })
    }
  }

  return (
    <div className="rounded-[18px] border border-[rgba(212,136,58,0.2)] bg-[rgba(212,136,58,0.08)] p-4 backdrop-blur">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--page-text)]">Your Travel DNA</h3>
          <p className="text-xs text-[color:var(--body-muted)]">Based on {data.trips_count} trip{data.trips_count !== 1 ? 's' : ''}</p>
        </div>

        {error ? (
          <div className="text-xs text-red-300">{error}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(212,136,58,0.3)] bg-[rgba(212,136,58,0.15)] px-3 py-1.5 text-xs font-medium text-[rgba(212,136,58,0.95)]"
                >
                  <span>{tag.emoji}</span>
                  <span>{tag.label}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[color:var(--body-muted)]">Your preferences are being extracted…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
