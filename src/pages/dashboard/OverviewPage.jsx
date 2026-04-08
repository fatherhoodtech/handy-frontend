import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiRequest } from '@/lib/apiClient'

const projectCards = [
  { title: 'Kitchen Remodel', subtitle: '14 tasks', progress: 72, className: 'bg-violet-600 text-white' },
  { title: 'HVAC Upgrade', subtitle: '9 tasks', progress: 48, className: 'bg-sky-300 text-zinc-900' },
  { title: 'Roof Repair', subtitle: '6 tasks', progress: 85, className: 'bg-orange-400 text-zinc-900' },
]

const todaysTasks = [
  { title: 'Call new leads', subtitle: '3 homeowners to contact', color: 'bg-orange-400' },
  { title: 'Review pending quotes', subtitle: 'Finalize 2 draft quotes', color: 'bg-violet-500' },
  { title: 'Customer follow-up', subtitle: 'Send status updates', color: 'bg-sky-400' },
]

const stats = [
  { label: 'Tracked hours', value: '28h' },
  { label: 'Closed deals', value: '18' },
  { label: 'Response rate', value: '89%' },
]

function OverviewPage() {
  const [overviewMessage, setOverviewMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadOverview() {
      try {
        const result = await apiRequest('/api/sales/overview')
        if (!cancelled) setOverviewMessage(result.message)
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

      <div className="grid gap-4 md:grid-cols-3">
        {projectCards.map((card) => (
          <Card key={card.title} className={`border-0 ${card.className}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">{card.title}</CardTitle>
              <CardDescription className="text-current/80">{card.subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-2 rounded-full bg-white/30">
                <div className="h-2 rounded-full bg-white/90" style={{ width: `${card.progress}%` }} />
              </div>
              <p className="mt-2 text-xs font-semibold">{card.progress}% complete</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle>Tasks for today</CardTitle>
            <CardDescription>Focus queue for the sales team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {todaysTasks.map((task) => (
              <div key={task.title} className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3">
                <span className={`mt-1 h-3 w-3 rounded-full ${task.color}`} />
                <div>
                  <p className="font-medium text-zinc-900">{task.title}</p>
                  <p className="text-sm text-zinc-600">{task.subtitle}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
            <CardDescription>Daily operational metrics.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-zinc-200 p-3">
                <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default OverviewPage
