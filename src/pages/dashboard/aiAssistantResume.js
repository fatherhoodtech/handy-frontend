export function shouldHandleQuoteResume({ resumeQuoteId, locationKey, processedLocationKey }) {
  const resumeId = String(resumeQuoteId ?? '').trim()
  const navKey = String(locationKey ?? '').trim()
  if (!resumeId || !navKey) return false
  return navKey !== String(processedLocationKey ?? '').trim()
}
