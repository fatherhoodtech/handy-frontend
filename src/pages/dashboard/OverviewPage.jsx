import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiRequest } from '@/lib/apiClient'

function formatMoney(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100)
}

function OverviewPage() {
  const [overviewMessage, setOverviewMessage] = useState('')
  const [alerts, setAlerts] = useState([])
  const [metrics, setMetrics] = useState({
    quotesCreatedToday: 0,
    quotesApprovedToday: 0,
    draftsOpen: 0,
    approvedTotal: 0,
    quoteValueTodayCents: 0,
    approvedValueTodayCents: 0,
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
          if (overview?.metrics) setMetrics(overview.metrics)
        }
      } catch {
        if (!cancelled) setOverviewMessage('Overview data is currently unavailable.')
      }
    }
    void loadOverview()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-zinc-600">
        {overviewMessage || 'Welcome back. Here is your sales snapshot for today.'}
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-600">Quotes Created Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{metrics.quotesCreatedToday}</p>
            <p className="text-xs text-zinc-500">All newly created selected quotes today</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-600">Quotes Approved Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{metrics.quotesApprovedToday}</p>
            <p className="text-xs text-zinc-500">Approved and ready for follow-up</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-600">Quote Value Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{formatMoney(metrics.quoteValueTodayCents)}</p>
            <p className="text-xs text-zinc-500">Total created quote value today</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-600">Approved Value Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{formatMoney(metrics.approvedValueTodayCents)}</p>
            <p className="text-xs text-zinc-500">Approved quote value today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current state of sales operations.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Draft Quotes Open</p>
              <p className="text-2xl font-bold text-zinc-900">{metrics.draftsOpen}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Approved Quotes Total</p>
              <p className="text-2xl font-bold text-zinc-900">{metrics.approvedTotal}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Open Opportunities</p>
              <p className="text-2xl font-bold text-zinc-900">{metrics.opportunitiesOpen}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Active Contacts</p>
              <p className="text-2xl font-bold text-zinc-900">{metrics.contactsTotal}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 sm:col-span-2">
              <p className="text-xs text-zinc-500">Conversion Signal (today)</p>
              <p className="text-2xl font-bold text-zinc-900">
                {metrics.quotesCreatedToday > 0
                  ? `${Math.round((metrics.quotesApprovedToday / metrics.quotesCreatedToday) * 100)}%`
                  : '0%'}
              </p>
              <p className="text-xs text-zinc-500">Approved today / created today</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>Recent workflow notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-zinc-500">No recent alerts.</p>
            ) : alerts.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-200 p-3">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-sm text-zinc-600">{item.body}</p>
                <p className="mt-1 text-xs text-zinc-500">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default OverviewPage
