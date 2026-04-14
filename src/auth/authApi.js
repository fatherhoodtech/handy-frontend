import { apiRequest } from '@/lib/apiClient'
import { getSalesRefreshToken } from '@/auth/authTokenStorage'

export function login({ email, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getMe() {
  return apiRequest('/auth/me')
}

export function refreshSession() {
  const refreshToken = getSalesRefreshToken()
  const body = refreshToken ? JSON.stringify({ refreshToken }) : undefined
  return apiRequest('/auth/refresh', {
    method: 'POST',
    ...(body ? { body } : {}),
  })
}

export function logout() {
  const refreshToken = getSalesRefreshToken()
  const body = refreshToken ? JSON.stringify({ refreshToken }) : undefined
  return apiRequest('/auth/logout', {
    method: 'POST',
    ...(body ? { body } : {}),
  })
}
