import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldHandleQuoteResume } from '../src/pages/dashboard/aiAssistantResume.js'

test('returns false when resume quote id is missing', () => {
  assert.equal(
    shouldHandleQuoteResume({
      resumeQuoteId: '',
      locationKey: 'abc',
      processedLocationKey: null,
    }),
    false
  )
})

test('returns true for first resume on a new navigation key', () => {
  assert.equal(
    shouldHandleQuoteResume({
      resumeQuoteId: 'quote-1',
      locationKey: 'nav-1',
      processedLocationKey: null,
    }),
    true
  )
})

test('returns false when same navigation already processed', () => {
  assert.equal(
    shouldHandleQuoteResume({
      resumeQuoteId: 'quote-1',
      locationKey: 'nav-1',
      processedLocationKey: 'nav-1',
    }),
    false
  )
})

test('returns true again for later navigation, even same quote id', () => {
  assert.equal(
    shouldHandleQuoteResume({
      resumeQuoteId: 'quote-1',
      locationKey: 'nav-2',
      processedLocationKey: 'nav-1',
    }),
    true
  )
})
