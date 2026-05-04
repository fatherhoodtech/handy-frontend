import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { centsToDollars, dollarsToCents } from '@/lib/pricingMoney'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'

function SectionHeader({ title, description }) {
  return (
    <div className="mb-5 border-b border-zinc-100 pb-4">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
    </div>
  )
}

export default function LaborPricingPage() {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [laborItems, setLaborItems] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expertiseFilter, setExpertiseFilter] = useState('all')
  const [sortBy, setSortBy] = useState('trade-asc')
  const [showCreate, setShowCreate] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [selectedRow, setSelectedRow] = useState(null)
  const [laborForm, setLaborForm] = useState({ trade: '', expertiseLevel: 'standard', hourlyRateDollars: '' })

  const filteredLabor = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = laborItems.filter((row) => {
      const matchesSearch = q.length === 0 || `${row.trade} ${row.expertiseLevel}`.toLowerCase().includes(q)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && row.active) ||
        (statusFilter === 'inactive' && !row.active)
      const matchesExpertise = expertiseFilter === 'all' || row.expertiseLevel === expertiseFilter
      return matchesSearch && matchesStatus && matchesExpertise
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortBy === 'trade-asc') return String(a.trade || '').localeCompare(String(b.trade || ''))
      if (sortBy === 'trade-desc') return String(b.trade || '').localeCompare(String(a.trade || ''))
      if (sortBy === 'rate-asc') return Number(a.hourlyRateCents || 0) - Number(b.hourlyRateCents || 0)
      if (sortBy === 'rate-desc') return Number(b.hourlyRateCents || 0) - Number(a.hourlyRateCents || 0)
      return 0
    })
    return sorted
  }, [laborItems, search, statusFilter, expertiseFilter, sortBy])

  function clearMessages() {
    setError('')
    setNotice('')
  }

  useEffect(() => {
    let cancelled = false
    async function loadLabor() {
      try {
        setIsLoading(true)
        const laborRes = await apiRequest('/api/sales/settings/labor-pricing')
        if (cancelled) return
        setLaborItems(Array.isArray(laborRes?.items) ? laborRes.items : [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load labor pricing')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadLabor()
    return () => {
      cancelled = true
    }
  }, [])

  async function createLaborRow() {
    try {
      clearMessages()
      const response = await apiRequest('/api/sales/settings/labor-pricing', {
        method: 'POST',
        body: JSON.stringify({
          trade: laborForm.trade,
          expertiseLevel: laborForm.expertiseLevel,
          hourlyRateCents: dollarsToCents(laborForm.hourlyRateDollars),
        }),
      })
      const item = response?.item
      if (item) {
        setLaborItems((current) => {
          const next = current.filter(
            (row) => !(row.trade === item.trade && row.expertiseLevel === item.expertiseLevel)
          )
          return [...next, item].sort((a, b) =>
            `${a.trade}${a.expertiseLevel}`.localeCompare(`${b.trade}${b.expertiseLevel}`)
          )
        })
      }
      setLaborForm({ trade: '', expertiseLevel: 'standard', hourlyRateDollars: '' })
      setNotice('Labor pricing saved.')
    } catch (err) {
      setError(err?.message || 'Failed to save labor pricing')
    }
  }

  async function updateLaborRow() {
    if (!editingRow) return
    try {
      clearMessages()
      const response = await apiRequest(`/api/sales/settings/labor-pricing/${editingRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          trade: editingRow.trade,
          expertiseLevel: editingRow.expertiseLevel,
          hourlyRateCents: dollarsToCents(editingRow.hourlyRateDollars),
          active: editingRow.active,
        }),
      })
      const item = response?.item
      if (item) setLaborItems((current) => current.map((e) => (e.id === item.id ? item : e)))
      setEditingRow(null)
      setNotice('Labor row updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update labor row')
    }
  }

  function openUpdateModal(row) {
    setEditingRow({
      id: row.id,
      trade: row.trade,
      expertiseLevel: row.expertiseLevel,
      hourlyRateDollars: centsToDollars(row.hourlyRateCents),
      active: row.active,
    })
  }

  function openDetailModal(row) {
    setSelectedRow(row)
  }

  async function deleteLaborRow(id) {
    try {
      clearMessages()
      await apiRequest(`/api/sales/settings/labor-pricing/${id}`, { method: 'DELETE' })
      setLaborItems((current) => current.filter((row) => row.id !== id))
      setSelectedRow(null)
      setNotice('Labor row deleted.')
    } catch (err) {
      setError(err?.message || 'Failed to delete labor row')
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <SectionHeader
        title="Labor Pricing"
        description="Define hourly rates per trade and expertise level used in quote calculations."
      />

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading labor pricing...</p>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 [overflow:clip]">
            {/* Sticky banner: toolbar + column headers */}
            <div className="sticky top-0 z-20 bg-white">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Smart search by trade/expertise..."
                      className="pl-8"
                    />
                  </div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={expertiseFilter}
                    onChange={(e) => setExpertiseFilter(e.target.value)}>
                    <option value="all">All expertise</option>
                    <option value="standard">Standard</option>
                    <option value="expert">Expert</option>
                  </select>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}>
                    <option value="trade-asc">Sort: Trade A-Z</option>
                    <option value="trade-desc">Sort: Trade Z-A</option>
                    <option value="rate-asc">Sort: Rate Low-High</option>
                    <option value="rate-desc">Sort: Rate High-Low</option>
                  </select>
                </div>
                <Button type="button" className="bg-[#262742] text-white hover:bg-[#1a1b30]" onClick={() => setShowCreate(true)}>
                  Create labor rate
                </Button>
              </div>
              {/* Column headers (outside <table> so they stay sticky with the toolbar) */}
              <div className="hidden border-b border-zinc-200 md:block">
                <table className="min-w-full table-fixed">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[25%]" />
                    <col className="w-[25%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Trade</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Expertise</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Hourly Rate</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
            <div className="divide-y divide-zinc-100 md:hidden">
              {filteredLabor.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-400">
                  {laborItems.length === 0 ? 'No labor rates yet. Create one above.' : 'No rows match current filters.'}
                </div>
              ) : filteredLabor.map((row) => (
                <button key={row.id} type="button" className="w-full px-4 py-3 text-left hover:bg-zinc-50" onClick={() => openDetailModal(row)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{row.trade}</p>
                      <p className="text-sm capitalize text-zinc-600">{row.expertiseLevel}</p>
                    </div>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      row.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', row.active ? 'bg-emerald-500' : 'bg-zinc-300')} />
                      {row.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-900">${centsToDollars(row.hourlyRateCents)}/hr</p>
                </button>
              ))}
            </div>

            <div className="hidden md:block">
              <table className="min-w-full table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[25%]" />
                  <col className="w-[25%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <tbody className="divide-y divide-zinc-100">
                  {filteredLabor.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-zinc-400">
                        {laborItems.length === 0 ? 'No labor rates yet. Create one above.' : 'No rows match current filters.'}
                      </td>
                    </tr>
                  ) : filteredLabor.map((row) => (
                    <tr key={row.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => openDetailModal(row)}>
                      <td className="px-5 py-3 text-sm font-medium text-zinc-900">{row.trade}</td>
                      <td className="px-5 py-3 text-sm text-zinc-600 capitalize">{row.expertiseLevel}</td>
                      <td className="px-5 py-3 text-sm font-medium text-zinc-900">${centsToDollars(row.hourlyRateCents)}/hr</td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          row.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                        )}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', row.active ? 'bg-emerald-500' : 'bg-zinc-300')} />
                          {row.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {showCreate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setShowCreate(false)}>
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">Create labor rate</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Trade (e.g. plumbing)"
                    value={laborForm.trade}
                    onChange={(e) => setLaborForm((c) => ({ ...c, trade: e.target.value }))}
                  />
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#262742]"
                    value={laborForm.expertiseLevel}
                    onChange={(e) => setLaborForm((c) => ({ ...c, expertiseLevel: e.target.value }))}>
                    <option value="standard">Standard</option>
                    <option value="expert">Expert</option>
                  </select>
                  <Input
                    placeholder="Hourly rate ($)"
                    value={laborForm.hourlyRateDollars}
                    onChange={(e) => setLaborForm((c) => ({ ...c, hourlyRateDollars: e.target.value }))}
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button
                    type="button"
                    className="bg-[#262742] text-white hover:bg-[#1a1b30]"
                    onClick={async () => {
                      await createLaborRow()
                      setShowCreate(false)
                    }}>
                    Create
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {editingRow ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setEditingRow(null)}>
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">Update labor rate</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Input
                    placeholder="Trade"
                    value={editingRow.trade}
                    onChange={(e) => setEditingRow((p) => ({ ...p, trade: e.target.value }))}
                  />
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={editingRow.expertiseLevel}
                    onChange={(e) => setEditingRow((p) => ({ ...p, expertiseLevel: e.target.value }))}>
                    <option value="standard">Standard</option>
                    <option value="expert">Expert</option>
                  </select>
                  <Input
                    placeholder="Hourly rate ($)"
                    value={editingRow.hourlyRateDollars}
                    onChange={(e) => setEditingRow((p) => ({ ...p, hourlyRateDollars: e.target.value }))}
                  />
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={editingRow.active ? 'active' : 'inactive'}
                    onChange={(e) => setEditingRow((p) => ({ ...p, active: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button>
                  <Button
                    type="button"
                    className="bg-[#262742] text-white hover:bg-[#1a1b30]"
                    onClick={async () => {
                      await updateLaborRow()
                    }}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {selectedRow ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setSelectedRow(null)}>
              <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">{selectedRow.trade}</h3>
                <p className="mt-1 text-sm capitalize text-zinc-600">{selectedRow.expertiseLevel}</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">${centsToDollars(selectedRow.hourlyRateCents)}/hr</p>
                <p className="mt-2 text-sm text-zinc-600">Status: {selectedRow.active ? 'Active' : 'Inactive'}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#262742]/30 text-[#1a1b30] hover:border-[#262742] hover:bg-[#262742]/10"
                    onClick={() => {
                      openUpdateModal(selectedRow)
                      setSelectedRow(null)
                    }}>
                    Update
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => deleteLaborRow(selectedRow.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
