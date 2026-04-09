import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'

const SETTINGS_TABS = ['quote-defaults', 'labor-pricing', 'materials-catalog']

function centsToDollars(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

function dollarsToCents(value) {
  const clean = String(value ?? '').trim().replace(/[^0-9.]/g, '')
  if (!clean) return 0
  const parsed = Number.parseFloat(clean)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS[0])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [quoteDefaults, setQuoteDefaults] = useState({
    defaultMarginPercent: 20,
    defaultTaxPercent: 0,
    defaultQuoteTerms: '',
  })
  const [laborItems, setLaborItems] = useState([])
  const [catalogItems, setCatalogItems] = useState([])
  const [laborForm, setLaborForm] = useState({ trade: '', expertiseLevel: 'standard', hourlyRateDollars: '' })
  const [catalogForm, setCatalogForm] = useState({ materials: '', uom: '', priceDollars: '' })
  const [materialsSearch, setMaterialsSearch] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)

  const filteredCatalog = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase()
    if (!q) return catalogItems
    return catalogItems.filter((item) =>
      `${item.materials || ''} ${item.uom || ''}`.toLowerCase().includes(q)
    )
  }, [catalogItems, materialsSearch])

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      try {
        setIsLoading(true)
        const [settingsRes, laborRes, catalogRes] = await Promise.all([
          apiRequest('/api/sales/settings'),
          apiRequest('/api/sales/settings/labor-pricing'),
          apiRequest('/api/sales/settings/materials-catalog'),
        ])
        if (cancelled) return
        if (settingsRes?.quoteDefaults) setQuoteDefaults(settingsRes.quoteDefaults)
        setLaborItems(Array.isArray(laborRes?.items) ? laborRes.items : [])
        setCatalogItems(Array.isArray(catalogRes?.items) ? catalogRes.items : [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load settings')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveQuoteDefaults() {
    try {
      setError('')
      setNotice('')
      setIsSaving(true)
      const response = await apiRequest('/api/sales/settings', {
        method: 'PATCH',
        body: JSON.stringify(quoteDefaults),
      })
      if (response?.quoteDefaults) setQuoteDefaults(response.quoteDefaults)
      setNotice('Quote defaults saved.')
    } catch (err) {
      setError(err?.message || 'Failed to save quote defaults')
    } finally {
      setIsSaving(false)
    }
  }

  async function createLaborRow() {
    try {
      setError('')
      setNotice('')
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
          return [...next, item].sort((a, b) => `${a.trade}${a.expertiseLevel}`.localeCompare(`${b.trade}${b.expertiseLevel}`))
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
      setError('')
      setNotice('')
      const response = await apiRequest(`/api/sales/settings/labor-pricing/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !row.active }),
      })
      const item = response?.item
      if (item) {
        setLaborItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)))
      }
      setNotice('Labor pricing updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update labor row')
    }
  }

  async function createCatalogRow() {
    try {
      setError('')
      setNotice('')
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
      setNotice('Material catalog row created.')
    } catch (err) {
      setError(err?.message || 'Failed to create catalog row')
    }
  }

  async function toggleCatalogActive(item) {
    try {
      setError('')
      setNotice('')
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

  async function handlePushToggle() {
    try {
      setError('')
      setNotice('')
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setError('Push notifications are not supported in this browser.')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      if (!pushEnabled) {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setError('Push notification permission was not granted.')
          return
        }
        let sub = await registration.pushManager.getSubscription()
        if (!sub) {
          sub = await registration.pushManager.subscribe({ userVisibleOnly: true })
        }
        const payload = sub.toJSON()
        await apiRequest('/api/sales/notifications/push-subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: payload.endpoint,
            p256dh: payload.keys?.p256dh || '',
            auth: payload.keys?.auth || '',
          }),
        })
        setPushEnabled(true)
        setNotice('Browser push notifications enabled.')
        return
      }
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await apiRequest('/api/sales/notifications/push-subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
      setNotice('Browser push notifications disabled.')
    } catch (err) {
      setError(err?.message || 'Failed to update browser push setting')
    }
  }

  return (
    <Card className="border-zinc-200 bg-white">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Configure quote defaults, labor pricing, materials catalog, and notifications.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={activeTab === 'quote-defaults' ? 'default' : 'outline'} onClick={() => setActiveTab('quote-defaults')}>Quote Defaults</Button>
          <Button type="button" variant={activeTab === 'labor-pricing' ? 'default' : 'outline'} onClick={() => setActiveTab('labor-pricing')}>Labor Pricing</Button>
          <Button type="button" variant={activeTab === 'materials-catalog' ? 'default' : 'outline'} onClick={() => setActiveTab('materials-catalog')}>Materials Catalog</Button>
        </div>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
        {isLoading ? <p className="text-sm text-zinc-500">Loading settings...</p> : null}

        {!isLoading && activeTab === 'quote-defaults' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Default Margin (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={quoteDefaults.defaultMarginPercent}
                  onChange={(event) =>
                    setQuoteDefaults((current) => ({ ...current, defaultMarginPercent: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Default Tax (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={quoteDefaults.defaultTaxPercent}
                  onChange={(event) =>
                    setQuoteDefaults((current) => ({ ...current, defaultTaxPercent: Number(event.target.value || 0) }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-600">Default Quote Terms</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                value={quoteDefaults.defaultQuoteTerms}
                onChange={(event) =>
                  setQuoteDefaults((current) => ({ ...current, defaultQuoteTerms: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={saveQuoteDefaults} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Quote Defaults'}
              </Button>
              <Button type="button" variant="outline" onClick={handlePushToggle}>
                {pushEnabled ? 'Disable Browser Push' : 'Enable Browser Push'}
              </Button>
            </div>
          </div>
        ) : null}

        {!isLoading && activeTab === 'labor-pricing' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Input
                placeholder="Trade (e.g. plumbing)"
                value={laborForm.trade}
                onChange={(event) => setLaborForm((current) => ({ ...current, trade: event.target.value }))}
              />
              <select
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                value={laborForm.expertiseLevel}
                onChange={(event) =>
                  setLaborForm((current) => ({ ...current, expertiseLevel: event.target.value }))
                }>
                <option value="standard">standard</option>
                <option value="expert">expert</option>
              </select>
              <Input
                placeholder="Hourly rate ($)"
                value={laborForm.hourlyRateDollars}
                onChange={(event) =>
                  setLaborForm((current) => ({ ...current, hourlyRateDollars: event.target.value }))
                }
              />
              <Button type="button" onClick={createLaborRow}>Save Labor Rate</Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Trade</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Expertise</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Hourly Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-zinc-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {laborItems.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-sm text-zinc-800">{row.trade}</td>
                      <td className="px-3 py-2 text-sm text-zinc-800">{row.expertiseLevel}</td>
                      <td className="px-3 py-2 text-sm text-zinc-800">${centsToDollars(row.hourlyRateCents)}</td>
                      <td className="px-3 py-2 text-sm text-zinc-600">{row.active ? 'Active' : 'Inactive'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" variant="outline" onClick={() => toggleLaborActive(row)}>
                          {row.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!isLoading && activeTab === 'materials-catalog' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Input
                placeholder="Material name"
                value={catalogForm.materials}
                onChange={(event) => setCatalogForm((current) => ({ ...current, materials: event.target.value }))}
              />
              <Input
                placeholder="UOM (each, ft, hr)"
                value={catalogForm.uom}
                onChange={(event) => setCatalogForm((current) => ({ ...current, uom: event.target.value }))}
              />
              <Input
                placeholder="Price ($)"
                value={catalogForm.priceDollars}
                onChange={(event) => setCatalogForm((current) => ({ ...current, priceDollars: event.target.value }))}
              />
              <Button type="button" onClick={createCatalogRow}>Add Material</Button>
            </div>
            <Input
              value={materialsSearch}
              onChange={(event) => setMaterialsSearch(event.target.value)}
              placeholder="Search materials..."
            />
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Material</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">UOM</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Price</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-600">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-zinc-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {filteredCatalog.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-zinc-800">{item.materials}</td>
                      <td className="px-3 py-2 text-sm text-zinc-800">{item.uom}</td>
                      <td className="px-3 py-2 text-sm text-zinc-800">${centsToDollars(item.price_cents)}</td>
                      <td className="px-3 py-2 text-sm text-zinc-600">{item.active ? 'Active' : 'Inactive'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" variant="outline" onClick={() => toggleCatalogActive(item)}>
                          {item.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default SettingsPage
