import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { supabaseConfigError } from '../supabase'
import { useTheme } from '../hooks/useTheme'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'rounded-md bg-white/15 px-3 py-2 text-sm font-semibold text-white transition'
    : 'rounded-md px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white active:bg-white/15'
}

export default function Shell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 dark:text-slate-50">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-white/30 dark:from-slate-950/50 dark:via-slate-950/20 dark:to-slate-950/50" />
        <div className="vm-blob vm-blob-1 absolute -left-28 -top-28 h-96 w-96 rounded-full bg-blue-500/45 blur-3xl mix-blend-multiply dark:mix-blend-screen" />
        <div className="vm-blob vm-blob-2 absolute right-[-8rem] top-16 h-[32rem] w-[32rem] rounded-full bg-indigo-500/45 blur-3xl mix-blend-multiply dark:mix-blend-screen" />
        <div className="vm-blob vm-blob-3 absolute bottom-[-12rem] left-1/4 h-[34rem] w-[34rem] rounded-full bg-emerald-500/35 blur-3xl mix-blend-multiply dark:mix-blend-screen" />
      </div>

      <div className="relative z-10">
        <header className="bg-slate-950 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-baseline gap-3">
              <div className="text-lg font-semibold tracking-tight">VoyageMind</div>
              <div className="hidden text-sm text-white/70 sm:block">Travel & stays concierge</div>
            </div>

            <nav className="flex flex-wrap items-center gap-1">
              <NavLink to="/" className={navLinkClass} end>
                Home
              </NavLink>
              <NavLink to="/flights" className={navLinkClass}>
                Flights
              </NavLink>
              <NavLink to="/stays" className={navLinkClass}>
                Stays
              </NavLink>
              <NavLink to="/holidays" className={navLinkClass}>
                Holidays
              </NavLink>
              <NavLink to="/offers" className={navLinkClass}>
                Offers
              </NavLink>
              <NavLink to="/my-trips" className={navLinkClass}>
                My Trips
              </NavLink>
              <NavLink to="/support" className={navLinkClass}>
                Support
              </NavLink>
              <NavLink to="/about" className={navLinkClass}>
                About
              </NavLink>

              <div className="ml-2 flex items-center gap-2 rounded-md px-2 py-2 hover:bg-white/10">
                <span className="hidden text-xs font-semibold text-white/70 sm:block">Theme</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  onClick={toggleTheme}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-white/20 ring-1 ring-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  <span className="sr-only">Toggle theme</span>
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      theme === 'dark' ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </nav>
          </div>
        </header>

        {supabaseConfigError ? (
          <div className="border-b border-amber-200 bg-amber-50">
            <div className="mx-auto max-w-6xl px-6 py-3 text-sm text-amber-900">{supabaseConfigError}</div>
          </div>
        ) : null}

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500 dark:text-slate-400">
            VoyageMind MVP scaffold (Flights + Stays)
          </div>
        </footer>
      </div>
    </div>
  )
}
