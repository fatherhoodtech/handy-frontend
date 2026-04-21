import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLegacyQuoteContinueState,
  buildRequestContinueState,
  getLinkedJobberRequestId,
} from '../src/pages/dashboard/quoteContinue.js'

test('extracts linked request id from quote when present', () => {
  assert.equal(getLinkedJobberRequestId({ jobberRequestId: ' 24169637 ' }), '24169637')
})

test('returns empty request id when quote is not linked', () => {
  assert.equal(getLinkedJobberRequestId({ jobberRequestId: '' }), '')
  assert.equal(getLinkedJobberRequestId(null), '')
})

test('builds request-based continue state with requestContinueMeta', () => {
  const state = buildRequestContinueState({
    jobberRequestId: '24169637',
    continueResponse: { created: false, resumed: true, quoteId: 'quote-123' },
    fallbackQuoteId: 'fallback-quote',
  })
  assert.deepEqual(state, {
    jobberRequestId: '24169637',
    requestContinueMeta: { created: false, resumed: true, quoteId: 'quote-123' },
  })
})

test('builds request-based continue state with fallback quote id', () => {
  const state = buildRequestContinueState({
    jobberRequestId: '24169637',
    continueResponse: { created: true, resumed: false },
    fallbackQuoteId: 'fallback-quote',
  })
  assert.deepEqual(state, {
    jobberRequestId: '24169637',
    requestContinueMeta: { created: true, resumed: false, quoteId: 'fallback-quote' },
  })
})

test('builds legacy quote continue state for unlinked quotes', () => {
  assert.deepEqual(buildLegacyQuoteContinueState('quote-legacy'), { resumeQuoteId: 'quote-legacy' })
})
