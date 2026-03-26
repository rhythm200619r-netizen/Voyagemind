import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { supabase, supabaseConfigError } from '../supabase'

type AgentRunRow = {
  id: string
  created_at: string
  prompt: string
  status: string
}

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRead = supabaseConfigError === null && supabase !== null

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [runs])

  useEffect(() => {
    async function load() {
      if (!canRead) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        return
      }

      const sb = supabase
      if (!sb) {
        setError('Supabase client is not configured')
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchErr } = await sb
          .from('agent_runs')
          .select('id,created_at,prompt,status')
          .order('created_at', { ascending: false })
          .limit(25)

        if (fetchErr) throw fetchErr
        setRuns((data ?? []) as AgentRunRow[])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [canRead])

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">Runs</h1>
        <p className="text-sm text-slate-600">Recent agent runs stored in Supabase.</p>
      </section>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-semibold">Recent runs</div>
          <div className="mt-1 text-xs text-slate-600">Showing up to 25</div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : sortedRuns.length === 0 ? (
            <div className="text-sm text-slate-600">No runs yet.</div>
          ) : (
            <ul className="grid gap-2">
              {sortedRuns.map((run) => (
                <li key={run.id} className="rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{run.prompt}</div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="font-mono">{run.id}</span>
                        <span>{new Date(run.created_at).toLocaleString()}</span>
                        <span>Status: {run.status}</span>
                      </div>
                    </div>
                    <Link
                      to={`/runs/${run.id}`}
                      className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
