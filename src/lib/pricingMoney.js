export function centsToDollars(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

export function dollarsToCents(value) {
  const clean = String(value ?? '').trim().replace(/[^0-9.]/g, '')
  if (!clean) return 0
  const parsed = Number.parseFloat(clean)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}
