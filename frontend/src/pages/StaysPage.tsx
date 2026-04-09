import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import SearchCard from '../components/SearchCard'
import { createRun } from '../lib/api'
import { supabase, supabaseConfigError } from '../supabase'

export default function StaysPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(params: { mode: 'flights' | 'stays'; prompt: string }) {
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
        <h1 className="display text-2xl font-semibold text-[color:var(--page-text)]">Stays</h1>
        <p className="text-sm text-[color:var(--body-muted)]">Search hotels (MVP starts an AI planning run).</p>
      </section>

      <div className="theme-surface-strong rounded-[24px] border px-6 py-8">
        <SearchCard modes={['stays']} defaultMode="stays" onSearch={handleSearch} isLoading={isStarting} />
        {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
      </div>
    </div>
  )
}
