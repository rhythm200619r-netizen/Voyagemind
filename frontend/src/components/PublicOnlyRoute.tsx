import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="text-sm text-[color:var(--body-muted)]">Checking your session...</div>
  }

  if (user) {
    return <Navigate to="/my-trips" replace />
  }

  return <>{children}</>
}
