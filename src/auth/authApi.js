import { apiRequest } from '@/lib/apiClient'
import { applyTokenResponse, getSalesRefreshToken } from '@/auth/authTokenStorage'

export function login({ email, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getMe() {
  return apiRequest('/auth/me')
}

export async function refreshSession() {
  const refreshToken = getSalesRefreshToken()
  const body = refreshToken ? JSON.stringify({ refreshToken }) : undefined
  const response = await apiRequest('/auth/refresh', {
    method: 'POST',
    ...(body ? { body } : {}),
  })
  applyTokenResponse(response)
  return response
}

export function logout() {
  const refreshToken = getSalesRefreshToken()
  const body = refreshToken ? JSON.stringify({ refreshToken }) : undefined
  return apiRequest('/auth/logout', {
    method: 'POST',
    ...(body ? { body } : {}),
  })
}
