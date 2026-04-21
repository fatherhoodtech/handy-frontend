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

export default function MaterialsCatalogPage() {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [catalogItems, setCatalogItems] = useState([])
  const [catalogForm, setCatalogForm] = useState({ materials: '', uom: '', priceDollars: '' })
  const [materialsSearch, setMaterialsSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [uomFilter, setUomFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const filteredCatalog = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase()
    const filtered = catalogItems.filter((item) => {
      const matchesSearch = q.length === 0 || `${item.materials || ''} ${item.uom || ''}`.toLowerCase().includes(q)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.active) ||
        (statusFilter === 'inactive' && !item.active)
      const matchesUom = uomFilter === 'all' || String(item.uom || '').toLowerCase() === uomFilter
      return matchesSearch && matchesStatus && matchesUom
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortBy === 'name-asc') return String(a.materials || '').localeCompare(String(b.materials || ''))
      if (sortBy === 'name-desc') return String(b.materials || '').localeCompare(String(a.materials || ''))
      if (sortBy === 'price-asc') return Number(a.price_cents || 0) - Number(b.price_cents || 0)
      if (sortBy === 'price-desc') return Number(b.price_cents || 0) - Number(a.price_cents || 0)
      if (sortBy === 'uom-asc') return String(a.uom || '').localeCompare(String(b.uom || ''))
      if (sortBy === 'uom-desc') return String(b.uom || '').localeCompare(String(a.uom || ''))
      return 0
    })
    return sorted
  }, [catalogItems, materialsSearch, statusFilter, uomFilter, sortBy])

  const uomOptions = useMemo(() => {
    const set = new Set(catalogItems.map((i) => String(i.uom || '').trim().toLowerCase()).filter(Boolean))
    return Array.from(set).sort()
  }, [catalogItems])

  function clearMessages() {
    setError('')
    setNotice('')
  }

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      try {
        setIsLoading(true)
        const catalogRes = await apiRequest('/api/sales/settings/materials-catalog')
        if (cancelled) return
        setCatalogItems(Array.isArray(catalogRes?.items) ? catalogRes.items : [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load materials catalog')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  async function createCatalogRow() {
    try {
      clearMessages()
      const response = await apiRequest('/api/sales/settings/materials-catalog', {
        method: 'POST',
        body: JSON.stringify({
          materials: catalogForm.materials,
          uom: catalogForm.uom,
          price_cents: dollarsToCents(catalogForm.priceDollars),
        }),
      })
      const item = response?.item
      if (item) setCatalogItems((current) => [item, ...current])
      setCatalogForm({ materials: '', uom: '', priceDollars: '' })
      setNotice('Material added to catalog.')
    } catch (err) {
      setError(err?.message || 'Failed to create catalog row')
    }
  }

  async function toggleCatalogActive(item) {
    try {
      clearMessages()
      const response = await apiRequest(`/api/sales/settings/materials-catalog/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      })
      const next = response?.item
      if (next) setCatalogItems((current) => current.map((row) => (row.id === next.id ? next : row)))
      setNotice('Catalog item updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update catalog item')
    }
  }

  async function updateCatalogItem() {
    if (!editingItem) return
    try {
      clearMessages()
      const response = await apiRequest(`/api/sales/settings/materials-catalog/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          materials: editingItem.materials,
          uom: editingItem.uom,
          price_cents: dollarsToCents(editingItem.priceDollars),
          active: editingItem.active,
        }),
      })
      const next = response?.item
      if (next) setCatalogItems((current) => current.map((row) => (row.id === next.id ? next : row)))
      setEditingItem(null)
      setNotice('Catalog item updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update catalog item')
    }
  }

  function openUpdateModal(item) {
    setEditingItem({
      id: item.id,
      materials: item.materials,
      uom: item.uom,
      priceDollars: centsToDollars(item.price_cents),
      active: item.active,
    })
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
        title="Materials Catalog"
        description="Manage the list of materials and their unit prices used in quote line items."
      />

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading materials catalog...</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={materialsSearch}
                onChange={(e) => setMaterialsSearch(e.target.value)}
                placeholder="Smart search materials..."
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
              value={uomFilter}
              onChange={(e) => setUomFilter(e.target.value)}>
              <option value="all">All UOM</option>
              {uomOptions.map((uom) => (
                <option key={uom} value={uom}>{uom}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}>
              <option value="name-asc">Sort: Name A-Z</option>
              <option value="name-desc">Sort: Name Z-A</option>
              <option value="price-asc">Sort: Price Low-High</option>
              <option value="price-desc">Sort: Price High-Low</option>
              <option value="uom-asc">Sort: UOM A-Z</option>
              <option value="uom-desc">Sort: UOM Z-A</option>
            </select>
            </div>
            <Button type="button" className="bg-zinc-900 text-white hover:bg-zinc-800" onClick={() => setShowCreate(true)}>
              Create material
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="min-w-full">
              <thead className="border-b border-zinc-200 bg-white">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Material</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">UOM</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Price</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-zinc-400">
                      {catalogItems.length === 0 ? 'No materials yet. Add one above.' : 'No results match your search.'}
                    </td>
                  </tr>
                ) : filteredCatalog.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 text-sm font-medium text-zinc-900">{item.materials}</td>
                    <td className="px-5 py-3 text-sm text-zinc-600">{item.uom}</td>
                    <td className="px-5 py-3 text-sm font-medium text-zinc-900">${centsToDollars(item.price_cents)}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        item.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', item.active ? 'bg-emerald-500' : 'bg-zinc-300')} />
                        {item.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex min-w-[190px] justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" className="w-24" onClick={() => openUpdateModal(item)}>
                          Update
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="w-24" onClick={() => toggleCatalogActive(item)}>
                          {item.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showCreate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setShowCreate(false)}>
              <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">Create material</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Material name"
                    value={catalogForm.materials}
                    onChange={(e) => setCatalogForm((c) => ({ ...c, materials: e.target.value }))}
                  />
                  <Input
                    placeholder="UOM (each, ft, hr)"
                    value={catalogForm.uom}
                    onChange={(e) => setCatalogForm((c) => ({ ...c, uom: e.target.value }))}
                  />
                  <Input
                    placeholder="Price ($)"
                    value={catalogForm.priceDollars}
                    onChange={(e) => setCatalogForm((c) => ({ ...c, priceDollars: e.target.value }))}
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      await createCatalogRow()
                      setShowCreate(false)
                    }}>
                    Create
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {editingItem ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setEditingItem(null)}>
              <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">Update material</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Input
                    placeholder="Material name"
                    value={editingItem.materials}
                    onChange={(e) => setEditingItem((p) => ({ ...p, materials: e.target.value }))}
                  />
                  <Input
                    placeholder="UOM"
                    value={editingItem.uom}
                    onChange={(e) => setEditingItem((p) => ({ ...p, uom: e.target.value }))}
                  />
                  <Input
                    placeholder="Price ($)"
                    value={editingItem.priceDollars}
                    onChange={(e) => setEditingItem((p) => ({ ...p, priceDollars: e.target.value }))}
                  />
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800"
                    value={editingItem.active ? 'active' : 'inactive'}
                    onChange={(e) => setEditingItem((p) => ({ ...p, active: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      await updateCatalogItem()
                    }}>
                    Save
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
