import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

import { useAuth } from '../auth/AuthContext'
import { createRun } from '../lib/api'

export default function FloatingAssistant() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [budget, setBudget] = useState('')
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [departDate, setDepartDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [promptFocused, setPromptFocused] = useState(false)
  const [budgetFocused, setBudgetFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingFields: string[] = []
  if (!fromCity.trim()) missingFields.push('departure')
  if (!toCity.trim()) missingFields.push('destination')
  if (!departDate) missingFields.push('depart date')
  if (!returnDate) missingFields.push('return date')
  if (departDate && returnDate && returnDate < departDate) missingFields.push('valid date range')

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(12), flip({ fallbackAxisSideDirection: 'end' }), shift()],
    whileElementsMounted: autoUpdate,
    placement: 'top-end',
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context)

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  async function handleRun() {
    if (missingFields.length > 0) return
    if (!user) {
      navigate('/login')
      return
    }

    setIsPlanning(true)
    setError(null)

    try {
      const parts: string[] = []
      parts.push('Plan a trip')
      parts.push(`from ${fromCity.trim()}`)
      parts.push(`to ${toCity.trim()}`)
      parts.push(`depart ${departDate}`)
      parts.push(`return ${returnDate}`)

      const numericBudget = budget.trim()
      if (numericBudget) parts.push(`under $${numericBudget}`)

      const extra = prompt.trim()
      if (extra) parts.push(extra)

      const data = await createRun(parts.join(' '))
      setIsOpen(false)
      setPrompt('')
      setBudget('')
      setFromCity('')
      setToCity('')
      setDepartDate('')
      setReturnDate('')
      navigate(`/trips/${data.run_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsPlanning(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex items-center justify-center" ref={refs.setReference} {...getReferenceProps()}>
        {!isOpen ? <div className="absolute inset-0 rounded-full bg-[rgba(212,136,58,0.16)] animate-pulse-ring" /> : null}
        <button
          type="button"
          className="vm-primary-button flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold"
          aria-label="AI Travel Assistant"
        >
          <span className={`transition-transform duration-300 ${isOpen ? 'rotate-0' : 'rotate-45'}`}>{isOpen ? '×' : '+'}</span>
        </button>
      </div>

      <FloatingPortal>
        <AnimatePresence>
          {isOpen ? (
            <FloatingFocusManager context={context} modal={false}>
              <motion.div
                ref={refs.setFloating}
                style={floatingStyles}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="z-50 w-[380px] overflow-hidden rounded-[24px] border border-[rgba(212,136,58,0.2)] bg-[var(--surface-strong)] shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-[24px]"
                {...getFloatingProps()}
              >
                <div className="relative p-6 space-y-5">
                  <header className="flex items-center justify-between">
                    <div>
                      <div className="display text-sm uppercase tracking-[0.22em] text-[color:var(--amber)]">VoyageMind</div>
                      <h2 className="display mt-1 text-2xl text-[color:var(--page-text)]">Plan My Trip</h2>
                    </div>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="rounded-full border border-[rgba(212,136,58,0.16)] px-3 py-2 text-sm text-[color:var(--body-muted)] transition hover:border-[rgba(212,136,58,0.32)] hover:text-[color:var(--amber)]"
                    >
                      ×
                    </button>
                  </header>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-[color:var(--body-muted)]">Departure</span>
                        <input
                          value={fromCity}
                          onChange={(e) => setFromCity(e.target.value)}
                          placeholder="City / Airport"
                          className="vm-field px-4 py-3 text-sm"
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-[color:var(--body-muted)]">Destination</span>
                        <input
                          value={toCity}
                          onChange={(e) => setToCity(e.target.value)}
                          placeholder="City / Airport"
                          className="vm-field px-4 py-3 text-sm"
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-[color:var(--body-muted)]">Depart</span>
                        <input
                          type="date"
                          value={departDate}
                          onChange={(e) => setDepartDate(e.target.value)}
                          className="vm-field px-4 py-3 text-sm"
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-[color:var(--body-muted)]">Return</span>
                        <input
                          type="date"
                          min={departDate || undefined}
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                          className="vm-field px-4 py-3 text-sm"
                        />
                      </label>
                    </div>

                    <div className="relative">
                      <textarea
                        autoFocus
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onFocus={() => setPromptFocused(true)}
                        onBlur={() => setPromptFocused(false)}
                        rows={3}
                        placeholder=""
                        className="vm-field min-h-[118px] resize-none px-4 pb-3 pt-7 text-sm"
                      />
                        <span className={`vm-floating-label ${promptFocused || prompt.trim().length > 0 ? 'is-active' : ''}`}>
                        Your travel prompt
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        onFocus={() => setBudgetFocused(true)}
                        onBlur={() => setBudgetFocused(false)}
                        placeholder=""
                        className="vm-field px-4 pb-3 pt-7 text-sm"
                      />
                      <span className={`vm-floating-label ${budgetFocused || budget.trim().length > 0 ? 'is-active' : ''}`}>
                        Total budget
                      </span>
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--body-muted)]">$</span>
                    </div>

                    {error ? (
                      <div className="animate-[errorShake_300ms_ease-in-out] rounded-[18px] border border-[rgba(192,57,43,0.25)] bg-[rgba(192,57,43,0.12)] p-3 text-xs text-[#ffb8ad]">
                        {error}
                      </div>
                    ) : null}

                    {missingFields.length > 0 ? (
                      <div className="rounded-[18px] border border-white/10 bg-white/5 p-3 text-xs text-[color:var(--body-muted)]">
                        Add {missingFields.join(', ')} to plan.
                      </div>
                    ) : null}

                    <button
                      type="button"
                      disabled={isPlanning || missingFields.length > 0}
                      onClick={handleRun}
                      className={`vm-primary-button w-full py-3.5 text-sm font-semibold ${isPlanning ? 'is-loading' : ''}`}
                    >
                      {isPlanning ? 'Planning…' : 'Plan My Trip'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </FloatingFocusManager>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
