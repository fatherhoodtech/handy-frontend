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
  const [selectedItem, setSelectedItem] = useState(null)

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

  function openDetailModal(item) {
    setSelectedItem(item)
  }

  async function deleteCatalogItem(id) {
    try {
      clearMessages()
      await apiRequest(`/api/sales/settings/materials-catalog/${id}`, { method: 'DELETE' })
      setCatalogItems((current) => current.filter((row) => row.id !== id))
      setSelectedItem(null)
      setNotice('Catalog item deleted.')
    } catch (err) {
      setError(err?.message || 'Failed to delete catalog item')
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
        title="Materials Catalog"
        description="Manage the list of materials and their unit prices used in quote line items."
      />

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading materials catalog...</p>
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
                <Button type="button" className="bg-sky-500 text-white hover:bg-sky-600" onClick={() => setShowCreate(true)}>
                  Create material
                </Button>
              </div>
              {/* Column headers (outside <table> so they stay sticky with the toolbar) */}
              <div className="hidden border-b border-zinc-200 md:block">
                <table className="min-w-full table-fixed">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Material</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">UOM</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Price</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
            <div className="divide-y divide-zinc-100 md:hidden">
              {filteredCatalog.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-400">
                  {catalogItems.length === 0 ? 'No materials yet. Add one above.' : 'No results match your search.'}
                </div>
              ) : filteredCatalog.map((item) => (
                <button key={item.id} type="button" className="w-full px-4 py-3 text-left hover:bg-zinc-50" onClick={() => openDetailModal(item)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{item.materials}</p>
                      <p className="text-sm text-zinc-600">{item.uom}</p>
                    </div>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      item.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', item.active ? 'bg-emerald-500' : 'bg-zinc-300')} />
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-900">${centsToDollars(item.price_cents)}</p>
                </button>
              ))}
            </div>

            <div className="hidden md:block">
              <table className="min-w-full table-fixed">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <tbody className="divide-y divide-zinc-100">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-zinc-400">
                        {catalogItems.length === 0 ? 'No materials yet. Add one above.' : 'No results match your search.'}
                      </td>
                    </tr>
                  ) : filteredCatalog.map((item) => (
                    <tr key={item.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => openDetailModal(item)}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {showCreate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setShowCreate(false)}>
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
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
                    className="bg-sky-500 text-white hover:bg-sky-600"
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
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
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
                    className="bg-sky-500 text-white hover:bg-sky-600"
                    onClick={async () => {
                      await updateCatalogItem()
                    }}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {selectedItem ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setSelectedItem(null)}>
              <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-zinc-900">{selectedItem.materials}</h3>
                <p className="mt-1 text-sm text-zinc-600">UOM: {selectedItem.uom || '—'}</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">${centsToDollars(selectedItem.price_cents)}</p>
                <p className="mt-2 text-sm text-zinc-600">Status: {selectedItem.active ? 'Active' : 'Inactive'}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-sky-200 text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                    onClick={() => {
                      openUpdateModal(selectedItem)
                      setSelectedItem(null)
                    }}>
                    Update
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => deleteCatalogItem(selectedItem.id)}>
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
