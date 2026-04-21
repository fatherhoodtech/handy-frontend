/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { X } from 'lucide-react'

const STATUS_CONFIG = {
  new:        { label: 'New',        dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50'   },
  contacted:  { label: 'Contacted',  dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  qualified:  { label: 'Qualified',  dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50'  },
  quoted:     { label: 'Quoted',     dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  won:        { label: 'Won',        dot: 'bg-emerald-500',text: 'text-emerald-700',bg: 'bg-emerald-50'},
  lost:       { label: 'Lost',       dot: 'bg-red-400',    text: 'text-red-700',    bg: 'bg-red-50'    },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] ?? STATUS_CONFIG.new
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function formatRequested(value) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    const today = new Date()
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    return isToday
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return value
  }
}

function formatFullDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function toText(value) {
  return String(value ?? '').trim()
}

function renderThumbtackField(label, value) {
  const text = toText(value)
  if (!text) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-800 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

function getInitials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

function avatarColor(name) {
  const code = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function buildQuoteSeed(item) {
  const parts = []
  if (item.title?.trim()) parts.push(`Request: ${item.title.trim()}`)
  if (item.companyName?.trim()) parts.push(`Company: ${item.companyName.trim()}`)
  const address = [item.addressLine1, item.city, item.state, item.postalCode].filter(Boolean).join(', ')
  if (address) parts.push(`Property: ${address}`)
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
  const [errorMessage, setErrorMessage] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  const loadRequests = useCallback(async () => {
    const result = await apiRequest('/api/sales/requests')
    setRequests(result.requests || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await loadRequests()
        if (!cancelled) setErrorMessage('')
      } catch (error) {
        if (!cancelled) setErrorMessage(error?.message || 'Failed to load requests')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadRequests])

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
      const matchesStatus =
        statusFilter === 'all' || item.status?.toLowerCase() === statusFilter
      return matchesSearch && matchesDate && matchesStatus
    })
  }, [sorted, search, dateFilter, statusFilter])

  const counts = useMemo(() => {
    const c = {}
    for (const r of requests) {
      const s = r.status?.toLowerCase() || 'new'
      c[s] = (c[s] || 0) + 1
    }
    return c
  }, [requests])

  async function handleContinueWithAI(item, event) {
    event?.stopPropagation()
    const seed = buildQuoteSeed(item)
    const jobberRequestId = String(item.jobberRequestId ?? '').trim()
    if (!jobberRequestId) {
      setErrorMessage('This request is missing Jobber request id, cannot continue with AI.')
      return
    }
    try {
      const continueResponse = await apiRequest(
        `/api/sales/requests/${encodeURIComponent(jobberRequestId)}/continue`,
        { method: 'POST' }
      )
      const created = Boolean(continueResponse?.created)
      const resumed = Boolean(continueResponse?.resumed)
      const quoteId = String(continueResponse?.quoteId ?? '')
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
                  address: [item.addressLine1, item.city, item.state, item.postalCode].filter(Boolean).join(', '),
                },
              }
            : { startNewChat: true }),
          jobberRequestSeed: seed,
          jobberRequestId,
          requestContinueMeta: { created, resumed, quoteId },
        },
      })
      setSelected(null)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to continue request draft in AI assistant')
    }
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        {/* <h1 className="text-2xl font-bold text-zinc-900">Requests</h1> */}
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overview</p>
          <div className="mt-2 space-y-1 text-sm">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) =>
              counts[key] ? (
                <div key={key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  <span className="text-zinc-700">{cfg.label} ({counts[key]})</span>
                </div>
              ) : null
            )}
            {Object.keys(counts).length === 0 && (
              <span className="text-zinc-400">No data</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">New requests</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{counts.new ?? 0}</p>
          <p className="text-xs text-zinc-400 mt-1">Total in pipeline</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Quoted</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{counts.quoted ?? 0}</p>
          <p className="text-xs text-zinc-400 mt-1">Awaiting decision</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Won</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{counts.won ?? 0}</p>
          <p className="text-xs text-zinc-400 mt-1">Converted to jobs</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status pill filters */}
          <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${statusFilter === 'all' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
              Status | All
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1">
            <button
              onClick={() => setDateFilter('all')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${dateFilter === 'all' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
              All dates
            </button>
            <button
              onClick={() => setDateFilter('7d')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${dateFilter === '7d' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
              7 days
            </button>
            <button
              onClick={() => setDateFilter('30d')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${dateFilter === '30d' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
              30 days
            </button>
          </div>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search requests..."
          className="w-56"
        />
      </div>

      {errorMessage && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <p className="text-sm font-medium text-zinc-700">
            All requests{' '}
            <span className="text-zinc-400">({filtered.length} results)</span>
          </p>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">Loading requests…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">
            No requests found. Run <code className="rounded bg-zinc-100 px-1">npm run jobber:requests:latest10</code> to pull from Jobber.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-100 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">AI quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="group cursor-pointer hover:bg-zinc-50"
                    onClick={() => setSelected(item)}>
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{item.name || '—'}</div>
                      {item.companyName ? (
                        <div className="text-xs text-zinc-400">{item.companyName}</div>
                      ) : null}
                    </td>
                    {/* Title */}
                    <td className="px-4 py-3 text-zinc-700 max-w-[180px] truncate">
                      {item.title || '—'}
                    </td>
                    {/* Property */}
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-[160px]">
                      {[item.city, item.state, item.postalCode].filter(Boolean).join(', ') || '—'}
                    </td>
                    {/* Contact */}
                    <td className="px-4 py-3">
                      {item.phone ? (
                        <div className="text-zinc-700">{item.phone}</div>
                      ) : null}
                      {item.email ? (
                        <div className="text-xs text-zinc-400">{item.email}</div>
                      ) : null}
                      {!item.phone && !item.email ? <span className="text-zinc-400">—</span> : null}
                    </td>
                    {/* Requested */}
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {formatRequested(item.createdAt)}
                    </td>
                    {/* AI action */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        className="whitespace-nowrap text-xs font-medium bg-sky-500 text-white hover:bg-sky-600 shadow-sm"
                        onClick={(e) => handleContinueWithAI(item, e)}>
                        Continue with AI
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => setSelected(null)}>
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true">

            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 px-5 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(selected.name)}`}>
                {getInitials(selected.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-zinc-900">{selected.name || 'Request'}</h2>
                {selected.companyName ? (
                  <p className="truncate text-xs text-zinc-500">{selected.companyName}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={selected.status} />
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
              {selected.title ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Title</p>
                  <p className="mt-0.5 text-zinc-800">{selected.title}</p>
                </div>
              ) : null}

              {(selected.phone || selected.email) ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Contact</p>
                  {selected.phone ? <p className="mt-0.5 text-zinc-800">{selected.phone}</p> : null}
                  {selected.email ? <p className="text-xs text-zinc-500">{selected.email}</p> : null}
                </div>
              ) : null}

              {(selected.addressLine1 || selected.city || selected.state || selected.postalCode) ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Address</p>
                  <p className="mt-0.5 text-zinc-800">
                    {[
                      selected.addressLine1,
                      [selected.city, selected.state, selected.postalCode].filter(Boolean).join(', '),
                    ].filter(Boolean).join(', ')}
                  </p>
                </div>
              ) : null}

              {selected.property ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Property</p>
                  <div className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-zinc-800">
                    <p>{selected.property.address || '—'}</p>
                    <p className="text-xs text-zinc-500">
                      {[selected.property.city, selected.property.province, selected.property.postalCode, selected.property.country].filter(Boolean).join(', ') || '—'}
                    </p>
                    {selected.property.id ? (
                      <p className="text-xs text-zinc-500">Property ID: {selected.property.id}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Requested</p>
                <p className="mt-0.5 text-zinc-800">{formatFullDate(selected.createdAt)}</p>
              </div>

              {(selected.updatedAt || selected.requestStatus || selected.source) ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Request metadata</p>
                  <div className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-zinc-800">
                    {selected.requestStatus ? <p>Status: {selected.requestStatus}</p> : null}
                    {selected.source ? <p>Source: {selected.source}</p> : null}
                    {selected.updatedAt ? <p>Updated: {formatFullDate(selected.updatedAt)}</p> : null}
                    {selected.arrivalWindow?.startAt || selected.arrivalWindow?.endAt ? (
                      <p>
                        Arrival window: {formatFullDate(selected.arrivalWindow?.startAt)} - {formatFullDate(selected.arrivalWindow?.endAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selected.salesperson?.name ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Salesperson</p>
                  <p className="mt-0.5 text-zinc-800">{selected.salesperson.name}</p>
                </div>
              ) : null}

              {selected.assessmentInstructions ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Assessment instructions</p>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-zinc-800">{selected.assessmentInstructions}</p>
                  </div>
                </div>
              ) : null}

              {selected.thumbtackDetails && typeof selected.thumbtackDetails === 'object' ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Thumbtack details</p>
                  <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                    {renderThumbtackField('Travel preferences', selected.thumbtackDetails?.requestDetails?.travelPreferences)}
                    {renderThumbtackField('Zip code', selected.thumbtackDetails?.requestDetails?.zipCode)}
                    {renderThumbtackField('Number of items', selected.thumbtackDetails?.requestDetails?.numberOfItems)}
                    {renderThumbtackField('Types of items', selected.thumbtackDetails?.requestDetails?.itemTypes)}
                    {renderThumbtackField(
                      'Instructions provided by client',
                      selected.thumbtackDetails?.requestDetails?.instructionsProvided
                    )}
                    {renderThumbtackField('Category', selected.thumbtackDetails?.requestDetails?.category)}
                    {renderThumbtackField('Scheduling', selected.thumbtackDetails?.requestDetails?.scheduling)}
                    {renderThumbtackField('Access code', selected.thumbtackDetails?.requestDetails?.accessCode)}
                    {renderThumbtackField(
                      'Customer availability',
                      selected.thumbtackDetails?.requestDetails?.customerAvailability
                    )}
                    {renderThumbtackField(
                      'Lead price',
                      selected.thumbtackDetails?.leadPrice != null ? `$${selected.thumbtackDetails.leadPrice}` : ''
                    )}
                    {selected.thumbtackDetails?.thumbtackConversationUrl ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Thumbtack conversation</p>
                        <a
                          href={selected.thumbtackDetails.thumbtackConversationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 underline underline-offset-2 hover:text-sky-700 break-all">
                          {selected.thumbtackDetails.thumbtackConversationUrl}
                        </a>
                      </div>
                    ) : null}
                    {Array.isArray(selected.thumbtackDetails?.customerImages) &&
                    selected.thumbtackDetails.customerImages.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Customer images</p>
                        <div className="space-y-1">
                          {selected.thumbtackDetails.customerImages.map((url, idx) => (
                            <a
                              key={`${url}-${idx}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-sky-600 underline underline-offset-2 hover:text-sky-700 break-all">
                              {url}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {Array.isArray(selected.thumbtackDetails?.customerAttachments) &&
                    selected.thumbtackDetails.customerAttachments.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Customer attachments</p>
                        <ul className="list-disc pl-5 text-sm text-zinc-800 space-y-1">
                          {selected.thumbtackDetails.customerAttachments.map((name, idx) => (
                            <li key={`${name}-${idx}`}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {Array.isArray(selected.lineItems) && selected.lineItems.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Line items</p>
                  <div className="space-y-2">
                    {selected.lineItems.map((item, idx) => (
                      <div key={`${item?.id || idx}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                        <p className="text-sm font-medium text-zinc-800">{item?.name || item?.materialName || 'Line item'}</p>
                        {item?.description ? <p className="text-xs text-zinc-500">{item.description}</p> : null}
                        <p className="text-xs text-zinc-500">
                          Qty: {item?.quantity ?? '—'}
                          {item?.unitPrice !== undefined ? ` | Unit: ${item.unitPrice}` : ''}
                          {item?.totalCost !== undefined ? ` | Total: ${item.totalCost}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(selected.notesList) && selected.notesList.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Notes</p>
                  <div className="space-y-2">
                    {selected.notesList.map((note, idx) => (
                      <div key={`${note?.id || idx}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                        <p className="whitespace-pre-wrap text-sm text-zinc-800">{note?.message || note?.content || '—'}</p>
                        {note?.createdAt ? <p className="mt-1 text-xs text-zinc-500">{formatFullDate(note.createdAt)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(selected.noteAttachments) && selected.noteAttachments.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Note attachments</p>
                  <div className="space-y-1">
                    {selected.noteAttachments.map((att, idx) => (
                      <div key={`${att?.id || idx}`} className="text-sm">
                        {att?.url ? (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 underline underline-offset-2 hover:text-sky-700">
                            {att?.fileName || att?.name || 'Attachment'}
                          </a>
                        ) : (
                          <span className="text-zinc-600">{att?.fileName || att?.name || 'Attachment'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.jobberWebUri ? (
                <a
                  href={selected.jobberWebUri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-600 underline underline-offset-2 hover:text-sky-700">
                  Open in Jobber ↗
                </a>
              ) : null}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-zinc-100 px-5 py-4">
              <Button
                type="button"
                className="w-full bg-sky-500 text-white hover:bg-sky-600"
                onClick={() => handleContinueWithAI(selected)}>
                Continue with AI
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default RequestsPage
