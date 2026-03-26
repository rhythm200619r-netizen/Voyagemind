const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export async function createRun(prompt: string, orchestratorPersona?: string | null): Promise<{ run_id: string }> {
  const resp = await fetch(`${API_URL}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      orchestrator_persona: orchestratorPersona ?? null,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error: ${resp.status} ${text}`)
  }

  return (await resp.json()) as { run_id: string }
}
