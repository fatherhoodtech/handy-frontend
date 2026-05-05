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

function normalizeHtmlError(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim()
  const cannotRouteMatch = text.match(/Cannot\s+(GET|POST|PATCH|PUT|DELETE)\s+([^\s<]+)/i)
  if (!cannotRouteMatch) return ''
  const method = cannotRouteMatch[1].toUpperCase()
  const route = cannotRouteMatch[2]
  return `The API route ${method} ${route} was not found in this environment. ` +
    `This usually means the backend is not deployed/running the latest version or frontend API base URL is misconfigured.`
}

async function parseApiError(response, requestPath) {
  const raw = await response.text()
  let message = 'Something went wrong. Please try again.'
  let parsedBody = null
  try {
    const body = raw ? JSON.parse(raw) : {}
    parsedBody = body
    message = body?.message || body?.error || message
  } catch {
    const htmlMessage = normalizeHtmlError(raw)
    if (htmlMessage) {
      message = htmlMessage
    } else if (response.status === 404 && String(requestPath || '').startsWith('/api/')) {
      message =
        `API endpoint ${requestPath} returned 404. ` +
        `Confirm backend deploy version and API routing/proxy configuration.`
    } else if (response.status === 404 && String(requestPath || '').startsWith('/auth/')) {
      message =
        `Auth endpoint ${requestPath} returned 404. ` +
        `Confirm backend auth routes are reachable from this environment.`
    } else if (response.status === 502 || response.status === 504) {
      message =
        `Cannot reach the quote engine (HTTP ${response.status}). ` +
        `Start the API and ensure VITE_API_PROXY_TARGET matches its port (default http://127.0.0.1:8080).`
    } else if (response.status >= 500) {
      message =
        `The server returned HTTP ${response.status}. ` +
        `Check backend logs for the specific failure.`
    } else if (raw.trim().length > 0 && raw.length < 280) {
      message = raw.trim()
    }
  }
  const error = new Error(message)
  error.status = response.status
  if (parsedBody && typeof parsedBody === 'object') {
    error.reason = typeof parsedBody.reason === 'string' ? parsedBody.reason : ''
    error.errorCode = typeof parsedBody.errorCode === 'string' ? parsedBody.errorCode : ''
  }
  throw error
}

export async function apiRequest(path, options = {}, retried = false) {
  const { headers: optionHeaders, ...rest } = options
  const headers = buildHeaders(optionHeaders)
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers,
      ...rest,
    })
  } catch {
    const error = new Error(
      navigator.onLine
        ? "Couldn't reach the server. Please check your connection and try again."
        : "You're offline. Please check your internet connection and try again."
    )
    error.status = 0
    error.isNetworkError = true
    throw error
  }

  if (!response.ok) {
    if (response.status === 401 && !retried && !isAuthPath(path)) {
      const refreshed = await tryRefreshAccessToken()
      if (refreshed) {
        return apiRequest(path, options, true)
      }
      window.location.reload()
    }
    await parseApiError(response, path)
  }

  if (response.status === 204) return null
  return response.json()
}
