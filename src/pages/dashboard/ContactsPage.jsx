import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { Search, TrendingUp, Users, UserPlus } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

function getInitials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

function avatarColor(name) {
  const code = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function sourceBadge(source) {
  const s = (source || 'unknown').toLowerCase()
  if (s === 'jobber') return { label: 'Jobber', dot: 'bg-sky-500', className: 'bg-sky-50 text-sky-700 border-sky-200' }
  if (s === 'thumbtack') return { label: 'Thumbtack', dot: 'bg-amber-500', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (s === 'manual') return { label: 'Active', dot: 'bg-emerald-500', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (s === 'unknown') return { label: 'Unknown', dot: 'bg-zinc-400', className: 'bg-zinc-50 text-zinc-600 border-zinc-200' }
  return { label: s.charAt(0).toUpperCase() + s.slice(1), dot: 'bg-zinc-400', className: 'bg-zinc-50 text-zinc-600 border-zinc-200' }
}

function ContactsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldOpenCreateFromQuickAction = Boolean(location.state?.openCreate)
  const [contacts, setContacts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedContactDetail, setSelectedContactDetail] = useState(null)
  const [selectedContactName, setSelectedContactName] = useState('')
  const [deleteModalContact, setDeleteModalContact] = useState(null)
  const [updateModalContact, setUpdateModalContact] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(shouldOpenCreateFromQuickAction)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [formData, setFormData] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '',
    addressLine1: '', addressLine2: '',
    city: '', state: 'AL', postalCode: '',
  })
  const [updateFormData, setUpdateFormData] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '',
    addressLine1: '', addressLine2: '',
    city: '', state: 'AL', postalCode: '',
  })

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [contacts]
  )
  const sourceOptions = useMemo(() => {
    const set = new Set(sortedContacts.map((c) => (c.source || 'unknown').toLowerCase()))
    return ['all', ...Array.from(set)]
  }, [sortedContacts])
  const filteredContacts = useMemo(() => {
    const now = Date.now()
    return sortedContacts.filter((contact) => {
      const searchText = `${contact.name || ''} ${contact.email || ''} ${contact.phone || ''}`.toLowerCase()
      const matchesSearch = search.trim() === '' || searchText.includes(search.trim().toLowerCase())
      const source = (contact.source || 'unknown').toLowerCase()
      const matchesSource = sourceFilter === 'all' || source === sourceFilter
      const createdAtMs = new Date(contact.createdAt).getTime()
      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === '7d' && now - createdAtMs <= 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === '30d' && now - createdAtMs <= 30 * 24 * 60 * 60 * 1000)
      return matchesSearch && matchesSource && matchesDate
    })
  }, [sortedContacts, search, sourceFilter, dateFilter])

  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return contacts.filter((c) => new Date(c.createdAt).getTime() >= cutoff).length
  }, [contacts])
  const newThisMonth = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return contacts.filter((c) => new Date(c.createdAt).getTime() >= cutoff).length
  }, [contacts])

  useEffect(() => {
    let cancelled = false
    async function loadContacts() {
      try {
        const result = await apiRequest('/api/sales/contacts')
        if (!cancelled) {
          setContacts(result.contacts || [])
          setErrorMessage('')
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error?.message || 'Failed to load contacts')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadContacts()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (shouldOpenCreateFromQuickAction) setShowCreateForm(true)
  }, [shouldOpenCreateFromQuickAction])

  function handleInputChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleCreateContact(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')
    try {
      const result = await apiRequest('/api/sales/contacts', {
        method: 'POST',
        body: JSON.stringify({
          firstName: formData.firstName, middleName: formData.middleName, lastName: formData.lastName,
          email: formData.email, phone: formData.phone,
          addressLine1: formData.addressLine1, addressLine2: formData.addressLine2,
          city: formData.city, state: formData.state, postalCode: formData.postalCode,
        }),
      })
      const created = result.contact
      setContacts((current) => [created, ...current])
      setFormData({ firstName: '', middleName: '', lastName: '', email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: 'AL', postalCode: '' })
      setSelectedContactName(`${created.name} - Created`)
      setShowCreateForm(false)
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to create contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleContactClick(contact) {
    setSelectedContactName(contact.name)
    setSelectedContactDetail(contact)
  }

  function splitNameParts(contact) {
    const first = String(contact?.firstName ?? '').trim()
    const middle = String(contact?.middleName ?? '').trim()
    const last = String(contact?.lastName ?? '').trim()
    if (first || middle || last) return { first, middle, last }
    const segments = String(contact?.name ?? '').trim().split(/\s+/).filter(Boolean)
    return {
      first: segments[0] ?? '',
      middle: segments.length > 2 ? segments.slice(1, -1).join(' ') : '',
      last: segments.length > 1 ? segments[segments.length - 1] : '',
    }
  }

  function openDeleteModal(contact) {
    setDeleteModalContact(contact)
    setSelectedContactDetail(null)
  }

  async function handleConfirmDeleteContact() {
    if (!deleteModalContact) return
    try {
      setErrorMessage('')
      setIsDeleting(true)
      await apiRequest(`/api/sales/contacts/${deleteModalContact.id}`, { method: 'DELETE' })
      setContacts((current) => current.filter((item) => item.id !== deleteModalContact.id))
      setSelectedContactName(`${deleteModalContact.name || 'Contact'} - Archived`)
      setDeleteModalContact(null)
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to archive contact')
    } finally {
      setIsDeleting(false)
    }
  }

  function openUpdateModal(contact) {
    const nameParts = splitNameParts(contact)
    setUpdateModalContact(contact)
    setSelectedContactDetail(null)
    setUpdateFormData({
      firstName: nameParts.first, middleName: nameParts.middle, lastName: nameParts.last,
      email: contact.email || '', phone: contact.phone || '',
      addressLine1: contact.addressLine1 || '', addressLine2: contact.addressLine2 || '',
      city: contact.city || '', state: contact.state || 'AL', postalCode: contact.postalCode || '',
    })
  }

  function handleUpdateInputChange(event) {
    const { name, value } = event.target
    setUpdateFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmitUpdateContact(event) {
    event.preventDefault()
    if (!updateModalContact) return
    try {
      setErrorMessage('')
      setIsSubmitting(true)
      const response = await apiRequest(`/api/sales/contacts/${updateModalContact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateFormData),
      })
      const updated = response?.contact
      if (updated?.id) {
        setContacts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        setSelectedContactName(`${updated.name || 'Contact'} - Updated`)
      }
      setUpdateModalContact(null)
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to update contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCreateQuoteFromContact(contact) {
    setSelectedContactDetail(null)
    const contactAddress = [
      contact.addressLine1,
      contact.addressLine2,
      [contact.city, contact.state, contact.postalCode].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ')
    navigate('/dashboard/ai-assistant', {
      state: {
        contactId: contact.id,
        startNewChat: true,
        handoffClient: {
          fullName: contact.name || '',
          phone: contact.phone || '',
          email: contact.email || '',
          address: contactAddress,
        },
      },
    })
    setSelectedContactName(`${contact.name || 'Contact'} - Create Quote`)
  }

  function formatRelativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime()
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now'
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    if (diffMs < minute) return 'just now'
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
    if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`
    return new Date(iso).toLocaleDateString()
  }

  function closeDeleteModal() {
    if (isDeleting) return
    setDeleteModalContact(null)
  }

  function closeUpdateModal() {
    if (isSubmitting) return
    setUpdateModalContact(null)
  }

  function titleCase(value) {
    const text = String(value || '')
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown'
  }

  function shortContactLabel(contact) {
    const name = (contact?.name || '').trim()
    if (name) return name
    return contact?.email || contact?.phone || 'this contact'
  }

  const hasActiveFilters = search.trim() || sourceFilter !== 'all' || dateFilter !== 'all'

  return (
    <>
      {/* Stats row */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New this week</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">
                {isLoading ? '—' : newThisWeek}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">Past 7 days</p>
            </div>
            <span className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <UserPlus className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New this month</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">
                {isLoading ? '—' : newThisMonth}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">Past 30 days</p>
            </div>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total contacts</p>
              <p className="mt-2 text-3xl font-bold text-zinc-900">
                {isLoading ? '—' : contacts.length}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">All time</p>
            </div>
            <span className="rounded-lg bg-violet-50 p-2 text-violet-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold text-zinc-900">
              {hasActiveFilters ? 'Filtered contacts' : 'All contacts'}
            </h2>
            {!isLoading && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {filteredContacts.length} {filteredContacts.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts..."
                className="h-9 w-52 pl-8 text-sm"
              />
            </div>
            <Button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="h-9 text-sm">
              {showCreateForm ? 'Cancel' : '+ New Contact'}
            </Button>
          </div>
        </div>

        {/* Filter pills row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-5 py-2.5">
          {sourceOptions.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => setSourceFilter(source)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                sourceFilter === source
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100'
              )}>
              {source === 'all' ? 'All sources' : titleCase(source)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select
              className="h-7 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 outline-none focus:border-zinc-400"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}>
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
                onClick={() => { setSearch(''); setSourceFilter('all'); setDateFilter('all') }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div className="border-b border-zinc-200 px-5 py-5">
            <p className="mb-4 text-sm font-semibold text-zinc-700">New contact</p>
            <form onSubmit={handleCreateContact} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" placeholder="First name" value={formData.firstName} onChange={handleInputChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="middleName">Middle Name</Label>
                  <Input id="middleName" name="middleName" placeholder="Middle name" value={formData.middleName} onChange={handleInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" placeholder="Last name" value={formData.lastName} onChange={handleInputChange} required />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="Email" value={formData.email} onChange={handleInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" placeholder="Phone" value={formData.phone} onChange={handleInputChange} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addressLine1">Address Line 1</Label>
                <Input id="addressLine1" name="addressLine1" placeholder="Street address" value={formData.addressLine1} onChange={handleInputChange} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addressLine2">Address Line 2</Label>
                <Input id="addressLine2" name="addressLine2" placeholder="Apartment, suite, etc." value={formData.addressLine2} onChange={handleInputChange} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" placeholder="City" value={formData.city} onChange={handleInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" placeholder="AL" maxLength={2} value={formData.state} onChange={handleInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">ZIP Code</Label>
                  <Input id="postalCode" name="postalCode" placeholder="ZIP" value={formData.postalCode} onChange={handleInputChange} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Contact'}
                </Button>
                <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => { setShowCreateForm(false); setErrorMessage('') }}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Error banner */}
        {errorMessage && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <p className="py-16 text-center text-sm text-zinc-500">Loading contacts...</p>
        )}

        {/* Empty state */}
        {!isLoading && filteredContacts.length === 0 && (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">
              {contacts.length === 0 ? 'No contacts yet' : 'No contacts match your filters'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {contacts.length === 0
                ? 'Click "+ New Contact" above to get started.'
                : 'Try adjusting your search or clearing the filters.'}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && filteredContacts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
                <thead className="border-b border-zinc-200 bg-white">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Email / Phone</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Location</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Source</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredContacts.map((contact) => {
                    const badge = sourceBadge(contact.source)
                    return (
                      <tr
                        key={contact.id}
                        className="cursor-pointer transition-colors hover:bg-zinc-50"
                        onClick={() => handleContactClick(contact)}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', avatarColor(contact.name))}>
                              {getInitials(contact.name)}
                            </div>
                            <span className="text-sm font-semibold text-zinc-900">
                              {contact.name || 'Unnamed contact'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-zinc-600">
                          {contact.email || contact.phone || <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-zinc-600">
                          {[contact.city, contact.state].filter(Boolean).join(', ') || <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', badge.className)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-sm text-zinc-500">
                          {formatRelativeTime(contact.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </div>
        )}

        {/* Footer status line */}
        {selectedContactName && (
          <div className="border-t border-zinc-100 px-5 py-2.5">
            <p className="text-xs text-zinc-400">Selected: {selectedContactName}</p>
          </div>
        )}
      </div>

      {/* Contact detail modal */}
      {selectedContactDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', avatarColor(selectedContactDetail.name))}>
                  {getInitials(selectedContactDetail.name)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">{selectedContactDetail.name || 'Unnamed contact'}</h2>
                  <p className="text-xs text-zinc-500">{titleCase(selectedContactDetail.source || 'unknown')}</p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setSelectedContactDetail(null)}>Close</Button>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Email</p>
                <p className="mt-0.5 text-sm text-zinc-800">{selectedContactDetail.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Phone</p>
                <p className="mt-0.5 text-sm text-zinc-800">{selectedContactDetail.phone || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-zinc-400">Address</p>
                <p className="mt-0.5 text-sm text-zinc-800">
                  {[selectedContactDetail.addressLine1, selectedContactDetail.addressLine2, selectedContactDetail.city, selectedContactDetail.state, selectedContactDetail.postalCode]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Created</p>
                <p className="mt-0.5 text-sm text-zinc-800">{new Date(selectedContactDetail.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => openUpdateModal(selectedContactDetail)}>Edit Contact</Button>
              <Button type="button" variant="outline" onClick={() => openDeleteModal(selectedContactDetail)}>Delete Contact</Button>
              <Button type="button" variant="outline" onClick={() => handleCreateQuoteFromContact(selectedContactDetail)}>Create Quote</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete / archive modal */}
      {deleteModalContact ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeDeleteModal}
          onKeyDown={(event) => { if (event.key === 'Escape') closeDeleteModal() }}
          role="button"
          tabIndex={0}>
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true">
            <h3 className="text-base font-bold text-zinc-900">Archive Contact</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Are you sure you want to archive{' '}
              <span className="font-medium">{shortContactLabel(deleteModalContact)}</span>? This keeps the record in the system but hides it from active contacts.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDeleteModal} disabled={isDeleting}>Cancel</Button>
              <Button type="button" onClick={handleConfirmDeleteContact} disabled={isDeleting}>
                {isDeleting ? 'Archiving...' : 'Archive Contact'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Update modal */}
      {updateModalContact ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeUpdateModal}
          onKeyDown={(event) => { if (event.key === 'Escape') closeUpdateModal() }}
          role="button"
          tabIndex={0}>
          <div
            className="w-full max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true">
            <h3 className="text-base font-bold text-zinc-900">Update Contact</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Update details for <span className="font-medium">{shortContactLabel(updateModalContact)}</span>.
            </p>
            <form onSubmit={handleSubmitUpdateContact} className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="update-firstName">First Name</Label>
                  <Input id="update-firstName" name="firstName" value={updateFormData.firstName} onChange={handleUpdateInputChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-middleName">Middle Name</Label>
                  <Input id="update-middleName" name="middleName" value={updateFormData.middleName} onChange={handleUpdateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-lastName">Last Name</Label>
                  <Input id="update-lastName" name="lastName" value={updateFormData.lastName} onChange={handleUpdateInputChange} required />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="update-email">Email</Label>
                  <Input id="update-email" name="email" type="email" value={updateFormData.email} onChange={handleUpdateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-phone">Phone</Label>
                  <Input id="update-phone" name="phone" value={updateFormData.phone} onChange={handleUpdateInputChange} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-addressLine1">Address Line 1</Label>
                <Input id="update-addressLine1" name="addressLine1" value={updateFormData.addressLine1} onChange={handleUpdateInputChange} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-addressLine2">Address Line 2</Label>
                <Input id="update-addressLine2" name="addressLine2" value={updateFormData.addressLine2} onChange={handleUpdateInputChange} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="update-city">City</Label>
                  <Input id="update-city" name="city" value={updateFormData.city} onChange={handleUpdateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-state">State</Label>
                  <Input id="update-state" name="state" maxLength={2} value={updateFormData.state} onChange={handleUpdateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-postalCode">ZIP Code</Label>
                  <Input id="update-postalCode" name="postalCode" value={updateFormData.postalCode} onChange={handleUpdateInputChange} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeUpdateModal} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ContactsPage
