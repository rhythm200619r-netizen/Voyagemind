export type AgentEvent = {
  id: number
  created_at: string
  run_id: string
  agent_name: string
  event_type: string
  content: string | null
  payload: Record<string, unknown>
}

export type ItineraryItem = {
  day: number
  title?: string
  notes?: string
}

export function getItinerary(payload: Record<string, unknown> | null | undefined): ItineraryItem[] | null {
  if (!payload) return null
  const raw = payload['itinerary']
  if (!Array.isArray(raw)) return null
  const items: ItineraryItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const day = typeof obj.day === 'number' ? obj.day : Number(obj.day)
    if (!Number.isFinite(day)) continue
    items.push({
      day,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    })
  }
  return items.length ? items : null
}

export function badgeClassForEventType(eventType: string): string {
  switch (eventType) {
    case 'agent_task':
      return 'bg-indigo-50 text-indigo-800 ring-indigo-200'
    case 'agent_report':
      return 'bg-violet-50 text-violet-800 ring-violet-200'
    case 'agent_decision':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'thinking':
      return 'bg-slate-100 text-slate-700 ring-slate-200'
    case 'synthesis':
      return 'bg-slate-900 text-white ring-slate-900'
    case 'result':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'run_started':
      return 'bg-blue-50 text-blue-800 ring-blue-200'
    case 'run_completed':
      return 'bg-green-50 text-green-800 ring-green-200'
    case 'error':
      return 'bg-red-50 text-red-800 ring-red-200'
    default:
      return 'bg-white text-slate-700 ring-slate-200'
  }
}
