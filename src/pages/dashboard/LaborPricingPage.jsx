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

  async function toggleLaborActive(row) {
    try {
      clearMessages()
      const response = await apiRequest(`/api/sales/settings/labor-pricing/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !row.active }),
      })
      const item = response?.item
      if (item) setLaborItems((current) => current.map((e) => (e.id === item.id ? item : e)))
      setNotice('Labor pricing updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update labor row')
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
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
            <Button type="button" className="bg-zinc-900 text-white hover:bg-zinc-800" onClick={() => setShowCreate(true)}>
              Create labor rate
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="min-w-full">
              <thead className="border-b border-zinc-200 bg-white">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Trade</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Expertise</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Hourly Rate</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredLabor.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-zinc-400">
                      {laborItems.length === 0 ? 'No labor rates yet. Create one above.' : 'No rows match current filters.'}
                    </td>
                  </tr>
                ) : filteredLabor.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50">
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
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingRow({
                              id: row.id,
                              trade: row.trade,
                              expertiseLevel: row.expertiseLevel,
                              hourlyRateDollars: centsToDollars(row.hourlyRateCents),
                              active: row.active,
                            })
                          }>
                          Update
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => toggleLaborActive(row)}>
                          {row.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editingRow ? (
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4 sm:grid-cols-5">
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
              <div className="flex gap-2">
                <Button type="button" onClick={updateLaborRow}>Save</Button>
                <Button type="button" variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button>
              </div>
            </div>
          ) : null}
          {showCreate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setShowCreate(false)}>
              <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">Create labor rate</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Trade (e.g. plumbing)"
                    value={laborForm.trade}
                    onChange={(e) => setLaborForm((c) => ({ ...c, trade: e.target.value }))}
                  />
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-sky-400"
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
        </>
      )}
    </div>
  )
}
