import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import SearchCard from '../components/SearchCard'
import { createRun } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'

export default function FlightsPage() {
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
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">Flights</h1>
        <p className="text-sm text-slate-600">Search flights (MVP starts an AI planning run).</p>
      </section>

      <div className="rounded-2xl bg-slate-900 px-6 py-8 text-white">
        <SearchCard modes={['flights']} defaultMode="flights" onSearch={handleSearch} isLoading={isStarting} />
        {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
      </div>
    </div>
  )
}
