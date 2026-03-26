import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { supabaseConfigError } from '../supabase'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'rounded-md bg-white/15 px-3 py-2 text-sm font-semibold text-white'
    : 'rounded-md px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white'
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-white/30" />
        <div className="vm-blob vm-blob-1 absolute -left-28 -top-28 h-96 w-96 rounded-full bg-blue-500/45 blur-3xl mix-blend-multiply" />
        <div className="vm-blob vm-blob-2 absolute right-[-8rem] top-16 h-[32rem] w-[32rem] rounded-full bg-indigo-500/45 blur-3xl mix-blend-multiply" />
        <div className="vm-blob vm-blob-3 absolute bottom-[-12rem] left-1/4 h-[34rem] w-[34rem] rounded-full bg-emerald-500/35 blur-3xl mix-blend-multiply" />
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
            </nav>
          </div>
        </header>

        {supabaseConfigError ? (
          <div className="border-b border-amber-200 bg-amber-50">
            <div className="mx-auto max-w-6xl px-6 py-3 text-sm text-amber-900">{supabaseConfigError}</div>
          </div>
        ) : null}

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

        <footer className="border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500">
            VoyageMind MVP scaffold (Flights + Stays)
          </div>
        </footer>
      </div>
    </div>
  )
}
