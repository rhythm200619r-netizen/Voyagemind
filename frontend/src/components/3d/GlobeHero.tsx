import { motion } from 'framer-motion'

export function GlobeHero() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(212,136,58,0.18),transparent_26%),radial-gradient(circle_at_85%_20%,rgba(184,146,74,0.1),transparent_18%),linear-gradient(180deg,rgba(12,12,18,0.88),rgba(10,10,15,0.98))]" />

      <motion.div
        className="absolute left-1/2 top-[12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
        style={{
          background:
            'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.05), transparent 36%), radial-gradient(circle at 50% 50%, rgba(24,28,46,0.92), rgba(6,8,18,0.98) 72%, rgba(0,0,0,0.98) 100%)',
          boxShadow: '0 0 160px rgba(212,136,58,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        <div className="absolute inset-8 rounded-full border border-[rgba(212,136,58,0.12)]" />
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, transparent 0 48%, rgba(212,136,58,0.14) 49%, transparent 50%), linear-gradient(90deg, transparent 0 49.4%, rgba(212,136,58,0.12) 49.6% 50.4%, transparent 50.6% 100%), linear-gradient(0deg, transparent 0 49.4%, rgba(212,136,58,0.12) 49.6% 50.4%, transparent 50.6% 100%)',
            backgroundSize: '100% 100%, 100% 100%, 100% 100%',
            maskImage: 'radial-gradient(circle at center, black 0 70%, transparent 74%)',
          }}
        />
        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_80px_rgba(212,136,58,0.08)]" />
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[rgba(10,10,15,0.96)] to-transparent" />
    </div>
  )
}
