import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from './supabase'

type AgentEvent = {
  id: number
  created_at: string
  run_id: string
  agent_name: string
  event_type: string
  content: string | null
  payload: Record<string, unknown>
}

type InsertPayload<T> = {
  new: T
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export default function App() {
  const [prompt, setPrompt] = useState('Plan a 3-day trip to Tokyo for food and museums under $1200')
  const [persona, setPersona] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)

  const canStream = supabaseConfigError === null && supabase !== null

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [events])

  useEffect(() => {
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  async function startRun() {
    if (!canStream) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      return
    }

    setIsStarting(true)
    setError(null)
    setEvents([])
    setRunId(null)

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    try {
      const resp = await fetch(`${API_URL}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          orchestrator_persona: persona || null,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`API error: ${resp.status} ${text}`)
      }

      const data = (await resp.json()) as { run_id: string }
      setRunId(data.run_id)

      const { data: existing, error: fetchErr } = await supabase
        .from('agent_events')
        .select('*')
        .eq('run_id', data.run_id)
        .order('created_at', { ascending: true })

      if (fetchErr) throw fetchErr
      setEvents(existing as AgentEvent[])

      const channel = supabase
        .channel(`agent-events-${data.run_id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_events',
            filter: `run_id=eq.${data.run_id}`,
          },
          (payload: InsertPayload<AgentEvent>) => {
            const next = payload.new
            setEvents((prev: AgentEvent[]) => {
              if (prev.some((e: AgentEvent) => e.id === next.id)) return prev
              return [...prev, next]
            })
          },
        )
        .subscribe()

      channelRef.current = channel
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">VoyageMind</h1>
          <p className="text-sm text-slate-600">Autonomous multi-agent travel concierge (MVP scaffold)</p>
        </header>

        <section className="mb-6 grid gap-3 rounded-lg border border-slate-200 p-4">
          {supabaseConfigError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {supabaseConfigError}
            </div>
          ) : null}
          <label className="grid gap-2">
            <span className="text-sm font-medium">Trip prompt</span>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={prompt}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Orchestrator persona (optional)</span>
            <input
              className="w-full rounded-md border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={persona}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPersona(e.target.value)}
              placeholder="e.g. concise, luxury-focused, budget-friendly"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={startRun}
              disabled={!canStream || isStarting || prompt.trim().length === 0}
            >
              {isStarting ? 'Starting…' : 'Start run'}
            </button>
            <div className="text-sm text-slate-600">
              {runId ? (
                <span>
                  Run ID: <span className="font-mono text-xs">{runId}</span>
                </span>
              ) : (
                <span>Not running</span>
              )}
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </section>

        <section className="rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold">Live agent events</h2>
            <span className="text-xs text-slate-600">Streaming via Supabase Realtime</span>
          </div>

          <div className="max-h-[60vh] overflow-auto p-4">
            {sortedEvents.length === 0 ? (
              <div className="text-sm text-slate-600">No events yet.</div>
            ) : (
              <ul className="grid gap-3">
                {sortedEvents.map((ev) => (
                  <li key={ev.id} className="rounded-md bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-semibold text-slate-800">{ev.agent_name}</span>
                      <span className="text-xs text-slate-600">{new Date(ev.created_at).toLocaleTimeString()}</span>
                      <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                        {ev.event_type}
                      </span>
                    </div>
                    {ev.content ? <div className="mt-2 whitespace-pre-wrap text-sm">{ev.content}</div> : null}
                    {ev.event_type === 'result' && ev.payload ? (
                      <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs ring-1 ring-slate-200">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
