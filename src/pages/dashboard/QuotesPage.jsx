import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, CheckCircle, RefreshCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildLegacyQuoteContinueState, getLinkedJobberRequestId } from './quoteContinue'

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

function normalizeMissingFields(readiness) {
  const fields = Array.isArray(readiness?.missingFields) ? readiness.missingFields : []
  return fields.map((value) => String(value || '').trim()).filter(Boolean)
}

function contactMissingFieldsFromReadiness(readiness) {
  return normalizeMissingFields(readiness).filter((field) => field.startsWith('client.'))
}

function StatCard({ label, value, sub, icon: Icon, iconClass, borderClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'w-full rounded-xl border bg-white p-5 text-left',
        borderClass || 'border-zinc-200',
        onClick ? 'cursor-pointer transition-colors hover:bg-zinc-50' : 'cursor-default'
      )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{value}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
        </div>
        <span className={cn('rounded-lg p-2', iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
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
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'synced' ? quote.jobberSyncStatus === 'synced' : quote.status === statusFilter)
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

  function handleContinueDraft(quote) {
    const quoteId = String(quote?.id ?? '').trim()
    if (!quoteId) return
    const jobberRequestId = getLinkedJobberRequestId(quote)
    setError('')
    // Always open by quote id first; AI Assistant may use jobberRequestIdFallback once on linkage 422.
    navigate('/dashboard/ai-assistant', {
      state: buildLegacyQuoteContinueState(quoteId, { jobberRequestIdFallback: jobberRequestId || undefined }),
    })
  }

  function handleEditContactForQuote(quote) {
    navigate('/dashboard/contacts', {
      state: {
        openContactEdit: true,
        contactHint: {
          id: String(quote?.contactId ?? '').trim(),
          name: String(quote?.client ?? '').trim(),
          email: String(quote?.clientEmail ?? '').trim(),
          phone: String(quote?.clientPhone ?? '').trim(),
        },
        missingContactFields: contactMissingFieldsFromReadiness(jobberReadinessByQuoteId[quote?.id]),
      },
    })
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
        <StatCard
          label="Total quotes"
          value={isLoading ? '—' : quotes.length}
          sub="All time"
          icon={ClipboardList}
          iconClass="bg-zinc-100 text-zinc-600"
          borderClass="border-zinc-200"
          onClick={() => {
            setSearch('')
            setStatusFilter('all')
            setDateFilter('all')
          }}
        />
        <StatCard
          label="Drafts"
          value={isLoading ? '—' : draftCount}
          sub="In progress"
          icon={FileText}
          iconClass="bg-amber-50 text-amber-600"
          borderClass="border-amber-200"
          onClick={() => setStatusFilter('draft')}
        />
        <StatCard
          label="Approved"
          value={isLoading ? '—' : approvedCount}
          sub="Ready to sync"
          icon={CheckCircle}
          iconClass="bg-emerald-50 text-emerald-600"
          borderClass="border-emerald-200"
          onClick={() => setStatusFilter('approved')}
        />
        <StatCard
          label="Synced to Jobber"
          value={isLoading ? '—' : syncedCount}
          sub="Sent to Jobber"
          icon={RefreshCw}
          iconClass="bg-sky-50 text-sky-600"
          borderClass="border-sky-200"
          onClick={() => setStatusFilter('synced')}
        />
      </div>

      {/* Main card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-zinc-900">
              {hasActiveFilters ? 'Filtered quotes' : 'All quotes'}
            </h2>
            {!isLoading && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {filteredQuotes.length} {filteredQuotes.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-1">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search quotes..."
                  className="h-9 w-full rounded-lg border-zinc-200 pl-8 text-sm"
              />
            </div>
              <select
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-sky-400"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="synced">Synced to Jobber</option>
              </select>
            <select
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-sky-400"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}>
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
              {hasActiveFilters ? (
              <button
                type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter('all') }}>
                  Clear
              </button>
              ) : null}
            </div>
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
          <div>
            <div className="divide-y divide-zinc-100 md:hidden">
              {filteredQuotes.map((quote) => (
                <button
                  key={`${quote.createdAt}-${quote.id || quote.title}`}
                  type="button"
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                  onClick={() => openQuoteDetail(quote.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-zinc-900">{quote.client || '—'}</p>
                      <p className="truncate text-sm font-medium text-zinc-700">{quote.title || 'Untitled quote'}</p>
                    </div>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      quote.status === 'draft'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', quote.status === 'draft' ? 'bg-amber-400' : 'bg-emerald-500')} />
                      {quote.status === 'draft' ? 'Draft' : 'Approved'}
                    </span>
                  </div>
                  {quote.quoteDescription ? <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{quote.quoteDescription}</p> : null}
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-900">{formatMoneyFromCents(quote.amountCents)}</p>
                    <p className="text-sm text-zinc-500">{formatRelativeTime(quote.createdAt)}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
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
          </div>
        )}
      </div>
    {selectedQuote || isLoadingQuoteDetail ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-lg font-semibold text-zinc-900">Quote Details</h2>
            <Button
              type="button"
              variant="outline"
              className="h-8 w-8 p-0 text-zinc-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              aria-label="Close"
              title="Close"
              onClick={() => setSelectedQuote(null)}
              disabled={isLoadingQuoteDetail}>
              <X className="h-4 w-4" />
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Quote title</p>
                  <p className="mt-1 text-lg font-semibold leading-tight text-zinc-900">
                    {selectedQuote.title || 'Untitled quote'}
                  </p>
                  <p className="mt-2 break-words text-sm leading-relaxed text-zinc-600">
                    {selectedQuote.quoteDescription || '-'}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status</p>
                      <p className="mt-0.5 text-sm font-medium text-zinc-800">{selectedQuote.status}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Price</p>
                      <p className="mt-0.5 text-sm font-medium text-zinc-800">{formatMoneyFromCents(selectedQuote.amountCents)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">Created: {new Date(selectedQuote.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</p>
                  <div className="mt-1 rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-sm">
                    <p className="text-sm text-zinc-700"><span className="font-semibold">Name:</span> {selectedQuote.client || '-'}</p>
                    <p className="text-sm text-zinc-700"><span className="font-semibold">Phone:</span> {selectedQuote.clientPhone || '-'}</p>
                    <p className="text-sm text-zinc-700"><span className="font-semibold">Email:</span> {selectedQuote.clientEmail || '-'}</p>
                    <p className="text-sm text-zinc-700"><span className="font-semibold">Address:</span> {selectedQuote.clientAddress || '-'}</p>
                    {contactMissingFieldsFromReadiness(jobberReadinessByQuoteId[selectedQuote.id]).length > 0 ? (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
                        <p className="text-xs font-medium text-amber-800">
                          Missing contact fields for Jobber: {contactMissingFieldsFromReadiness(jobberReadinessByQuoteId[selectedQuote.id]).join(', ')}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 h-8 text-xs text-sky-600 hover:text-sky-700"
                          onClick={() => handleEditContactForQuote(selectedQuote)}>
                          Edit Contact
                        </Button>
                      </div>
                ) : null}
              </div>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Line items</p>
                  <p className="text-xs text-zinc-400">
                    {Array.isArray(selectedQuote.lineItems) ? selectedQuote.lineItems.length : 0} item(s)
                  </p>
              </div>
                {Array.isArray(selectedQuote.lineItems) && selectedQuote.lineItems.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
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
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openDeleteQuoteModal(selectedQuote)}
                  disabled={isDeletingQuoteId === selectedQuote.id}>
                  {isDeletingQuoteId === selectedQuote.id
                    ? 'Deleting...'
                    : 'Delete Quote'}
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {(() => {
                    const readiness = jobberReadinessByQuoteId[selectedQuote.id]
                    const missingFields = normalizeMissingFields(readiness)
                    const isSynced = selectedQuote.jobberSyncStatus === 'synced'
                    const isReady = readiness?.ready === true
                    const isBusy = isRetryingJobberQuoteId === selectedQuote.id
                    const isDisabled = isSynced || !isReady || isBusy
                    const disabledReason = isSynced
                      ? 'Already sent to Jobber'
                      : !isReady && missingFields.length > 0
                        ? `Missing required fields: ${missingFields.join(', ')}`
                        : !isReady
                          ? 'Quote is not ready for Jobber sync'
                          : ''
                    return (
                      <span title={isDisabled ? disabledReason : 'Send to Jobber'}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleRetryJobberSync(selectedQuote.id)}
                          disabled={isDisabled}
                          aria-label={isDisabled ? `Send to Jobber disabled: ${disabledReason}` : 'Send to Jobber'}>
                          {isBusy ? 'Sending to Jobber...' : 'Send to Jobber'}
                        </Button>
                      </span>
                    )
                  })()}
                  <Button type="button" onClick={() => handleContinueDraft(selectedQuote)}>
                    {selectedQuote.status === 'draft'
                      ? 'Continue in AI'
                      : 'Edit in AI'}
                  </Button>
                </div>
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
