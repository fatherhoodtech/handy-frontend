import {
  Bot,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  ListFilter,
  Mail,
  PhoneCall,
  PlusCircle,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const userName = user?.email?.split('@')[0] || 'Sales User'
  const userInitials = userName
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

  const navItems = [
    { to: '/dashboard/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/dashboard/opportunity', label: 'Opportunity', icon: ListFilter },
    { to: '/dashboard/ai-assistant', label: 'AI Assistant', icon: Bot },
    { to: '/dashboard/contacts', label: 'Contacts', icon: Mail },
    { to: '/dashboard/quotes', label: 'Quotes', icon: ClipboardList },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ]
  const pageTitle =
    navItems.find((item) => location.pathname.startsWith(item.to))?.label || 'Overview'
  const pageHeading = pageTitle === 'Quotes' ? 'Quote' : pageTitle
  const pageSubtitle =
    pageTitle === 'Quotes'
      ? 'Track drafts and approvals for sales follow-up.'
      : 'Today is a great day to move your pipeline forward.'
  const kpis = [
    { label: 'Calls today', value: '12' },
    { label: 'Quotes sent', value: '5' },
    { label: 'Win rate', value: '42%' },
  ]
  const quickActions = [
    { label: 'New Contact', icon: PlusCircle, to: '/dashboard/contacts', state: { openCreate: true } },
    { label: 'Create Quote', icon: FilePlus2, to: '/dashboard/quotes' },
    { label: 'Log Follow-up', icon: PhoneCall, to: '/dashboard/contacts' },
  ]
  const activityFeed = [
    { text: 'Sara updated quote Q-2051', time: '2m ago' },
    { text: 'New lead from website form', time: '14m ago' },
    { text: 'Quote Q-2048 approved by customer', time: '31m ago' },
    { text: 'Follow-up logged for John Carter', time: '1h ago' },
    { text: 'Mia Rodriguez moved to Contacted', time: '2h ago' },
  ]

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <main className="theme h-screen overflow-hidden bg-[#f5f1eb] text-zinc-900">
      <div className="grid h-full w-full overflow-hidden bg-white lg:grid-cols-[250px_1fr_280px]">
        <aside className="border-b border-zinc-200 bg-zinc-50/70 p-5 lg:border-b-0 lg:border-r">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Handy Dudes</p>
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
              {userInitials || 'HD'}
            </div>
            <p className="font-semibold text-zinc-900">{userName}</p>
            <p className="text-xs text-zinc-500">{user?.email ?? 'sales@handydudes.com'}</p>
          </div>

          <nav aria-label="Dashboard navigation" className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100'
                  )
                }>
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button onClick={handleLogout} variant="outline" className="mt-6 w-full">
            Logout
          </Button>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 sm:p-8">
          <div className="mb-6 mt-10">
            <h1 className="text-3xl font-bold tracking-tight">{pageHeading}</h1>
            <p className="mt-1 text-zinc-500">{pageSubtitle}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </section>

        <aside className="border-t border-zinc-200 bg-[#fbf7f2] p-5 lg:border-t-0 lg:border-l">
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sky-600" />
              <h2 className="font-semibold text-zinc-900">Personal KPI</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-zinc-200 bg-white p-2 text-center">
                  <p className="text-sm font-bold text-zinc-900">{kpi.value}</p>
                  <p className="text-[10px] text-zinc-500">{kpi.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="mb-3 font-semibold text-zinc-900">Quick Actions</h3>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => navigate(action.to, { state: action.state })}>
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-zinc-900">Activity Feed</h3>
            <div className="space-y-2">
              {activityFeed.map((item) => (
                <div key={`${item.text}-${item.time}`} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <p className="text-sm font-medium text-zinc-900">{item.text}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.time}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

export default DashboardPage
