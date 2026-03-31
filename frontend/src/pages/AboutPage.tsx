export default function AboutPage() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">About</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">What this MVP is (and isn’t).</p>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
        <p>
          VoyageMind is a minimal scaffold: the backend creates a run and writes append-only agent events into Supabase.
          The frontend subscribes to those events using Supabase Realtime.
        </p>
        <p>
          The “agents” are placeholder logic meant to demonstrate the plumbing. You can replace the orchestrator with real
          tools/providers (flights, hotels, maps) and a real multi-agent framework.
        </p>
      </section>
    </div>
  )
}
