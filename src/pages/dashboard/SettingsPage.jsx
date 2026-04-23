import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import {
  Bell,
  Building2,
  FileText,
} from 'lucide-react'

const TABS = [
  { id: 'account', label: 'Account', icon: Building2 },
  { id: 'quote-defaults', label: 'Quote Defaults', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

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
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      try {
        setIsLoading(true)
        const settingsRes = await apiRequest('/api/sales/settings')
        if (cancelled) return
        if (settingsRes?.quoteDefaults) setQuoteDefaults(settingsRes.quoteDefaults)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load settings')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  function clearMessages() {
    setError('')
    setNotice('')
  }

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
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <nav className="flex min-w-max flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id)
                clearMessages()
              }}
              className={cn(
                'inline-flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                activeTab === tab.id
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100'
              )}>
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-6">
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

        {isLoading && activeTab === 'quote-defaults' ? (
          <p className="text-sm text-zinc-500">Loading settings...</p>
        ) : null}

        {activeTab === 'account' && (
          <div>
            <SectionHeader
              title="Account"
              description="Business profile and system information for Handy Dudes."
            />
            <div className="mb-6 flex items-center gap-4">
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
                { label: 'Company Name', value: 'Handy Dudes' },
                { label: 'Industry', value: 'Home Services' },
                { label: 'System', value: 'Sales Quoting & Dispatch' },
                { label: 'Backend URL', value: 'https://handy.us.eqv.rw' },
                { label: 'CRM Integration', value: 'GoHighLevel (GHL)' },
                { label: 'Field Ops', value: 'Jobber' },
                { label: 'Lead Source', value: 'Thumbtack · CallRail (see master plan)' },
                { label: 'AI Engine', value: 'Anthropic Claude' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
                <Button type="button" variant={pushEnabled ? 'outline' : 'default'} onClick={handlePushToggle}>
                  {pushEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 px-5 py-4 opacity-60">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Email Notifications</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Daily digest of quotes and pipeline activity.</p>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                  Coming soon
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
