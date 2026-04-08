import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="theme flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-700">
        Checking session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children
}

export default ProtectedRoute
