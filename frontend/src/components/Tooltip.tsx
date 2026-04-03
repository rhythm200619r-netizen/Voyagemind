import { useState, useRef, useMemo, cloneElement, ReactElement } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  useHover,
  useFocus,
  useRole,
  useInteractions,
  FloatingPortal,
  Placement
} from '@floating-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

interface TooltipProps {
  children: ReactElement
  label: string
  placement?: Placement
  delay?: number
}

export default function Tooltip({ 
  children, 
  label, 
  placement = 'top', 
  delay = 200 
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const arrowRef = useRef<HTMLDivElement>(null)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip(),
      shift(),
      arrow({ element: arrowRef })
    ],
  })

  const hover = useHover(context, { delay, move: false })
  const focus = useFocus(context)
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    role,
  ])

  // Get arrow position
  const { x: arrowX, y: arrowY } = context.middlewareData.arrow || {}
  const staticSide = useMemo(() => {
    return {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right',
    }[context.placement.split('-')[0]] as string
  }, [context.placement])

  return (
    <>
      {cloneElement(children, getReferenceProps({
        ref: refs.setReference,
        ...children.props,
      }))}
      <FloatingPortal>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={refs.setFloating}
              style={floatingStyles}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="z-[100] pointer-events-none rounded-[18px] border border-[rgba(212,136,58,0.22)] bg-[rgba(10,10,15,0.96)] px-2.5 py-1.5 text-xs font-medium text-[#f3ede4] shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md"
              {...getFloatingProps()}
            >
              {label}
              <div
                ref={arrowRef}
                className="absolute h-2 w-2 rotate-45 border-b border-r border-[rgba(212,136,58,0.22)] bg-[rgba(10,10,15,0.96)]"
                style={{
                  left: arrowX != null ? `${arrowX}px` : '',
                  top: arrowY != null ? `${arrowY}px` : '',
                  [staticSide]: '-4.5px',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
