import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function buildQuoteSeed(item) {
  const parts = []
  if (item.title?.trim()) parts.push(`Request: ${item.title.trim()}`)
  if (item.companyName?.trim()) parts.push(`Company: ${item.companyName.trim()}`)
  if (item.notes?.trim()) parts.push(item.notes.trim())
  if (item.jobberWebUri?.trim()) parts.push(`Open in Jobber: ${item.jobberWebUri.trim()}`)
  return {
    title: item.title?.trim() || 'Quote from Jobber request',
    quoteDescription: parts.join('\n\n'),
  }
}

function RequestsPage() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')

  const loadRequests = useCallback(async () => {
    const result = await apiRequest('/api/sales/requests')
    setRequests(result.requests || [])
  }, [])

  const sorted = useMemo(
    () => [...requests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [requests]
  )

  const filtered = useMemo(() => {
    const now = Date.now()
    return sorted.filter((item) => {
      const hay = `${item.name || ''} ${item.email || ''} ${item.phone || ''} ${item.title || ''} ${item.notes || ''} ${item.companyName || ''}`.toLowerCase()
      const matchesSearch = search.trim() === '' || hay.includes(search.trim().toLowerCase())
      const createdAtMs = new Date(item.createdAt).getTime()
      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === '7d' && now - createdAtMs <= 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === '30d' && now - createdAtMs <= 30 * 24 * 60 * 60 * 1000)
      return matchesSearch && matchesDate
    })
  }, [sorted, search, dateFilter])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await loadRequests()
        if (!cancelled) setErrorMessage('')
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Failed to load requests')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [loadRequests])

  async function handleSyncFromJobber() {
    setIsSyncing(true)
    setSyncMessage('')
    setErrorMessage('')
    try {
      const result = await apiRequest('/api/sales/requests/sync', { method: 'POST' })
      if (result.ok) {
        setSyncMessage(`Synced ${result.upserted ?? 0} request(s) from Jobber.`)
        await loadRequests()
      } else {
        setErrorMessage((result.errors && result.errors[0]) || result.message || 'Sync failed')
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to sync from Jobber')
    } finally {
      setIsSyncing(false)
    }
  }

  function handleStartQuote(item) {
    const seed = buildQuoteSeed(item)
    const hasLead = Boolean(item.leadId?.trim())
    navigate('/dashboard/ai-assistant', {
      state: {
        ...(hasLead
          ? {
              contactId: item.leadId,
              startNewChat: true,
              handoffClient: {
                fullName: item.name || '',
                phone: item.phone || '',
                email: item.email || '',
                address: [item.city, item.state, item.postalCode].filter(Boolean).join(', '),
              },
            }
          : { startNewChat: true }),
        jobberRequestSeed: seed,
      },
    })
    setSelected(null)
  }

  return (
    <>
      <Card className="border-zinc-200 bg-white">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-600">
              Jobber Requests — pull from Jobber, then convert to quotes with AI.
            </p>
            <Button type="button" variant="outline" onClick={handleSyncFromJobber} disabled={isSyncing}>
              {isSyncing ? 'Syncing…' : 'Sync from Jobber'}
            </Button>
          </div>
          {syncMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {syncMessage}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email, title, notes..."
            />
            <div />
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
          {isLoading && <p className="text-sm text-zinc-500">Loading requests...</p>}
          {!isLoading && filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No requests yet. Connect Jobber OAuth, then use <strong>Sync from Jobber</strong>.
            </p>
          ) : null}

          {!isLoading && filtered.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Contact</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer hover:bg-zinc-50"
                      onClick={() => setSelected(item)}>
                      <td className="px-3 py-2 text-zinc-900">
                        <div className="font-medium">{item.name || '—'}</div>
                        <div className="text-xs text-zinc-500">{item.phone || item.email || '—'}</div>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-zinc-800">{item.title || '—'}</td>
                      <td className="px-3 py-2 text-zinc-700">{item.status}</td>
                      <td className="px-3 py-2 text-zinc-600">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Request details</h2>
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-zinc-700">
                <span className="font-semibold">Name:</span> {selected.name || '—'}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Company:</span> {selected.companyName || '—'}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Email:</span> {selected.email || '—'}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Phone:</span> {selected.phone || '—'}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Title:</span> {selected.title || '—'}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Status:</span> {selected.status}
              </p>
              <p className="text-zinc-700">
                <span className="font-semibold">Created:</span> {formatDate(selected.createdAt)}
              </p>
              {selected.jobberWebUri ? (
                <p className="text-zinc-700">
                  <span className="font-semibold">Jobber:</span>{' '}
                  <a
                    href={selected.jobberWebUri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline">
                    Open in Jobber
                  </a>
                </p>
              ) : null}
              <div>
                <p className="font-semibold text-zinc-700">Request / assessment</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-800">{selected.notes || '—'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Button type="button" onClick={() => handleStartQuote(selected)}>
                Start quote in AI Assistant
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default RequestsPage
