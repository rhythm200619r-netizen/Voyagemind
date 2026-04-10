import { useMemo, useState } from 'react'

type SearchMode = 'flights' | 'stays'

type Props = {
  defaultMode?: SearchMode
  modes?: SearchMode[]
  onSearch: (params: { mode: SearchMode; prompt: string }) => void
  isLoading?: boolean
}

function tabClass(isActive: boolean) {
  return isActive
    ? 'rounded-[12px] border border-[rgba(212,136,58,0.25)] bg-[rgba(212,136,58,0.16)] px-3 py-2 text-sm font-semibold text-[color:var(--amber)]'
    : 'rounded-[12px] border border-transparent px-3 py-2 text-sm font-semibold text-[color:var(--body-muted)] hover:border-[var(--surface-border)] hover:bg-[var(--surface)] hover:text-[color:var(--page-text)]'
}

export default function SearchCard({ defaultMode = 'flights', modes, onSearch, isLoading }: Props) {
  const availableModes = (modes && modes.length ? modes : ['flights', 'stays']) as SearchMode[]
  const initialMode: SearchMode = availableModes.includes(defaultMode) ? defaultMode : availableModes[0] ?? 'flights'

  const [mode, setMode] = useState<SearchMode>(initialMode)
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [departDate, setDepartDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [travelers, setTravelers] = useState(2)
  const [budget, setBudget] = useState('')
  const [interests, setInterests] = useState('food, museums')

  const missingFields = useMemo(() => {
    const missing: string[] = []

    if (mode === 'flights') {
      if (!fromCity.trim()) missing.push('From')
      if (!toCity.trim()) missing.push('To')
      if (!departDate) missing.push('Depart')
      if (!returnDate) missing.push('Return')
      if (departDate && returnDate && returnDate < departDate) missing.push('valid date range')
      return missing
    }

    if (!toCity.trim()) missing.push('City')
    if (!checkIn) missing.push('Check-in')
    if (!checkOut) missing.push('Check-out')
    if (checkIn && checkOut && checkOut < checkIn) missing.push('valid date range')
    return missing
  }, [checkIn, checkOut, departDate, fromCity, mode, returnDate, toCity])

  const canSearch = missingFields.length === 0

  const prompt = useMemo(() => {
    if (mode === 'flights') {
      const parts: string[] = []
      parts.push('Plan a trip')
      if (fromCity) parts.push(`from ${fromCity}`)
      if (toCity) parts.push(`to ${toCity}`)
      if (departDate) parts.push(`depart ${departDate}`)
      if (returnDate) parts.push(`return ${returnDate}`)
      if (travelers) parts.push(`for ${travelers} travelers`)
      if (budget) parts.push(`under $${budget}`)
      if (interests.trim()) parts.push(`focused on ${interests.trim()}`)
      return parts.join(' ')
    }

    const parts: string[] = []
    parts.push('Find stays')
    if (toCity) parts.push(`in ${toCity}`)
    if (checkIn) parts.push(`check-in ${checkIn}`)
    if (checkOut) parts.push(`check-out ${checkOut}`)
    if (travelers) parts.push(`for ${travelers} guests`)
    if (budget) parts.push(`under $${budget}`)
    if (interests.trim()) parts.push(`with vibes: ${interests.trim()}`)
    return parts.join(' ')
  }, [mode, fromCity, toCity, travelers, budget, interests, checkIn, checkOut, departDate, returnDate])

  const cta = mode === 'flights' ? 'Search flights' : 'Search stays'
  const showTabs = availableModes.length > 1
  const fieldClass = 'vm-field min-w-0 rounded-[12px] px-3 py-2 text-sm placeholder:text-[color:var(--body-muted)]'
  const labelClass = 'text-xs font-semibold text-[color:var(--body-muted)]'

  return (
    <div className="theme-surface rounded-[22px] border p-4 shadow-[0_18px_45px_rgba(0,0,0,0.14)] backdrop-blur">
      {showTabs ? (
        <div className="flex items-center gap-2">
          {availableModes.includes('flights') ? (
            <button type="button" className={tabClass(mode === 'flights')} onClick={() => setMode('flights')}>
              Flights
            </button>
          ) : null}
          {availableModes.includes('stays') ? (
            <button type="button" className={tabClass(mode === 'stays')} onClick={() => setMode('stays')}>
              Stays
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="theme-surface-strong mt-4 grid gap-3 rounded-[18px] border p-4">
        {mode === 'flights' ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>From</span>
                <input
                  className={fieldClass}
                  value={fromCity}
                  onChange={(e) => setFromCity(e.target.value)}
                  placeholder="City / Airport"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>To</span>
                <input
                  className={fieldClass}
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  placeholder="City / Airport"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>Depart</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={departDate}
                  onChange={(e) => setDepartDate(e.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>Return</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className={labelClass}>Travelers</span>
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={9}
                  value={travelers}
                  onChange={(e) => setTravelers(Number(e.target.value))}
                />
              </label>
              <label className="grid gap-1">
                <span className={labelClass}>Budget (USD)</span>
                <input
                  className={fieldClass}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="1200"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>City</span>
                <input
                  className={fieldClass}
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  placeholder="Where are you staying?"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>Check-in</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>Check-out</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className={labelClass}>Guests</span>
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={9}
                  value={travelers}
                  onChange={(e) => setTravelers(Number(e.target.value))}
                />
              </label>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid min-w-0 gap-1">
            <span className={labelClass}>Interests / vibe</span>
            <input
              className={fieldClass}
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="food, museums, nightlife…"
            />
          </label>

          <button
            type="button"
            className="vm-primary-button mt-5 rounded-[12px] px-5 py-2 text-sm font-semibold text-[#140d07] disabled:opacity-60"
            onClick={() => onSearch({ mode, prompt })}
            disabled={Boolean(isLoading) || !canSearch}
          >
            {isLoading ? 'Starting…' : cta}
          </button>
        </div>

        <div className="text-xs text-[color:var(--body-muted)]">
          {canSearch ? 'This MVP turns your search into an AI prompt and streams results.' : `Add ${missingFields.join(', ')} to continue.`}
        </div>
      </div>
    </div>
  )
}
