export function getLinkedJobberRequestId(quote) {
  const jobberRequestId = String(quote?.jobberRequestId ?? '').trim()
  return jobberRequestId || ''
}

export function buildRequestContinueState({ jobberRequestId, continueResponse, fallbackQuoteId }) {
  return {
    jobberRequestId,
    requestContinueMeta: {
      created: Boolean(continueResponse?.created),
      resumed: Boolean(continueResponse?.resumed),
      quoteId: String(continueResponse?.quoteId ?? fallbackQuoteId ?? ''),
    },
  }
}

/**
 * @param {string} quoteId
 * @param {{ jobberRequestIdFallback?: string }} [options]
 */
export function buildLegacyQuoteContinueState(quoteId, options = {}) {
  const resumeQuoteId = String(quoteId ?? '').trim()
  const state = { resumeQuoteId }
  const fallback = String(options.jobberRequestIdFallback ?? '').trim()
  if (fallback) {
    state.jobberRequestIdFallback = fallback
  }
  return state
}
