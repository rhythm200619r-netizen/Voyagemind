import { supabase } from '../supabase'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

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
