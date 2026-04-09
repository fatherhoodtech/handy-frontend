import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost']

function formatStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function OpportunityPage() {
  const navigate = useNavigate()
  const [opportunities, setOpportunities] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  const sorted = useMemo(
    () => [...opportunities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [opportunities]
  )
  const filtered = useMemo(() => {
    const now = Date.now()
    return sorted.filter((item) => {
      const hay = `${item.name || ''} ${item.email || ''} ${item.phone || ''} ${item.source || ''}`.toLowerCase()
      const matchesSearch = search.trim() === '' || hay.includes(search.trim().toLowerCase())
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const createdAtMs = new Date(item.createdAt).getTime()
      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === '7d' && now - createdAtMs <= 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === '30d' && now - createdAtMs <= 30 * 24 * 60 * 60 * 1000)
      return matchesSearch && matchesStatus && matchesDate
    })
  }, [sorted, search, statusFilter, dateFilter])

  useEffect(() => {
    let cancelled = false
    async function loadOpportunities() {
      try {
        const result = await apiRequest('/api/sales/opportunities')
        if (!cancelled) {
          setOpportunities(result.opportunities || [])
          setErrorMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Failed to load opportunities')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOpportunities()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleStatusChange(id, nextStatus) {
    setUpdatingId(id)
    try {
      const result = await apiRequest(`/api/sales/opportunities/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      const updated = result.opportunity
      setOpportunities((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to update status')
    } finally {
      setUpdatingId('')
    }
  }

  function handleCreateQuoteFromOpportunity(item) {
    navigate('/dashboard/ai-assistant', { state: { contactId: item.id, startNewChat: true } })
    setSelectedOpportunity(null)
  }

  return (
    <>
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, email, source..."
          />
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
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
        {errorMessage && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading && <p className="text-sm text-zinc-500">Loading opportunities...</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-zinc-500">No opportunities yet. Incoming external leads will appear here.</p>
        )}

        {!isLoading && filtered.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => setSelectedOpportunity(item)}>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900">{item.name || 'Unknown lead'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{item.phone || item.email || 'No phone or email'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{[item.city, item.state].filter(Boolean).join(', ') || 'No location'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{item.source}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{formatStatus(item.status)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
    {selectedOpportunity ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Opportunity Details</h2>
            <Button type="button" variant="outline" onClick={() => setSelectedOpportunity(null)}>
              Close
            </Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p className="text-sm text-zinc-700"><span className="font-semibold">Name:</span> {selectedOpportunity.name || 'Unknown lead'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Source:</span> {selectedOpportunity.source}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Email:</span> {selectedOpportunity.email || '-'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Phone:</span> {selectedOpportunity.phone || '-'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Location:</span> {[selectedOpportunity.city, selectedOpportunity.state].filter(Boolean).join(', ') || '-'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Created:</span> {formatDate(selectedOpportunity.createdAt)}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <select
                className="h-10 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                value={selectedOpportunity.status}
                disabled={updatingId === selectedOpportunity.id}
                onChange={(event) =>
                  handleStatusChange(selectedOpportunity.id, event.target.value).then(() => {
                    setSelectedOpportunity((current) =>
                      current ? { ...current, status: event.target.value } : current
                    )
                  })
                }>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={() => setSelectedOpportunity(null)}>
                Open Contact
              </Button>
              <Button type="button" onClick={() => handleCreateQuoteFromOpportunity(selectedOpportunity)}>
                Create Quote
              </Button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}

export default OpportunityPage
