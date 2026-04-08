import { Card, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

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
  const [deleteQuoteTarget, setDeleteQuoteTarget] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadQuotes() {
      try {
        setIsLoading(true)
        const response = await apiRequest('/api/sales/quotes')
        if (cancelled) return
        setQuotes(Array.isArray(response?.quotes) ? response.quotes : [])
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
      setIsLoadingQuoteDetail(true)
      const response = await apiRequest(`/api/sales/quotes/${encodeURIComponent(quoteId)}`)
      setSelectedQuote(response?.quote ?? null)
    } catch (err) {
      setError(err?.message || 'Failed to load quote details')
    } finally {
      setIsLoadingQuoteDetail(false)
    }
  }

  function handleContinueDraft(quoteId) {
    navigate('/dashboard/ai-assistant', { state: { resumeQuoteId: quoteId } })
  }

  function openDeleteQuoteModal(quote) {
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

  return (
    <>
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client or description..."
          />
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
          </select>
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">All dates</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
        {isLoading ? <p className="text-sm text-zinc-500">Loading quotes...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!isLoading && !error && filteredQuotes.length === 0 ? (
          <p className="text-sm text-zinc-500">No quotes yet. Save a draft from AI Assistant to get started.</p>
        ) : null}
        {!isLoading && !error && filteredQuotes.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Quote Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {filteredQuotes.map((quote, index) => (
                  <tr key={`${quote.createdAt}-${index}`} className="hover:bg-zinc-50">
                    <td
                      className="cursor-pointer px-4 py-3 text-sm text-zinc-800"
                      onClick={() => openQuoteDetail(quote.id)}>
                      {quote.client}
                    </td>
                    <td
                      className="max-w-[520px] cursor-pointer px-4 py-3 text-sm text-zinc-800"
                      onClick={() => openQuoteDetail(quote.id)}>
                      <p className="line-clamp-1 font-medium">{quote.title}</p>
                      {quote.quoteDescription ? (
                        <p className="line-clamp-1 text-xs text-zinc-500">{quote.quoteDescription}</p>
                      ) : null}
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-900"
                      onClick={() => openQuoteDetail(quote.id)}>
                      {formatMoneyFromCents(quote.amountCents)}
                    </td>
                    <td className="cursor-pointer px-4 py-3" onClick={() => openQuoteDetail(quote.id)}>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          quote.status === 'draft'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                        {quote.status === 'draft' ? 'Draft' : 'Approved'}
                      </span>
                    </td>
                    <td
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-sm text-zinc-600"
                      onClick={() => openQuoteDetail(quote.id)}>
                      {formatRelativeTime(quote.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="text-sm text-zinc-700"><span className="font-semibold">Client:</span> {selectedQuote.client}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Status:</span> {selectedQuote.status}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Price:</span> {formatMoneyFromCents(selectedQuote.amountCents)}</p>
                <p className="text-sm text-zinc-700"><span className="font-semibold">Created:</span> {new Date(selectedQuote.createdAt).toLocaleString()}</p>
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
                        {selectedQuote.lineItems.map((item, idx) => (
                          <tr key={`${item.productOrServiceName}-${idx}`}>
                            <td className="px-3 py-2 text-sm text-zinc-800">{item.productOrServiceName || '-'}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{item.quantity}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{formatMoneyFromCents(item.unitPriceCents)}</td>
                            <td className="px-3 py-2 text-sm text-zinc-800">{formatMoneyFromCents(item.totalPriceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No line items found.</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" onClick={() => handleContinueDraft(selectedQuote.id)}>
                  {selectedQuote.status === 'draft'
                    ? 'Continue This Draft in AI Assistant'
                    : 'Edit Again in AI Assistant'}
                </Button>
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
