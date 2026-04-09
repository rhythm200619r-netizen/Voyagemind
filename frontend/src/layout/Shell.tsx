import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import FloatingAssistant from '../components/FloatingAssistant'
import { PageTransition } from '../components/PageTransition'
import Tooltip from '../components/Tooltip'
import { supabaseConfigError } from '../supabase'
import { useTheme } from '../hooks/useTheme'

const GlobeHero = lazy(() => import('../components/3d/GlobeHero').then((module) => ({ default: module.GlobeHero })))

function NavItem({ to, end = false, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end} className="relative block">
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: 3 }}
          transition={{ duration: 0.15 }}
          className={`relative rounded-[14px] px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
            isActive ? 'text-[color:var(--amber)]' : 'text-[#f3ede4]/78 hover:text-[color:var(--amber)]'
          }`}
        >
          {isActive ? (
            <AnimatePresence>
              <motion.div
                layoutId="nav-indicator"
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-[2px] bg-[color:var(--amber)]"
              />
            </AnimatePresence>
          ) : null}
          <span className="relative z-10">{children}</span>
        </motion.div>
      )}
    </NavLink>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false)
  const authMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (authMenuRef.current && !authMenuRef.current.contains(event.target as Node)) {
        setIsAuthMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAuthMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  async function handleSignOut() {
    try {
      await signOut()
      setIsAuthMenuOpen(false)
    } catch {
      // Keep shell resilient even when signout fails due to transient auth issues.
    }
  }

  return (
    <div className={`relative isolate min-h-screen overflow-hidden ${theme === 'dark' ? 'bg-[var(--page-bg)] text-[#e8e4dc]' : 'bg-[var(--page-bg)] text-[#1a1620]'}`}>
      <Suspense fallback={null}>
        <GlobeHero />
      </Suspense>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className={`absolute inset-0 ${theme === 'dark' ? 'bg-[radial-gradient(circle_at_top,rgba(212,136,58,0.08),transparent_36%),linear-gradient(180deg,rgba(10,10,15,0.12),rgba(10,10,15,0.78))]' : 'bg-[radial-gradient(circle_at_top,rgba(212,136,58,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.68),rgba(246,241,234,0.92))]'}`} />
        <div className={`vm-blob vm-blob-1 absolute -left-28 -top-28 h-96 w-96 rounded-full blur-3xl ${theme === 'dark' ? 'bg-[rgba(212,136,58,0.18)] mix-blend-screen' : 'bg-[rgba(212,136,58,0.14)] mix-blend-multiply'}`} />
        <div className={`vm-blob vm-blob-2 absolute right-[-8rem] top-16 h-[32rem] w-[32rem] rounded-full blur-3xl ${theme === 'dark' ? 'bg-[rgba(184,146,74,0.16)] mix-blend-screen' : 'bg-[rgba(184,146,74,0.12)] mix-blend-multiply'}`} />
        <div className={`vm-blob vm-blob-3 absolute bottom-[-12rem] left-1/4 h-[34rem] w-[34rem] rounded-full blur-3xl ${theme === 'dark' ? 'bg-[rgba(255,255,255,0.05)] mix-blend-screen' : 'bg-[rgba(255,255,255,0.5)] mix-blend-multiply'}`} />
      </div>

      <div className="relative z-10">
        <header className={`relative z-40 border-b backdrop-blur-xl ${theme === 'dark' ? 'border-white/5 bg-[rgba(9,9,13,0.86)] text-[#f5eee5]' : 'border-black/5 bg-[rgba(255,255,255,0.72)] text-[#1a1620]'}`}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-baseline gap-3">
              <div className={`display text-lg font-semibold tracking-tight ${theme === 'dark' ? 'text-[#f7efe5]' : 'text-[#1a1620]'}`}>VoyageMind</div>
              <div className={`hidden text-sm sm:block ${theme === 'dark' ? 'text-[#f7efe5]/65' : 'text-[#1a1620]/62'}`}>Cartographic luxury travel concierge</div>
            </div>

            <nav className="flex flex-wrap items-center gap-1">
              <NavItem to="/" end>
                Home
              </NavItem>
              <NavItem to="/flights">Flights</NavItem>
              <NavItem to="/stays">Stays</NavItem>
              <NavItem to="/holidays">Holidays</NavItem>
              <NavItem to="/offers">Offers</NavItem>
              <NavItem to="/support">Support</NavItem>
              <NavItem to="/about">About</NavItem>

              <div className="relative ml-2" ref={authMenuRef}>
                <Tooltip label={user ? 'Account menu' : 'Login or sign up'} placement="left">
                  <button
                    type="button"
                    aria-label={user ? 'Open account menu' : 'Open login and signup menu'}
                    aria-expanded={isAuthMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsAuthMenuOpen((prev) => !prev)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-[12px] border transition ${theme === 'dark' ? 'border-white/15 text-[#f3ede4]/85 hover:border-[rgba(212,136,58,0.4)] hover:text-[color:var(--amber)]' : 'border-black/15 text-[#1a1620]/85 hover:border-[rgba(212,136,58,0.5)] hover:text-[color:var(--amber)]'}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 19c1.4-3.1 4.1-4.7 7-4.7s5.6 1.6 7 4.7" strokeLinecap="round" />
                    </svg>
                  </button>
                </Tooltip>

                {isAuthMenuOpen ? (
                  <div
                    role="menu"
                    className={`absolute right-0 top-12 z-50 min-w-[12rem] rounded-[14px] border p-2 shadow-xl backdrop-blur-xl ${theme === 'dark' ? 'border-white/10 bg-[rgba(14,14,20,0.9)]' : 'border-black/10 bg-[rgba(255,255,255,0.95)]'}`}
                  >
                    {user ? (
                      <div className="grid gap-1">
                        <div className={`px-2 py-1 text-xs ${theme === 'dark' ? 'text-[#f7efe5]/65' : 'text-[#1a1620]/65'}`}>{user.email}</div>
                        <NavLink
                          to="/my-trips"
                          role="menuitem"
                          onClick={() => setIsAuthMenuOpen(false)}
                          className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition ${theme === 'dark' ? 'text-[#f3ede4]/85 hover:bg-white/8 hover:text-[color:var(--amber)]' : 'text-[#1a1620]/85 hover:bg-black/5 hover:text-[color:var(--amber)]'}`}
                        >
                          My Trips
                        </NavLink>
                        <NavLink
                          to="/personal-info"
                          role="menuitem"
                          onClick={() => setIsAuthMenuOpen(false)}
                          className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition ${theme === 'dark' ? 'text-[#f3ede4]/85 hover:bg-white/8 hover:text-[color:var(--amber)]' : 'text-[#1a1620]/85 hover:bg-black/5 hover:text-[color:var(--amber)]'}`}
                        >
                          Personal Info
                        </NavLink>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleSignOut}
                          className={`rounded-[10px] px-2 py-2 text-left text-sm font-semibold transition ${theme === 'dark' ? 'text-[#f3ede4]/85 hover:bg-white/8 hover:text-[color:var(--amber)]' : 'text-[#1a1620]/85 hover:bg-black/5 hover:text-[color:var(--amber)]'}`}
                        >
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        <NavLink
                          to="/login"
                          role="menuitem"
                          onClick={() => setIsAuthMenuOpen(false)}
                          className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition ${theme === 'dark' ? 'text-[#f3ede4]/85 hover:bg-white/8 hover:text-[color:var(--amber)]' : 'text-[#1a1620]/85 hover:bg-black/5 hover:text-[color:var(--amber)]'}`}
                        >
                          Login
                        </NavLink>
                        <NavLink
                          to="/signup"
                          role="menuitem"
                          onClick={() => setIsAuthMenuOpen(false)}
                          className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition ${theme === 'dark' ? 'text-[#f3ede4]/85 hover:bg-white/8 hover:text-[color:var(--amber)]' : 'text-[#1a1620]/85 hover:bg-black/5 hover:text-[color:var(--amber)]'}`}
                        >
                          Sign up
                        </NavLink>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className={`ml-2 flex items-center gap-2 rounded-[14px] px-2 py-2 transition ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                <span className={`hidden text-xs font-semibold sm:block ${theme === 'dark' ? 'text-[#f7efe5]/60' : 'text-[#1a1620]/62'}`}>Theme</span>
                <Tooltip label="Toggle theme" placement="left">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={theme === 'dark'}
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 ${theme === 'dark' ? 'border-[rgba(212,136,58,0.24)] bg-[rgba(255,255,255,0.06)] ring-white/5 focus:ring-[rgba(212,136,58,0.2)]' : 'border-[rgba(10,10,15,0.16)] bg-[rgba(10,10,15,0.06)] ring-black/5 focus:ring-[rgba(212,136,58,0.2)]'}`}
                  >
                    <span className="sr-only">Toggle theme</span>
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-[linear-gradient(135deg,var(--amber),var(--brass))] shadow-[0_2px_10px_rgba(212,136,58,0.28)] transition-transform ${
                        theme === 'dark' ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </Tooltip>
              </div>
            </nav>
          </div>
        </header>

        {supabaseConfigError ? (
          <div className="border-b border-[rgba(212,136,58,0.24)] bg-[rgba(212,136,58,0.08)]">
            <div className="mx-auto max-w-6xl px-6 py-3 text-sm text-[#f2e7d6]">{supabaseConfigError}</div>
          </div>
        ) : null}

        <main className="mx-auto max-w-6xl px-6 py-8">
          <PageTransition>{children}</PageTransition>
        </main>

        <footer className={`border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
          <div className={`mx-auto max-w-6xl px-6 py-6 text-xs ${theme === 'dark' ? 'text-[#f7efe5]/55' : 'text-[#1a1620]/55'}`}>
            VoyageMind MVP scaffold (Flights + Stays)
          </div>
        </footer>

        <FloatingAssistant />
      </div>
    </div>
  )
}
