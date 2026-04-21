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

export function buildLegacyQuoteContinueState(quoteId) {
  return { resumeQuoteId: String(quoteId ?? '').trim() }
}
