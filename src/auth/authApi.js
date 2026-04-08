import { apiRequest } from '@/lib/apiClient'

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
  return apiRequest('/auth/refresh', {
    method: 'POST',
  })
}

export function logout() {
  return apiRequest('/auth/logout', {
    method: 'POST',
  })
}
