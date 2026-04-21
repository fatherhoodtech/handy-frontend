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

  const filteredCatalog = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase()
    if (!q) return catalogItems
    return catalogItems.filter((item) =>
      `${item.materials || ''} ${item.uom || ''}`.toLowerCase().includes(q)
    )
  }, [catalogItems, materialsSearch])

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
          <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4 sm:grid-cols-4">
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
            <Button type="button" onClick={createCatalogRow}>Add Material</Button>
          </div>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={materialsSearch}
              onChange={(e) => setMaterialsSearch(e.target.value)}
              placeholder="Search materials..."
              className="pl-8"
            />
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
                      <Button type="button" variant="outline" size="sm" onClick={() => toggleCatalogActive(item)}>
                        {item.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
