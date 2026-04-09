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

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
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

  if (response.status === 204) return null
  return response.json()
}
