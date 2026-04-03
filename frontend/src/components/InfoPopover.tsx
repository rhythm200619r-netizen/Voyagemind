import { useState, ReactNode } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal
} from '@floating-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

interface InfoPopoverProps {
  children: ReactNode
  title: string
  description: string
  badge?: string
}

export default function InfoPopover({ 
  children, 
  title, 
  description, 
  badge = 'AI Agent' 
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip(),
      shift()
    ],
  })

  const hover = useHover(context, { delay: { open: 150, close: 0 } })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context)

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    click,
    dismiss,
    role,
  ])

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className="inline-block cursor-help border-b border-dotted border-indigo-400/50">
        {children}
      </span>
      <FloatingPortal>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={refs.setFloating}
              style={floatingStyles}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="z-[100] w-[260px] overflow-hidden rounded-[20px] border border-[rgba(212,136,58,0.2)] bg-[rgba(10,10,15,0.94)] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl"
              {...getFloatingProps()}
            >
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  {badge && (
                    <span className="rounded-full bg-[rgba(212,136,58,0.16)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--amber)] ring-1 ring-inset ring-[rgba(212,136,58,0.24)]">
                      {badge}
                    </span>
                  )}
                  <span className="animate-pulse text-xs text-[color:var(--amber)]">✦</span>
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">{title}</h4>
                  <p className="text-xs leading-relaxed text-slate-400">{description}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
