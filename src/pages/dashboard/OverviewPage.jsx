import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { formatCentsToDollars } from '@/lib/pricingMoney'
import { CheckCircle, DollarSign, FileText, ListFilter, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function StatCard({ label, value, sub, icon: Icon, iconClass, borderClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full rounded-xl border bg-white p-5 text-left ${
        borderClass || 'border-zinc-200'
      } ${onClick ? 'transition-colors hover:bg-zinc-50 cursor-pointer' : 'cursor-default'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{value}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
        </div>
        <span className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}

function OverviewPage() {
  const navigate = useNavigate()
  const [, setOverviewMessage] = useState('')
  const [alerts, setAlerts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    quotesCreatedToday: 0,
    quotesApprovedToday: 0,
    draftsOpen: 0,
    approvedTotal: 0,
    quoteValueTodayCents: 0,
    approvedValueTodayCents: 0,
    requestsOpen: 0,
    opportunitiesOpen: 0,
    contactsTotal: 0,
  })

  useEffect(() => {
    let cancelled = false
    async function loadOverview() {
      try {
        const [overview, notifications] = await Promise.all([
          apiRequest('/api/sales/overview'),
          apiRequest('/api/sales/notifications?limit=5'),
        ])
        if (!cancelled) {
          setOverviewMessage(overview.message)
          setAlerts(Array.isArray(notifications?.items) ? notifications.items : [])
          if (overview?.metrics) {
            const m = overview.metrics
            setMetrics({
              ...m,
              requestsOpen: m.requestsOpen ?? m.opportunitiesOpen ?? 0,
              opportunitiesOpen: m.opportunitiesOpen ?? m.requestsOpen ?? 0,
            })
          }
        }
      } catch {
        if (!cancelled) setOverviewMessage('Overview data is currently unavailable.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadOverview()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New Requests"
          value={isLoading ? '—' : metrics.requestsOpen}
          sub="Open Jobber requests"
          icon={ListFilter}
          iconClass="bg-sky-50 text-sky-600"
          borderClass="border-sky-200"
          onClick={() => navigate('/dashboard/requests')}
        />
        <StatCard
          label="Open Drafts"
          value={isLoading ? '—' : metrics.draftsOpen}
          sub="Quotes awaiting approval"
          icon={FileText}
          iconClass="bg-amber-50 text-amber-600"
          borderClass="border-amber-200"
          onClick={() => navigate('/dashboard/quotes')}
        />
        <StatCard
          label="Sent to Jobber"
          value={isLoading ? '—' : metrics.approvedTotal}
          sub="Last 7 days"
          icon={RefreshCw}
          iconClass="bg-emerald-50 text-emerald-600"
          borderClass="border-emerald-200"
        />
        <StatCard
          label="Revenue (30 days)"
          value={isLoading ? '—' : formatCentsToDollars(metrics.approvedValueTodayCents)}
          sub="30-day tracking coming soon"
          icon={DollarSign}
          iconClass="bg-violet-50 text-violet-600"
          borderClass="border-violet-200"
        />
      </div>

      {/* Bottom section */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">

        {/* System status */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="font-semibold text-zinc-900">System Status</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Current state of sales operations</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><CheckCircle className="h-4 w-4" /></span>
              <div>
                <p className="text-xs text-zinc-500">Approved Quotes Total</p>
                <p className="text-2xl font-bold text-zinc-900">{isLoading ? '—' : metrics.approvedTotal}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><FileText className="h-4 w-4" /></span>
              <div>
                <p className="text-xs text-zinc-500">Draft Quotes Open</p>
                <p className="text-2xl font-bold text-zinc-900">{isLoading ? '—' : metrics.draftsOpen}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <span className="rounded-lg bg-sky-50 p-2 text-sky-600"><ListFilter className="h-4 w-4" /></span>
              <div>
                <p className="text-xs text-zinc-500">Open Requests</p>
                <p className="text-2xl font-bold text-zinc-900">{isLoading ? '—' : (metrics.requestsOpen ?? metrics.opportunitiesOpen)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <span className="rounded-lg bg-violet-50 p-2 text-violet-600"><DollarSign className="h-4 w-4" /></span>
              <div>
                <p className="text-xs text-zinc-500">Revenue Today</p>
                <p className="text-2xl font-bold text-zinc-900">{isLoading ? '—' : formatCentsToDollars(metrics.approvedValueTodayCents)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4 sm:col-span-2">
              <span className="rounded-lg bg-zinc-200 p-2 text-zinc-500"><RefreshCw className="h-4 w-4" /></span>
              <div>
                <p className="text-xs text-zinc-500">Total Contacts</p>
                <p className="text-2xl font-bold text-zinc-900">{isLoading ? '—' : metrics.contactsTotal}</p>
                <p className="text-xs text-zinc-400">All time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent alerts */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="font-semibold text-zinc-900">Recent Alerts</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Latest workflow notifications</p>
          </div>
          <div className="p-5">
            {isLoading ? (
              <p className="text-sm text-zinc-500">Loading alerts...</p>
            ) : alerts.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle className="mx-auto mb-2 h-7 w-7 text-zinc-200" />
                <p className="text-sm text-zinc-500">No recent alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((item) => (
                  <div key={item.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                      {!item.readAt && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">New</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-600">{item.body}</p>
                    <p className="mt-1 text-xs text-zinc-400">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default OverviewPage
