import {
  Bell,
  CheckCheck,
  ClipboardList,
  LayoutDashboard,
  ListFilter,
  Mail,
  Menu,
  Package,
  Settings,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'

function DashboardPage() {
  // NotificationPanel is defined as an inner component so it can close over state
  function NotificationPanel() {
    return (
      <div className="absolute right-0 top-full z-50 mt-2 flex w-80 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action bar */}
        {notifications.length > 0 && (
          <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
            <button
              type="button"
              onClick={markAllRead}
              title="Mark all as read"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
            <button
              type="button"
              onClick={clearAllNotifications}
              title="Clear all notifications"
              className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          </div>
        )}

        {/* Error */}
        {notificationError && (
          <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
            {notificationError}
          </p>
        )}

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Bell className="mb-2 h-7 w-7 text-slate-200" />
              <p className="text-sm text-slate-500">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {notifications.map((item) => (
                <div key={item.id} className={cn('px-4 py-3 transition-colors hover:bg-slate-50', !item.readAt && 'bg-sky-50/40')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {!item.readAt && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />}
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => clearNotification(item.id)}
                      title="Dismiss"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{item.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const notificationPanelRef = useRef(null)

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
    { to: '/dashboard/contacts', label: 'Contacts', icon: Mail },
    { to: '/dashboard/requests', label: 'Requests', icon: ListFilter },
    { to: '/dashboard/quotes', label: 'Quotes', icon: ClipboardList },
    { to: '/dashboard/labor-pricing', label: 'Labor Pricing', icon: Wrench },
    { to: '/dashboard/materials-catalog', label: 'Materials Catalog', icon: Package },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ]
  const allRouteLabels = [
    ...navItems.map((item) => ({ to: item.to, label: item.label })),
    { to: '/dashboard/ai-assistant', label: 'Quote Builder' },
  ]
  const pageTitle =
    allRouteLabels.find((item) => location.pathname.startsWith(item.to))?.label || 'Overview'
  const pageHeading = pageTitle === 'Quotes' ? 'Quote' : pageTitle
  const pageSubtitle =
    pageTitle === 'Quotes' ? 'Track drafts and approvals for sales follow-up.' : ''

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncSidebarForViewport = () => {
      const desktop = window.matchMedia('(min-width: 1024px)').matches
      setIsDesktop(desktop)
      setIsSidebarOpen(desktop ? true : false)
    }
    syncSidebarForViewport()
    window.addEventListener('resize', syncSidebarForViewport)
    return () => window.removeEventListener('resize', syncSidebarForViewport)
  }, [])
  useEffect(() => {
    if (!isNotificationsOpen) return
    function handleClickOutside(event) {
      if (notificationPanelRef.current && !notificationPanelRef.current.contains(event.target)) {
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isNotificationsOpen])

  useEffect(() => {
    let cancelled = false
    async function loadNotifications() {
      try {
        const response = await apiRequest('/api/sales/notifications?limit=50')
        if (cancelled) return
        setNotifications(Array.isArray(response?.items) ? response.items : [])
        setUnreadCount(Number(response?.unreadCount || 0))
      } catch (error) {
        if (!cancelled) setNotificationError(error?.message || 'Failed to load notifications')
      }
    }
    void loadNotifications()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  async function markAllRead() {
    try {
      await apiRequest('/api/sales/notifications/read-all', { method: 'PATCH' })
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })))
      setUnreadCount(0)
    } catch (error) {
      setNotificationError(error?.message || 'Failed to mark notifications as read')
    }
  }

  async function clearNotification(id) {
    try {
      setNotificationError('')
      await apiRequest(`/api/sales/notifications/${id}`, { method: 'DELETE' })
      setNotifications((current) => {
        const target = current.find((item) => item.id === id)
        if (target && !target.readAt) {
          setUnreadCount((count) => Math.max(0, count - 1))
        }
        return current.filter((item) => item.id !== id)
      })
    } catch (error) {
      setNotificationError(error?.message || 'Failed to clear notification')
    }
  }

  async function clearAllNotifications() {
    try {
      setNotificationError('')
      await apiRequest('/api/sales/notifications', { method: 'DELETE' })
      setNotifications([])
      setUnreadCount(0)
    } catch (error) {
      setNotificationError(error?.message || 'Failed to clear notifications')
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <main className="theme h-screen overflow-hidden bg-[#f5f1eb] text-zinc-900">
      <div className="relative flex h-full w-full overflow-hidden bg-white">
        {!isDesktop && isSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar overlay"
            className="absolute inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        <aside
          className={cn(
            'absolute inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-slate-700 bg-slate-800 px-5 pb-5 pt-6 transition-transform sm:pt-8 lg:relative lg:z-10 lg:translate-x-0',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}>
          <p className="mb-6 mt-10 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Handy Dudes</p>
          <button
            type="button"
            onClick={() => {
              navigate('/dashboard/settings')
              if (!isDesktop) setIsSidebarOpen(false)
            }}
            className="mb-6 w-full rounded-2xl border border-slate-600 bg-slate-700 p-4 text-center transition-colors hover:bg-slate-600">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-300">
              {userInitials || 'HD'}
            </div>
            <p className="font-semibold text-white">{userName}</p>
            <p className="text-xs text-slate-400">{user?.email ?? 'sales@handydudes.com'}</p>
          </button>

          <nav aria-label="Dashboard navigation" className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )
                }>
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button onClick={handleLogout} variant="outline" className="mt-8 w-full border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white">
            Logout
          </Button>
          <div className="mt-auto pt-6 text-center text-xs text-slate-500">
            <p>Handy Dudes Quoter v{__APP_VERSION__}</p>
            <p>by <a href="https://www.arkinnovations.rw" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">Ark Innovations</a></p>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 sm:p-8">
          <div className="mb-6 mt-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsSidebarOpen((current) => !current)}
                    aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                    title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                    className="lg:hidden">
                    <Menu className="h-4 w-4" />
                  </Button>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{pageHeading}</h1>
                {pageSubtitle && <p className="mt-1 text-zinc-500">{pageSubtitle}</p>}
              </div>
              <div className="relative" ref={notificationPanelRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((v) => !v)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {isNotificationsOpen && <NotificationPanel />}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </section>

      </div>
    </main>
  )
}

export default DashboardPage
