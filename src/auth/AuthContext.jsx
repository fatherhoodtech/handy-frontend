import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, login as loginApi, logout as logoutApi, refreshSession } from '@/auth/authApi'
import { applyTokenResponse, clearSalesTokens } from '@/auth/authTokenStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrapSession() {
      try {
        const me = await getMe()
        if (!cancelled) setUser(me.user)
      } catch (error) {
        try {
          const refreshed = await refreshSession()
          applyTokenResponse(refreshed)
          if (!cancelled) setUser(refreshed.user)
        } catch {
          clearSalesTokens()
          if (!cancelled) setUser(null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void bootstrapSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email, password) {
    const response = await loginApi({ email, password })
    applyTokenResponse(response)
    setUser(response.user)
    return response.user
  }

  async function logout() {
    try {
      await logoutApi()
    } finally {
      clearSalesTokens()
      setUser(null)
    }
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
    }),
    [user, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
