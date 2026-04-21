import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, CheckCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildLegacyQuoteContinueState,
  buildRequestContinueState,
  getLinkedJobberRequestId,
} from './quoteContinue'

function formatMoneyFromCents(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100)
}

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now'
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`
  return new Date(iso).toLocaleDateString()
}

function QuotesPage() {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [isLoadingQuoteDetail, setIsLoadingQuoteDetail] = useState(false)
  const [isDeletingQuoteId, setIsDeletingQuoteId] = useState('')
  const [isRetryingJobberQuoteId, setIsRetryingJobberQuoteId] = useState('')
  const [deleteQuoteTarget, setDeleteQuoteTarget] = useState(null)
  const [syncNotice, setSyncNotice] = useState('')
  const [jobberReadinessByQuoteId, setJobberReadinessByQuoteId] = useState({})

  useEffect(() => {
    let cancelled = false
    async function loadQuotes() {
      try {
        setIsLoading(true)
        const response = await apiRequest('/api/sales/quotes')
        if (cancelled) return
        const loadedQuotes = Array.isArray(response?.quotes) ? response.quotes : []
        setQuotes(loadedQuotes)
        const readinessEntries = await Promise.all(
          loadedQuotes.map(async (quote) => {
            try {
              const readinessRes = await apiRequest(
                `/api/sales/quotes/${encodeURIComponent(quote.id)}/jobber-readiness`
              )
              return [quote.id, readinessRes?.readiness ?? { ready: false, missingFields: [] }]
            } catch {
              return [quote.id, { ready: false, missingFields: [] }]
            }
          })
        )
        if (!cancelled) {
          setJobberReadinessByQuoteId(Object.fromEntries(readinessEntries))
        }
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Failed to load quotes')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadQuotes()
    return () => {
      cancelled = true
    }
  }, [])

  const now = Date.now()
  const filteredQuotes = quotes.filter((quote) => {
    const searchText = `${quote.client ?? ''} ${quote.title ?? ''} ${quote.quoteDescription ?? ''}`.toLowerCase()
    const matchesSearch = search.trim() === '' || searchText.includes(search.trim().toLowerCase())
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter
    const createdAtMs = new Date(quote.createdAt).getTime()
    const matchesDate =
      dateFilter === 'all' ||
      (dateFilter === '7d' && now - createdAtMs <= 7 * 24 * 60 * 60 * 1000) ||
      (dateFilter === '30d' && now - createdAtMs <= 30 * 24 * 60 * 60 * 1000)
    return matchesSearch && matchesStatus && matchesDate
  })

  async function openQuoteDetail(quoteId) {
    try {
      setError('')
      setSyncNotice('')
      setIsLoadingQuoteDetail(true)
      const response = await apiRequest(`/api/sales/quotes/${encodeURIComponent(quoteId)}`)
      setSelectedQuote(response?.quote ?? null)
    } catch (err) {
      setError(err?.message || 'Failed to load quote details')
    } finally {
      setIsLoadingQuoteDetail(false)
    }
  }

  async function handleContinueDraft(quote) {
    const quoteId = String(quote?.id ?? '').trim()
    if (!quoteId) return
    const jobberRequestId = getLinkedJobberRequestId(quote)
    setError('')
    try {
      if (jobberRequestId) {
        const continueResponse = await apiRequest(
          `/api/sales/requests/${encodeURIComponent(jobberRequestId)}/continue`,
          { method: 'POST' }
        )
        navigate('/dashboard/ai-assistant', {
          state: buildRequestContinueState({
            jobberRequestId,
            continueResponse,
            fallbackQuoteId: quoteId,
          }),
        })
        return
      }
      // Legacy fallback for older quotes that are not linked to a request id.
      navigate('/dashboard/ai-assistant', { state: buildLegacyQuoteContinueState(quoteId) })
    } catch (err) {
      setError(err?.message || 'Failed to continue this quote in AI Assistant')
    }
  }

  function openDeleteQuoteModal(quote) {
    setSyncNotice('')
    setDeleteQuoteTarget(quote)
  }

  function closeDeleteQuoteModal() {
    if (isDeletingQuoteId) return
    setDeleteQuoteTarget(null)
  }

  async function handleDeleteQuote(quoteId) {
    try {
      setError('')
      setIsDeletingQuoteId(quoteId)
      await apiRequest(`/api/sales/quotes/${encodeURIComponent(quoteId)}`, { method: 'DELETE' })
      setQuotes((current) => current.filter((quote) => quote.id !== quoteId))
      setSelectedQuote((current) => (current?.id === quoteId ? null : current))
      setDeleteQuoteTarget(null)
    } catch (err) {
      setError(err?.message || 'Failed to delete quote')
    } finally {
      setIsDeletingQuoteId('')
    }
  }

  async function handleRetryJobberSync(quoteId) {
    try {
      setError('')
      setSyncNotice('')
      setIsRetryingJobberQuoteId(quoteId)
      const retryResponse = await apiRequest(`/api/sales/quotes/${encodeURIComponent(quoteId)}/retry-jobber-sync`, {
        method: 'POST',
      })
      const retryStatus = String(retryResponse?.jobberSync?.status ?? '')
      const retryError = String(retryResponse?.jobberSync?.error ?? '')
      const remoteId = String(retryResponse?.jobberSync?.jobberQuoteId ?? '')
      const reasonCategory = String(retryResponse?.jobberSync?.reasonCategory ?? '')
      const missingFields = Array.isArray(retryResponse?.jobberSync?.missingFields)
        ? retryResponse.jobberSync.missingFields
        : []
      const [quotesResponse, detailResponse] = await Promise.all([
        apiRequest('/api/sales/quotes'),
        apiRequest(`/api/sales/quotes/${encodeURIComponent(quoteId)}`),
      ])
      setQuotes(Array.isArray(quotesResponse?.quotes) ? quotesResponse.quotes : [])
      setSelectedQuote(detailResponse?.quote ?? null)
      if (retryStatus === 'synced') {
        setSyncNotice(
          remoteId
            ? `Jobber sync succeeded. Quote created in Jobber (${remoteId}).`
            : 'Jobber sync succeeded. Quote created in Jobber.'
        )
      } else if (retryStatus === 'failed') {
        if (reasonCategory === 'preflight_validation_failed') {
          setSyncNotice(
            missingFields.length > 0
              ? `Jobber preflight failed. Missing required fields: ${missingFields.join(', ')}.`
              : `Jobber preflight failed${retryError ? `: ${retryError}` : '.'}`
          )
        } else if (reasonCategory === 'property_resolution_failed') {
          setSyncNotice(
            `Jobber sync failed: Client exists in Jobber but no usable property was found. Open that client in Jobber, confirm at least one service property/address exists, then retry.`
          )
        } else {
          setSyncNotice(`Jobber sync failed${retryError ? `: ${retryError}` : '.'}`)
        }
      } else {
        setSyncNotice('Jobber sync request finished. Refreshing status...')
      }
    } catch (err) {
      setError(err?.message || 'Failed to retry Jobber sync')
    } finally {
      setIsRetryingJobberQuoteId('')
    }
  }

  const draftCount = useMemo(() => quotes.filter((q) => q.status === 'draft').length, [quotes])
  const approvedCount = useMemo(() => quotes.filter((q) => q.status === 'approved').length, [quotes])
  const syncedCount = useMemo(() => quotes.filter((q) => q.jobberSyncStatus === 'synced').length, [quotes])
  const hasActiveFilters = search.trim() || statusFilter !== 'all' || dateFilter !== 'all'

  return (
    <>
      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total quotes</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">{isLoading ? '—' : quotes.length}</p>
              <p className="mt-0.5 text-xs text-zinc-400">All time</p>
            </div>
            <span className="rounded-lg bg-zinc-100 p-2 text-zinc-600">
              <ClipboardList className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Drafts</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">{isLoading ? '—' : draftCount}</p>
              <p className="mt-0.5 text-xs text-zinc-400">In progress</p>
            </div>
            <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <FileText className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Approved</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">{isLoading ? '—' : approvedCount}</p>
              <p className="mt-0.5 text-xs text-zinc-400">Ready to sync</p>
            </div>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Synced to Jobber</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">{isLoading ? '—' : syncedCount}</p>
              <p className="mt-0.5 text-xs text-zinc-400">Sent to Jobber</p>
            </div>
            <span className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <RefreshCw className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold text-zinc-900">
              {hasActiveFilters ? 'Filtered quotes' : 'All quotes'}
            </h2>
            {!isLoading && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {filteredQuotes.length} {filteredQuotes.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search quotes..."
                className="h-9 w-52 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Filter pills row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-5 py-2.5">
          {['all', 'draft', 'approved'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                statusFilter === status
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100'
              )}>
              {status === 'all' ? 'All statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select
              className="h-7 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 outline-none focus:border-zinc-400"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}>
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
                onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter('all') }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <p className="py-16 text-center text-sm text-zinc-500">Loading quotes...</p>
        )}

        {/* Empty state */}
        {!isLoading && filteredQuotes.length === 0 && (
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">
              {quotes.length === 0 ? 'No quotes yet' : 'No quotes match your filters'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {quotes.length === 0
                ? 'Start a quote from a request using AI Assistant.'
                : 'Try adjusting your search or clearing the filters.'}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && filteredQuotes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-zinc-200 bg-white">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Client</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Quote Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Price</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Jobber</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredQuotes.map((quote, index) => (
                  <tr
                    key={`${quote.createdAt}-${index}`}
                    className="cursor-pointer transition-colors hover:bg-zinc-50"
                    onClick={() => openQuoteDetail(quote.id)}>
                    <td className="px-5 py-3.5 text-sm font-semibold text-zinc-900">{quote.client}</td>
                    <td className="max-w-[400px] px-5 py-3.5">
                      <p className="line-clamp-1 text-sm font-medium text-zinc-900">{quote.title}</p>
                      {quote.quoteDescription ? (
                        <p className="line-clamp-1 text-xs text-zinc-500">{quote.quoteDescription}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-zinc-900">
                      {formatMoneyFromCents(quote.amountCents)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        quote.status === 'draft'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', quote.status === 'draft' ? 'bg-amber-400' : 'bg-emerald-500')} />
                        {quote.status === 'draft' ? 'Draft' : 'Approved'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {quote.jobberSyncStatus === 'synced' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Synced
                        </span>
                      ) : quote.jobberSyncStatus === 'failed' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />Failed
                        </span>
                      ) : jobberReadinessByQuoteId[quote.id]?.ready ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Ready
                        </span>
                      ) : quote.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />N/A
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-zinc-500">
                      {formatRelativeTime(quote.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    {selectedQuote || isLoadingQuoteDetail ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Quote Details</h2>
            <Button type="button" variant="outline" onClick={() => setSelectedQuote(null)} disabled={isLoadingQuoteDetail}>
              Close
            </Button>
          </div>
          {isLoadingQuoteDetail ? (
            <p className="text-sm text-zinc-500">Loading quote details...</p>
          ) : selectedQuote ? (
            <div className="space-y-3">
              {syncNotice ? (
                <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                  {syncNotice}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="text-sm text-zinc-700"><span className="font-semibold">Client:</span> {selectedQuote.client}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Status:</span> {selectedQuote.status}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Price:</span> {formatMoneyFromCents(selectedQuote.amountCents)}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Created:</span> {new Date(selectedQuote.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Jobber Sync</p>
                <p className="text-sm text-zinc-700">
                  {selectedQuote.jobberSyncStatus === 'synced'
                    ? `Synced${selectedQuote.jobberQuoteId ? ` (Quote ID: ${selectedQuote.jobberQuoteId})` : ''}`
                    : selectedQuote.jobberSyncStatus === 'failed'
                      ? `Failed${selectedQuote.jobberLastError ? `: ${selectedQuote.jobberLastError}` : ''}`
                      : selectedQuote.status === 'approved'
                        ? 'Pending'
                        : 'N/A'}
                </p>
                {selectedQuote.jobberSyncStatus === 'failed' &&
                String(selectedQuote.jobberLastError ?? '').toLowerCase().includes('property') ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Client exists in Jobber, but property resolution failed. Open that client in Jobber and confirm at least one property/service address exists.
                  </p>
                ) : null}
                {selectedQuote.jobberSyncStatus === 'failed' &&
                String(selectedQuote.jobberLastError ?? '').toLowerCase().includes('missing required fields for jobber sync') ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Required client/address/quote fields are missing. Update the quote or contact data first, then retry Jobber sync.
                  </p>
                ) : null}
                {jobberReadinessByQuoteId[selectedQuote.id] &&
                !jobberReadinessByQuoteId[selectedQuote.id].ready &&
                Array.isArray(jobberReadinessByQuoteId[selectedQuote.id].missingFields) &&
                jobberReadinessByQuoteId[selectedQuote.id].missingFields.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Missing for Jobber: {jobberReadinessByQuoteId[selectedQuote.id].missingFields.join(', ')}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Title</p>
                <p className="text-sm text-zinc-700">{selectedQuote.title || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Quote Description</p>
                <p className="text-sm text-zinc-700">{selectedQuote.quoteDescription || '-'}</p>
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold text-zinc-800">Line Items</p>
                {Array.isArray(selectedQuote.lineItems) && selectedQuote.lineItems.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Name</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {selectedQuote.lineItems.map((item, idx) => {
                          const lineLabel =
                            item.materialName || item.productOrServiceName || item.description || '-'
                          return (
                          <tr key={`${lineLabel}-${idx}`}>
                            <td className="px-3 py-2 text-sm text-zinc-800">{lineLabel}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{item.quantity}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{formatMoneyFromCents(item.unitPriceCents)}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{formatMoneyFromCents(item.totalPriceCents)}</td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No line items found.</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" onClick={() => handleContinueDraft(selectedQuote)}>
                  {selectedQuote.status === 'draft'
                    ? 'Continue This Draft in AI Assistant'
                    : 'Edit Again in AI Assistant'}
                </Button>
                {selectedQuote.status === 'approved' && selectedQuote.jobberSyncStatus !== 'synced' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleRetryJobberSync(selectedQuote.id)}
                    disabled={isRetryingJobberQuoteId === selectedQuote.id}>
                    {isRetryingJobberQuoteId === selectedQuote.id ? 'Retrying Jobber Sync...' : 'Retry Jobber Sync'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openDeleteQuoteModal(selectedQuote)}
                  disabled={isDeletingQuoteId === selectedQuote.id}>
                  {isDeletingQuoteId === selectedQuote.id
                    ? 'Deleting...'
                    : selectedQuote.status === 'approved'
                      ? 'Delete Approved Quote'
                      : 'Delete Draft'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    ) : null}
    {deleteQuoteTarget ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <h3 className="text-base font-semibold text-zinc-900">
            {deleteQuoteTarget.status === 'approved' ? 'Delete Approved Quote?' : 'Delete Draft Quote?'}
          </h3>
          <p className="mt-2 text-sm text-zinc-600">
            This will permanently remove{' '}
            <span className="font-medium text-zinc-800">
              {deleteQuoteTarget.title ||
                (deleteQuoteTarget.status === 'approved' ? 'this approved quote' : 'this draft quote')}
            </span>.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDeleteQuoteModal} disabled={Boolean(isDeletingQuoteId)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => handleDeleteQuote(deleteQuoteTarget.id)}
              disabled={Boolean(isDeletingQuoteId)}>
              {isDeletingQuoteId ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}

export default QuotesPage
