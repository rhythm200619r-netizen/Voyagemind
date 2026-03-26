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
    ? 'rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900'
    : 'rounded-md px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10'
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

  return (
    <div className="rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur">
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

      <div className="mt-4 grid gap-3 rounded-lg bg-white p-4">
        {mode === 'flights' ? (
          <div className="grid gap-3 md:grid-cols-6">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">From</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  value={fromCity}
                  onChange={(e) => setFromCity(e.target.value)}
                  placeholder="City / Airport"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">To</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  placeholder="City / Airport"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Depart</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                  type="date"
                  value={departDate}
                  onChange={(e) => setDepartDate(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Return</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Travelers</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  type="number"
                  min={1}
                  max={9}
                  value={travelers}
                  onChange={(e) => setTravelers(Number(e.target.value))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Budget (USD)</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="1200"
                />
              </label>
            </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">City</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  placeholder="Where are you staying?"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Check-in</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Check-out</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Guests</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
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
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600">Interests / vibe</span>
            <input
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="food, museums, nightlife…"
            />
          </label>

          <button
            type="button"
            className="mt-5 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => onSearch({ mode, prompt })}
            disabled={Boolean(isLoading) || prompt.trim().length === 0}
          >
            {isLoading ? 'Starting…' : cta}
          </button>
        </div>

        <div className="text-xs text-slate-500">
          This MVP turns your search into an AI prompt and streams results.
        </div>
      </div>
    </div>
  )
}
