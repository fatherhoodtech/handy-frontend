const ACCESS = 'hd_sales_access_token'
const REFRESH = 'hd_sales_refresh_token'

export function setSalesTokens(accessToken, refreshToken) {
  if (typeof accessToken === 'string' && accessToken.length > 0) {
    sessionStorage.setItem(ACCESS, accessToken)
  }
  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    sessionStorage.setItem(REFRESH, refreshToken)
  }
}

export function clearSalesTokens() {
  sessionStorage.removeItem(ACCESS)
  sessionStorage.removeItem(REFRESH)
}

export function getSalesAccessToken() {
  return sessionStorage.getItem(ACCESS) ?? ''
}

export function getSalesRefreshToken() {
  return sessionStorage.getItem(REFRESH) ?? ''
}

export function applyTokenResponse(payload) {
  if (!payload || typeof payload !== 'object') return
  const { accessToken, refreshToken } = payload
  if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
    setSalesTokens(accessToken, refreshToken)
  }
}
