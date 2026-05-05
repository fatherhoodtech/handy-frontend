import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  Building2,
  FileText,
  Shield,
  Plug,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

function SectionHeader({ title, description }) {
  return (
    <div className="mb-5 border-b border-zinc-100 pb-4">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
    </div>
  )
}

function SettingsPage() {
  const { showToast } = useToast()
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
  const [profile, setProfile] = useState({ id: '', email: '', role: '' })
  const [profileEmailDraft, setProfileEmailDraft] = useState('')
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'sales' })
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState(null)
  const [deletingUserId, setDeletingUserId] = useState(null)
  const [pendingDeleteUser, setPendingDeleteUser] = useState(null)
  const [usersLoadError, setUsersLoadError] = useState('')
  const [jobberStatus, setJobberStatus] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const tabs = useMemo(() => {
    const base = [
      { id: 'account', label: 'Account', icon: Building2 },
      { id: 'quote-defaults', label: 'Quote Defaults', icon: FileText },
    ]
    if (profile.role === 'admin') {
      base.push({ id: 'users', label: 'Users', icon: Shield })
      base.push({ id: 'integrations', label: 'Integrations', icon: Plug })
    }
    return base
  }, [profile.role])

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      try {
        setIsLoading(true)
        const [settingsRes, meRes] = await Promise.all([
          apiRequest('/api/sales/settings'),
          apiRequest('/auth/me'),
        ])
        if (cancelled) return
        if (settingsRes?.quoteDefaults) setQuoteDefaults(settingsRes.quoteDefaults)
        if (meRes?.user) {
          setProfile({
            id: String(meRes.user.id ?? ''),
            email: String(meRes.user.email ?? ''),
            role: String(meRes.user.role ?? ''),
          })
          setProfileEmailDraft(String(meRes.user.email ?? ''))
          if (String(meRes.user.role ?? '') === 'admin') {
            try {
              const usersRes = await apiRequest('/api/sales/users')
              if (!cancelled) {
                setUsers(Array.isArray(usersRes?.users) ? usersRes.users : [])
                setUsersLoadError('')
              }
            } catch (usersErr) {
              if (!cancelled) {
                setUsers([])
                setUsersLoadError(usersErr?.message || 'Failed to load users list')
              }
            }
          }
        }
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

  // Handle Jobber OAuth callback redirect params and load Jobber status for admins
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const jobberParam = params.get('jobber')
    const tabParam = params.get('tab')
    if (jobberParam || tabParam) {
      if (tabParam) setActiveTab(tabParam)
      if (jobberParam === 'connected') {
        showToast('Jobber connected successfully!', 'success')
      } else if (jobberParam === 'error') {
        showToast(params.get('message') || 'Jobber authorization failed.', 'error')
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'integrations') return
    apiRequest('/api/sales/integrations/jobber/status')
      .then((data) => setJobberStatus(data ?? null))
      .catch(() => setJobberStatus({ connected: false, expiresAt: null }))
  }, [activeTab])

  async function handleConnectJobber() {
    setIsConnecting(true)
    try {
      const data = await apiRequest('/api/sales/integrations/jobber/connect')
      window.location.href = data.authUrl
    } catch (err) {
      showToast(err?.message || 'Failed to start Jobber authorization.', 'error')
      setIsConnecting(false)
    }
  }

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

  async function saveProfile() {
    try {
      clearMessages()
      setIsSavingProfile(true)
      const response = await apiRequest('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ email: profileEmailDraft.trim() }),
      })
      const user = response?.user
      if (user) {
        setProfile({
          id: String(user.id ?? ''),
          email: String(user.email ?? ''),
          role: String(user.role ?? ''),
        })
        setProfileEmailDraft(String(user.email ?? ''))
      }
      setNotice('Profile updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function savePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.')
          return
        }
    try {
      clearMessages()
      setIsSavingPassword(true)
      await apiRequest('/auth/me/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setNotice('Password changed successfully.')
    } catch (err) {
      setError(err?.message || 'Failed to change password')
    } finally {
      setIsSavingPassword(false)
    }
  }

  async function createUser() {
    try {
      clearMessages()
      setIsSavingUser(true)
      await apiRequest('/api/sales/users', {
          method: 'POST',
          body: JSON.stringify({
          email: newUser.email.trim(),
          password: newUser.password,
          role: newUser.role,
          }),
        })
      setNewUser({ email: '', password: '', role: 'sales' })
      const usersRes = await apiRequest('/api/sales/users')
      setUsers(Array.isArray(usersRes?.users) ? usersRes.users : [])
      setUsersLoadError('')
      setNotice('User created successfully.')
    } catch (err) {
      setError(err?.message || 'Failed to create user')
    } finally {
      setIsSavingUser(false)
    }
  }

  async function updateUserStatus(userId, isActive) {
    try {
      clearMessages()
      setStatusUpdatingUserId(userId)
      const response = await apiRequest(`/api/sales/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      })
      const updatedUser = response?.user
      if (updatedUser?.id) {
        setUsers((current) => current.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
      }
      setNotice(isActive ? 'User activated successfully.' : 'User deactivated successfully.')
    } catch (err) {
      setError(err?.message || 'Failed to update user status')
    } finally {
      setStatusUpdatingUserId(null)
    }
  }

  function requestDeleteUser(user) {
    if (!user || user.isActive) return
    setPendingDeleteUser(user)
  }

  function cancelDeleteUser() {
    if (deletingUserId != null) return
    setPendingDeleteUser(null)
  }

  async function confirmDeleteUser() {
    if (!pendingDeleteUser || pendingDeleteUser.isActive) return
    try {
      clearMessages()
      setDeletingUserId(pendingDeleteUser.id)
      await apiRequest(`/api/sales/users/${pendingDeleteUser.id}`, {
          method: 'DELETE',
      })
      setUsers((current) => current.filter((item) => item.id !== pendingDeleteUser.id))
      setNotice('User deleted successfully.')
      setPendingDeleteUser(null)
    } catch (err) {
      setError(err?.message || 'Failed to delete user')
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <nav className="flex min-w-max flex-wrap items-center gap-2">
          {tabs.map((tab) => (
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
                  ? 'border-[#262742] bg-[#262742]/10 text-[#1a1b30]'
                  : 'border-[#262742]/30 bg-white text-zinc-700 hover:border-[#262742] hover:bg-[#262742]/10'
              )}>
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-w-0 rounded-xl border border-[#262742]/30 bg-white p-6">
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
            <SectionHeader title="Account" description="Manage your profile and security settings." />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#262742]/30 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">Profile Information</p>
                <p className="mt-1 text-xs text-zinc-500">Keep your account profile up to date.</p>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-600">Email</label>
                    <Input
                      value={profileEmailDraft}
                      onChange={(e) => setProfileEmailDraft(e.target.value)}
                      placeholder="name@company.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Role</p>
                      <p className="text-sm text-zinc-900">{profile.role || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">User ID</p>
                      <p className="text-sm text-zinc-900">{profile.id || '—'}</p>
                    </div>
                  </div>
                  <Button type="button" onClick={saveProfile} disabled={isSavingProfile} className="h-10 px-5">
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-[#262742]/30 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">Change Password</p>
                <p className="mt-1 text-xs text-zinc-500">Use a strong password with at least 8 characters.</p>
                <div className="mt-3 space-y-3">
                  <Input
                    type="password"
                    placeholder="Current password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, currentPassword: e.target.value }))}
                  />
                  <Input
                    type="password"
                    placeholder="New password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, newPassword: e.target.value }))}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, confirmPassword: e.target.value }))}
                  />
                  <Button type="button" onClick={savePassword} disabled={isSavingPassword} className="h-10 px-5">
                    {isSavingPassword ? 'Saving...' : 'Change Password'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && profile.role === 'admin' && (
              <div>
            <SectionHeader title="Users" description="Admins can create and manage sales/admin accounts." />
            {usersLoadError ? (
              <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {usersLoadError}
              </div>
            ) : null}
            <div className="rounded-xl border border-[#262742]/30 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Create User</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Input
                  placeholder="Email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((c) => ({ ...c, email: e.target.value }))}
                />
                <Input
                  type="password"
                  placeholder="Temporary password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((c) => ({ ...c, password: e.target.value }))}
                />
                <select
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#262742]"
                  value={newUser.role}
                  onChange={(e) => setNewUser((c) => ({ ...c, role: e.target.value }))}>
                  <option value="sales">Salesperson</option>
                  <option value="admin">Admin</option>
                </select>
                <Button type="button" onClick={createUser} disabled={isSavingUser} className="h-10 px-5">
                  {isSavingUser ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-[#262742]/30">
              <table className="min-w-full">
                <thead className="border-b border-zinc-200 bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Last Login</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">No users yet.</td>
                    </tr>
                  ) : users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 text-sm text-zinc-900">{u.email}</td>
                      <td className="px-4 py-3 text-sm capitalize text-zinc-700">{u.role}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                          u.isActive ? 'border-[#262742]/30 bg-[#262742]/10 text-[#1a1b30]' : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                        )}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'h-8 px-3',
                            u.isActive
                              ? 'border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50'
                          )}
                          onClick={() => updateUserStatus(u.id, !u.isActive)}
                          disabled={statusUpdatingUserId === u.id || deletingUserId === u.id || String(u.id) === String(profile.id)}>
                          {statusUpdatingUserId === u.id
                            ? 'Updating...'
                            : u.isActive
                              ? 'Deactivate'
                              : 'Activate'}
                        </Button>
                        {!u.isActive ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="ml-2 h-8 border-red-200 px-3 text-red-700 hover:border-red-300 hover:bg-red-50"
                            onClick={() => requestDeleteUser(u)}
                            disabled={deletingUserId === u.id || statusUpdatingUserId === u.id || String(u.id) === String(profile.id)}>
                            {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  className="min-h-28 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#262742]"
                  value={quoteDefaults.defaultQuoteTerms}
                  onChange={(e) =>
                    setQuoteDefaults((c) => ({ ...c, defaultQuoteTerms: e.target.value }))
                  }
                />
              </div>
              <Button type="button" onClick={saveQuoteDefaults} disabled={isSaving} className="h-10 px-5">
                {isSaving ? 'Saving...' : 'Save Defaults'}
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && profile.role === 'admin' && (
          <div>
            <SectionHeader
              title="Integrations"
              description="Manage connections to external services."
            />
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#262742]/10">
                    <Plug className="h-4 w-4 text-[#262742]" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">Jobber</p>
                    <p className="mt-0.5 text-sm text-zinc-500">Field service management — quotes and client sync</p>
                    {jobberStatus === null ? (
                      <p className="mt-1 text-sm text-zinc-400">Checking status…</p>
                    ) : jobberStatus.connected ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-emerald-700">
                          Connected
                          {jobberStatus.expiresAt && (
                            <span className="text-zinc-500">
                              {' '}— token expires {new Date(jobberStatus.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm text-zinc-500">Not connected</span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleConnectJobber}
                  disabled={isConnecting}
                  className="h-9 shrink-0 px-4"
                >
                  {isConnecting ? 'Connecting…' : jobberStatus?.connected ? 'Reconnect Jobber' : 'Connect Jobber'}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>

      {pendingDeleteUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={cancelDeleteUser}
          onKeyDown={(event) => { if (event.key === 'Escape') cancelDeleteUser() }}
          role="button"
          tabIndex={0}>
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Delete deactivated account confirmation">
            <h3 className="text-base font-bold text-zinc-900">Delete Deactivated Account</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Delete <span className="font-medium">{pendingDeleteUser.email}</span>? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={cancelDeleteUser} disabled={deletingUserId != null}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={confirmDeleteUser}
                disabled={deletingUserId != null}>
                {deletingUserId != null ? 'Deleting...' : 'Delete Account'}
                </Button>
            </div>
          </div>
      </div>
      ) : null}
    </div>
  )
}

export default SettingsPage
