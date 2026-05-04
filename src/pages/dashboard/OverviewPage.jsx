import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { formatCentsToDollars } from '@/lib/pricingMoney'
import { CheckCircle, DollarSign, FileText, ListFilter, RefreshCw, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'

const weeklyActivity = [
  { day: 'Mon', quotes: 5, valueCents: 320000 },
  { day: 'Tue', quotes: 8, valueCents: 540000 },
  { day: 'Wed', quotes: 4, valueCents: 280000 },
  { day: 'Thu', quotes: 11, valueCents: 720000 },
  { day: 'Fri', quotes: 7, valueCents: 460000 },
  { day: 'Sat', quotes: 3, valueCents: 190000 },
  { day: 'Sun', quotes: 2, valueCents: 120000 },
]

function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-100 transition-shadow ${
        onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
      }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-3 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </button>
  )
}

function AreaTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-sm font-bold text-slate-900">
          {entry.dataKey === 'quotes' ? `${entry.value} quotes` : formatCentsToDollars(entry.value)}
        </p>
      ))}
    </div>
  )
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">{formatCentsToDollars(payload[0].value)}</p>
    </div>
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

  const statusData = [
    { name: 'Approved', value: metrics.approvedTotal || 0, color: '#10b981' },
    { name: 'Drafts', value: metrics.draftsOpen || 0, color: '#f59e0b' },
    { name: 'Requests', value: metrics.requestsOpen || 0, color: '#262742' },
  ]
  const statusTotal = statusData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New Requests"
          value={isLoading ? '—' : metrics.requestsOpen}
          sub="Open Jobber requests"
          icon={ListFilter}
          iconBg="bg-[#262742]/10"
          iconColor="text-[#262742]"
          onClick={() => navigate('/dashboard/requests')}
        />
        <StatCard
          label="Open Drafts"
          value={isLoading ? '—' : metrics.draftsOpen}
          sub="Awaiting approval"
          icon={FileText}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
          onClick={() => navigate('/dashboard/quotes')}
        />
        <StatCard
          label="Sent to Jobber"
          value={isLoading ? '—' : metrics.approvedTotal}
          sub="Last 7 days"
          icon={RefreshCw}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Revenue"
          value={isLoading ? '—' : formatCentsToDollars(metrics.approvedValueTodayCents)}
          sub="30-day tracking"
          icon={DollarSign}
          iconBg="bg-violet-50"
          iconColor="text-violet-500"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Area chart — quote activity */}
        <div className="col-span-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Quote Activity</h2>
              <p className="mt-0.5 text-xs text-slate-400">Quotes created — last 7 days</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              This week
            </span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={weeklyActivity} margin={{ top: 5, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="quoteGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#262742" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#262742" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<AreaTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="quotes"
                stroke="#262742"
                strokeWidth={2.5}
                fill="url(#quoteGrad)"
                dot={{ r: 3, fill: '#262742', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#262742', strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Donut — pipeline status */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="font-semibold text-slate-900">Pipeline Status</h2>
          <p className="mt-0.5 text-xs text-slate-400">Quote breakdown</p>
          {isLoading ? (
            <div className="flex h-[210px] items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : (
            <>
              <div className="relative mt-2">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={statusData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}>
                      {statusData.filter(d => d.value > 0).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-slate-900">{statusTotal}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Total</p>
                </div>
              </div>
              <div className="mt-3 space-y-2.5">
                {statusData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-slate-500">{item.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Revenue bar chart + Alerts */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

        {/* Bar chart — weekly revenue */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">Weekly Revenue</h2>
            <p className="mt-0.5 text-xs text-slate-400">Approved quote value — last 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyActivity} margin={{ top: 5, right: 4, bottom: 0, left: -18 }} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v / 100000}k`}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="valueCents" fill="#262742" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent alerts */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Recent Alerts</h2>
              <p className="mt-0.5 text-xs text-slate-400">Latest notifications</p>
            </div>
            {alerts.some(a => !a.readAt) && (
              <span className="rounded-full bg-[#262742]/10 px-2.5 py-1 text-xs font-medium text-[#1a1b30]">
                {alerts.filter(a => !a.readAt).length} new
              </span>
            )}
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">No recent alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {alerts.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!item.readAt ? 'bg-[#262742]' : 'bg-slate-200'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>
                  </div>
                  <p className="shrink-0 text-[11px] text-slate-400">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export default OverviewPage
