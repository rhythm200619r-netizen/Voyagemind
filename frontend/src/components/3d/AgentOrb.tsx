import type { CSSProperties } from 'react'

type AgentOrbStatus = 'running' | 'done' | 'failed' | 'pending'

type AgentOrbProps = {
  status: AgentOrbStatus
}

export function AgentOrb({ status }: AgentOrbProps) {
  const baseClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.3)]'

  let className = `${baseClass} bg-[radial-gradient(circle_at_35%_35%,#f0a855,#8a4a10_60%,#3a1a02)]`
  let style: CSSProperties = {}

  if (status === 'running') {
    className += ' animate-[orbPulse_2s_ease-in-out_infinite]'
  }

  if (status === 'done') {
    className += ' opacity-50 grayscale-[30%]'
  }

  if (status === 'failed') {
    className += ' animate-[flicker_0.15s_steps(2,end)_infinite]'
    className = `${baseClass} bg-[radial-gradient(circle_at_35%_35%,#ff7b6e,#c0392b_60%,#5e1010)]`
    style = { boxShadow: '0 0 14px rgba(192,57,43,0.35), inset 0 1px 2px rgba(255,255,255,0.18)' }
  }

  if (status === 'pending') {
    className += ' opacity-30'
  }

  return <span aria-hidden="true" className={className} style={style} />
}
