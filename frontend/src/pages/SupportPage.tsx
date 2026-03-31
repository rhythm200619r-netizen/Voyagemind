export default function SupportPage() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">Support</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">FAQ + troubleshooting (MVP).</p>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
        <div>
          <div className="font-semibold">I don’t see events</div>
          <div className="text-slate-700 dark:text-slate-300">
            Ensure `public.agent_events` is added to the `supabase_realtime` publication and refresh the page.
          </div>
        </div>
        <div>
          <div className="font-semibold">Backend not running</div>
          <div className="text-slate-700 dark:text-slate-300">Check `http://localhost:8000/health` and start the backend server.</div>
        </div>
        <div>
          <div className="font-semibold">Supabase keys missing</div>
          <div className="text-slate-700 dark:text-slate-300">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`.</div>
        </div>
      </section>
    </div>
  )
}
