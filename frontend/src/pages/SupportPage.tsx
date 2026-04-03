export default function SupportPage() {
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="display text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--amber)]">Support</div>
        <h1 className="display text-3xl font-semibold text-[color:var(--page-text)]">FAQ + troubleshooting</h1>
        <p className="max-w-2xl text-sm text-[color:var(--body-muted)]">
          The fastest path to getting VoyageMind working again. Check the basics first, then move to realtime and auth.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          {
            title: 'Realtime',
            body: 'If live events are missing, verify that `public.agent_events` is added to the `supabase_realtime` publication and refresh the trip page.',
            accent: 'Events',
          },
          {
            title: 'Backend',
            body: 'If planning stops, check `http://localhost:8000/health`. If it fails, restart the backend server before trying again.',
            accent: 'API',
          },
          {
            title: 'Supabase',
            body: 'If auth or requests fail, make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present in `frontend/.env`.',
            accent: 'Config',
          },
        ].map((item) => (
          <article key={item.title} className="theme-surface grid gap-3 rounded-[22px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-lg text-[color:var(--page-text)]">{item.title}</h2>
              <span className="rounded-full border border-[rgba(212,136,58,0.18)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--amber)]">
                {item.accent}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--body-muted)]">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 rounded-[24px] border border-[var(--fog-border)] bg-[var(--fog)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-xl text-[color:var(--page-text)]">Quick checklist</h2>
            <p className="mt-1 text-sm text-[color:var(--body-muted)]">Use these in order when something looks off.</p>
          </div>
          <a
            href="http://localhost:8000/health"
            target="_blank"
            rel="noreferrer"
            className="vm-primary-button px-4 py-2.5 text-xs font-semibold"
          >
            Open health check
          </a>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            'Refresh the page after starting the backend and Supabase realtime publication.',
            'Confirm your `.env` values are loaded in both frontend and backend.',
            'Check the browser console for auth or network errors and retry the run.',
          ].map((step, index) => (
            <div key={step} className="rounded-[18px] border border-[var(--surface-border)] bg-[color:var(--surface-soft)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--amber)]">Step {index + 1}</div>
              <div className="mt-2 text-sm text-[color:var(--page-text)]">{step}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {[
          {
            question: 'I do not see events',
            answer: 'Enable realtime for public.agent_events, then retry the trip page. If it still looks empty, verify the backend is posting events for the current run.',
          },
          {
            question: 'My login does nothing',
            answer: 'Check that auth keys are present in frontend/.env and that the Supabase project allows email/password sign-in.',
          },
          {
            question: 'Trips load but details do not',
            answer: 'Make sure you are signed in with the same account that created the run. Protected detail pages now filter by owner.',
          },
          {
            question: 'The backend says it is offline',
            answer: 'Start the API server again, then revisit /health. The app expects the backend to be reachable before creating trips.',
          },
        ].map((item) => (
          <details key={item.question} className="theme-surface rounded-[20px] border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.08)]">
            <summary className="cursor-pointer list-none display text-sm text-[color:var(--page-text)]">{item.question}</summary>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--body-muted)]">{item.answer}</p>
          </details>
        ))}
      </section>
    </div>
  )
}
