import { supabase } from '../supabase'

export const API_URL = import.meta.env.DEV
  ? '/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000')

async function getAuthToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function createRun(prompt: string, budget?: number | string | null, orchestratorPersona?: string | null): Promise<{ run_id: string }> {
  let finalPrompt = prompt.trim()
  if (budget) {
    const b = String(budget).trim()
    const hasBudgetAlready = /\$\s*[0-9]/.test(finalPrompt) || /\bunder\b|\bwithin\b|\bbudget\b/i.test(finalPrompt)
    if (!hasBudgetAlready) {
      finalPrompt = `${finalPrompt} under $${b}`
    }
  }

  const token = await getAuthToken()
  if (!token) {
    throw new Error('Please log in to create and save trips.')
  }

  const resp = await fetch(`${API_URL}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt: finalPrompt,
      orchestrator_persona: orchestratorPersona ?? null,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as { run_id: string }
}

export async function registerNoEmail(email: string, password: string): Promise<{ user_id: string }> {
  const resp = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as { user_id: string }
}

export async function getRun(runId: string): Promise<{
  id: string
  created_at: string
  prompt: string
  status: string
  booked?: boolean
  booked_at?: string | null
  selected_flight_offer_id?: string | null
  selected_hotel_offer_id?: string | null
}> {
  const token = await getAuthToken()
  if (!token) {
    throw new Error('Please log in to view trip details.')
  }

  const resp = await fetch(`${API_URL}/runs/${runId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as {
    id: string
    created_at: string
    prompt: string
    status: string
    booked?: boolean
    booked_at?: string | null
    selected_flight_offer_id?: string | null
    selected_hotel_offer_id?: string | null
  }
}

export async function getRunOffers(runId: string): Promise<{
  flight_offers: Array<{
    id: string
    created_at: string
    provider: string
    provider_offer_id: string
    rank: number
    destination?: string | null
    route?: string | null
    depart_date?: string | null
    return_date?: string | null
    depart_time?: string | null
    arrive_time?: string | null
    carrier?: string | null
    stops?: number | null
    price_usd?: number | null
    currency?: string | null
    raw_payload: Record<string, unknown>
  }>
  hotel_offers: Array<{
    id: string
    created_at: string
    provider: string
    provider_offer_id: string
    rank: number
    hotel_name?: string | null
    city?: string | null
    area?: string | null
    check_in?: string | null
    check_out?: string | null
    nights?: number | null
    nightly_usd?: number | null
    total_usd?: number | null
    rating?: number | null
    currency?: string | null
    raw_payload: Record<string, unknown>
  }>
  booked: boolean
  booked_at?: string | null
  selected_flight_offer_id?: string | null
  selected_hotel_offer_id?: string | null
}> {
  const token = await getAuthToken()
  if (!token) {
    throw new Error('Please log in to view trip offers.')
  }

  const resp = await fetch(`${API_URL}/runs/${runId}/offers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as {
    flight_offers: Array<{
      id: string
      created_at: string
      provider: string
      provider_offer_id: string
      rank: number
      destination?: string | null
      route?: string | null
      depart_date?: string | null
      return_date?: string | null
      depart_time?: string | null
      arrive_time?: string | null
      carrier?: string | null
      stops?: number | null
      price_usd?: number | null
      currency?: string | null
      raw_payload: Record<string, unknown>
    }>
    booked: boolean
    booked_at?: string | null
    selected_flight_offer_id?: string | null
    selected_hotel_offer_id?: string | null
    hotel_offers: Array<{
      id: string
      created_at: string
      provider: string
      provider_offer_id: string
      rank: number
      hotel_name?: string | null
      city?: string | null
      area?: string | null
      check_in?: string | null
      check_out?: string | null
      nights?: number | null
      nightly_usd?: number | null
      total_usd?: number | null
      rating?: number | null
      currency?: string | null
      raw_payload: Record<string, unknown>
    }>
  }
}

export async function bookRun(runId: string, flightOfferId: string, hotelOfferId: string): Promise<{
  run_id: string
  booked: boolean
  booked_at?: string | null
  flight_offer_id: string
  hotel_offer_id: string
}> {
  const token = await getAuthToken()
  if (!token) {
    throw new Error('Please log in to book a trip.')
  }

  const resp = await fetch(`${API_URL}/runs/${runId}/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      flight_offer_id: flightOfferId,
      hotel_offer_id: hotelOfferId,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as {
    run_id: string
    booked: boolean
    booked_at?: string | null
    flight_offer_id: string
    hotel_offer_id: string
  }
}
