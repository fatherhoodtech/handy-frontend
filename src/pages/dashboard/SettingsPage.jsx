import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import {
  Bell,
  Building2,
  FileText,
  Package,
  Search,
  Wrench,
} from 'lucide-react'

const TABS = [
  { id: 'account',           label: 'Account',           icon: Building2  },
  { id: 'quote-defaults',    label: 'Quote Defaults',    icon: FileText   },
  { id: 'labor-pricing',     label: 'Labor Pricing',     icon: Wrench     },
  { id: 'materials-catalog', label: 'Materials Catalog', icon: Package    },
  { id: 'notifications',     label: 'Notifications',     icon: Bell       },
]

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

function SectionHeader({ title, description }) {
  return (
    <div className="mb-5 border-b border-zinc-100 pb-4">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
    </div>
  )
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('account')
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
    return () => { cancelled = true }
  }, [])

  function clearMessages() { setError(''); setNotice('') }

  async function saveQuoteDefaults() {
    try {
      clearMessages()
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

  async function handlePushToggle() {
    try {
      clearMessages()
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
        if (!sub) sub = await registration.pushManager.subscribe({ userVisibleOnly: true })
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
    <div className="flex min-h-0 gap-6">

      {/* Left nav */}
      <aside className="w-48 shrink-0">
        <nav className="space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); clearMessages() }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors text-left',
                activeTab === tab.id
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100'
              )}>
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white p-6">

        {/* Feedback banners */}
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

        {isLoading && activeTab !== 'account' && activeTab !== 'notifications' ? (
          <p className="text-sm text-zinc-500">Loading settings...</p>
        ) : null}

        {/* ── Account ── */}
        {activeTab === 'account' && (
          <div>
            <SectionHeader
              title="Account"
              description="Business profile and system information for Handy Dudes."
            />
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Handy Dudes</h3>
                <p className="text-sm text-zinc-500">Home Services · Sales Quoting & Dispatch</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Company Name',    value: 'Handy Dudes' },
                { label: 'Industry',        value: 'Home Services' },
                { label: 'System',          value: 'Sales Quoting & Dispatch' },
                { label: 'Backend URL',     value: 'https://handy.us.eqv.rw' },
                { label: 'CRM Integration', value: 'GoHighLevel (GHL)' },
                { label: 'Field Ops',       value: 'Jobber' },
                { label: 'Lead Source',     value: 'CallRail · Thumbtack' },
                { label: 'AI Engine',       value: 'Anthropic Claude' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Quote Defaults ── */}
        {!isLoading && activeTab === 'quote-defaults' && (
          <div>
            <SectionHeader
              title="Quote Defaults"
              description="Set the default margin, tax, and terms applied to all new quotes."
            />
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600">Default Margin (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={quoteDefaults.defaultMarginPercent}
                    onChange={(e) =>
                      setQuoteDefaults((c) => ({ ...c, defaultMarginPercent: Number(e.target.value || 0) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600">Default Tax (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={quoteDefaults.defaultTaxPercent}
                    onChange={(e) =>
                      setQuoteDefaults((c) => ({ ...c, defaultTaxPercent: Number(e.target.value || 0) }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Default Quote Terms</label>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-400"
                  value={quoteDefaults.defaultQuoteTerms}
                  onChange={(e) =>
                    setQuoteDefaults((c) => ({ ...c, defaultQuoteTerms: e.target.value }))
                  }
                />
              </div>
              <Button type="button" onClick={saveQuoteDefaults} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Defaults'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Labor Pricing ── */}
        {!isLoading && activeTab === 'labor-pricing' && (
          <div>
            <SectionHeader
              title="Labor Pricing"
              description="Define hourly rates per trade and expertise level used in quote calculations."
            />
            <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4 sm:grid-cols-4">
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
              <Button type="button" onClick={createLaborRow}>Add Rate</Button>
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
                  {laborItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-zinc-400">No labor rates yet. Add one above.</td>
                    </tr>
                  ) : laborItems.map((row) => (
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleLaborActive(row)}>
                          {row.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Materials Catalog ── */}
        {!isLoading && activeTab === 'materials-catalog' && (
          <div>
            <SectionHeader
              title="Materials Catalog"
              description="Manage the list of materials and their unit prices used in quote line items."
            />
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCatalogActive(item)}>
                          {item.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {activeTab === 'notifications' && (
          <div>
            <SectionHeader
              title="Notifications"
              description="Manage how and when you receive alerts from the system."
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Browser Push Notifications</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Receive real-time alerts in your browser even when the tab is in the background.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={pushEnabled ? 'outline' : 'default'}
                  onClick={handlePushToggle}>
                  {pushEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 px-5 py-4 opacity-60">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Email Notifications</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Daily digest of quotes and pipeline activity.</p>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-400">Coming soon</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default SettingsPage
