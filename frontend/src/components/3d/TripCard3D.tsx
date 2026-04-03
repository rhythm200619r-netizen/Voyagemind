import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useState } from 'react'

type TripCard3DProps = {
  children: ReactNode
  className?: string
}

// @copilot: CSS 3D tilt effect, perspective 1000px, spring return on mouseleave
export function TripCard3D({ children, className = '' }: TripCard3DProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [shine, setShine] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5

    setTilt({ x: y * -8, y: x * 8 })
    setShine({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  function handleMouseLeave() {
    setIsHovered(false)
    setTilt({ x: 0, y: 0 })
  }

  const wrapperStyle: CSSProperties = {
    perspective: '1000px',
    transformStyle: 'preserve-3d',
    transform: isHovered ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.02)` : 'rotateX(0deg) rotateY(0deg) scale(1)',
    transition: isHovered ? 'transform 100ms ease' : 'transform 500ms var(--ease-spring)',
  }

  return (
    <div
      className={className}
      style={wrapperStyle}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
        {isHovered ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background: `radial-gradient(circle at ${shine.x}px ${shine.y}px, rgba(255,255,255,0.06), transparent 70%)`,
            }}
          />
        ) : null}
        <div style={{ transform: 'translateZ(0)' }}>{children}</div>
      </div>
    </div>
  )
}
