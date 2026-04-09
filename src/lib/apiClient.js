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
    let message = 'Request failed'
    try {
      const body = await response.json()
      message = body?.message || body?.error || message
    } catch {
      // no-op: keep generic message when response is not JSON
    }
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  if (response.status === 204) return null
  return response.json()
}
