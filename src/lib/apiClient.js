import {
  clearSalesTokens,
  getSalesAccessToken,
  getSalesRefreshToken,
  setSalesTokens,
} from '@/auth/authTokenStorage'

function resolveApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw !== undefined && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    return ''
  }
  return 'http://localhost:8080'
}

const API_BASE_URL = resolveApiBaseUrl()
const AUTH_PATH_PREFIX = '/auth/'
let refreshInFlight = null

function isAuthPath(path) {
  return String(path || '').startsWith(AUTH_PATH_PREFIX)
}

function buildHeaders(optionHeaders = {}, tokenOverride) {
  const token = tokenOverride ?? getSalesAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(optionHeaders || {}),
  }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function tryRefreshAccessToken() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const refreshToken = getSalesRefreshToken()
    if (!refreshToken) {
      clearSalesTokens()
      return false
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!response.ok) {
        clearSalesTokens()
        return false
      }
      const payload = await response.json().catch(() => null)
      const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : ''
      const nextRefreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : ''
      if (!accessToken || !nextRefreshToken) {
        clearSalesTokens()
        return false
      }
      setSalesTokens(accessToken, nextRefreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function parseApiError(response) {
  const raw = await response.text()
  let message = 'Request failed'
  try {
    const body = raw ? JSON.parse(raw) : {}
    message = body?.message || body?.error || message
  } catch {
    if (response.status === 502 || response.status === 504) {
      message =
        `Cannot reach the quote engine (HTTP ${response.status}). ` +
        `Start the API and ensure VITE_API_PROXY_TARGET matches its port (default http://127.0.0.1:8080).`
    } else if (raw.trim().length > 0 && raw.length < 280) {
      message = raw.trim()
    }
  }
  const error = new Error(message)
  error.status = response.status
  throw error
}

export async function apiRequest(path, options = {}, retried = false) {
  const { headers: optionHeaders, ...rest } = options
  const headers = buildHeaders(optionHeaders)

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers,
    ...rest,
  })

  if (!response.ok) {
    if (response.status === 401 && !retried && !isAuthPath(path)) {
      const refreshed = await tryRefreshAccessToken()
      if (refreshed) {
        return apiRequest(path, options, true)
      }
      const expired = new Error('Session expired. Please sign in again.')
      expired.status = 401
      throw expired
    }
    await parseApiError(response)
  }

  if (response.status === 204) return null
  return response.json()
}
