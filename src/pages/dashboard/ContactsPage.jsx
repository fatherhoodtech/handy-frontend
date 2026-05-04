import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiRequest } from '@/lib/apiClient'
import { avatarColor, cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { Search, TrendingUp, Users, UserPlus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

function sourceBadge(source) {
  const s = (source || 'unknown').toLowerCase()
  if (s === 'jobber') return { label: 'Jobber', dot: 'bg-[#262742]', className: 'bg-[#262742]/10 text-[#1a1b30] border-[#262742]/30' }
  if (s === 'thumbtack') return { label: 'Thumbtack', dot: 'bg-amber-500', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (s === 'manual') return { label: 'Active', dot: 'bg-emerald-500', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (s === 'unknown') return { label: 'Unknown', dot: 'bg-zinc-400', className: 'bg-zinc-50 text-zinc-600 border-zinc-200' }
  return { label: s.charAt(0).toUpperCase() + s.slice(1), dot: 'bg-zinc-400', className: 'bg-zinc-50 text-zinc-600 border-zinc-200' }
}

function ContactsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedContactDetail, setSelectedContactDetail] = useState(null)
  const [selectedContactName, setSelectedContactName] = useState('')
  const [deleteModalContact, setDeleteModalContact] = useState(null)
  const [updateModalContact, setUpdateModalContact] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [updateFormData, setUpdateFormData] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '',
    addressLine1: '', addressLine2: '',
    city: '', state: 'AL', postalCode: '',
  })
  const [didAutoOpenEdit, setDidAutoOpenEdit] = useState(false)
  const [pendingAutoEditContact, setPendingAutoEditContact] = useState(null)
  const [requiredContactFieldKeys, setRequiredContactFieldKeys] = useState([])
  const [createFormData, setCreateFormData] = useState({
    firstName: '', middleName: '', lastName: '',
    email: '', phone: '',
    addressLine1: '', addressLine2: '',
    city: '', state: 'AL', postalCode: '',
  })

  function contactActionErrorMessage(error, fallbackMessage) {
    const status = Number(error?.status || 0)
    if (status >= 500) {
      return 'We could not complete this action right now. Please try again, and if it keeps happening contact your admin.'
    }
    return error?.message || fallbackMessage
  }

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [contacts]
  )
  const filteredContacts = useMemo(() => {
    const now = Date.now()
    return sortedContacts.filter((contact) => {
      const searchText = `${contact.name || ''} ${contact.email || ''} ${contact.phone || ''}`.toLowerCase()
      const matchesSearch = search.trim() === '' || searchText.includes(search.trim().toLowerCase())
      const createdAtMs = new Date(contact.createdAt).getTime()
      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === 'today' && (() => {
          const created = new Date(contact.createdAt)
          const current = new Date()
          return (
            created.getFullYear() === current.getFullYear() &&
            created.getMonth() === current.getMonth() &&
            created.getDate() === current.getDate()
          )
        })()) ||
        (dateFilter === '7d' && now - createdAtMs <= 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === '30d' && now - createdAtMs <= 30 * 24 * 60 * 60 * 1000)
      return matchesSearch && matchesDate
    })
  }, [sortedContacts, search, dateFilter])

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
    if (didAutoOpenEdit) return
    const state = location.state
    if (!state || state.openContactEdit !== true) return
    if (!Array.isArray(contacts) || contacts.length === 0) return

    const hint = state.contactHint || {}
    const missingContactFields = Array.isArray(state.missingContactFields) ? state.missingContactFields : []
    setRequiredContactFieldKeys(
      missingContactFields
        .map((field) => String(field || '').trim().toLowerCase())
        .map((field) => {
          if (field === 'client.fullname') return 'fullName'
          if (field === 'client.phoneoremail') return 'phoneOrEmail'
          if (field === 'client.address.street1') return 'addressLine1'
          if (field === 'client.address.city') return 'city'
          if (field === 'client.address.state') return 'state'
          if (field === 'client.address.zip') return 'postalCode'
          return ''
        })
        .filter(Boolean)
    )
    const contactId = String(hint.id || '').trim()
    const email = String(hint.email || '').trim().toLowerCase()
    const phone = String(hint.phone || '').replace(/\D+/g, '')
    const name = String(hint.name || '').trim().toLowerCase()

    const matchById = contactId
      ? contacts.find((c) => String(c.id || '').trim() === contactId)
      : null
    const matchByEmail = !matchById && email
      ? contacts.find((c) => String(c.email || '').trim().toLowerCase() === email)
      : null
    const matchByPhone = !matchById && !matchByEmail && phone
      ? contacts.find((c) => String(c.phone || '').replace(/\D+/g, '') === phone)
      : null
    const matchByName = !matchById && !matchByEmail && !matchByPhone && name
      ? contacts.find((c) => String(c.name || '').trim().toLowerCase() === name)
      : null
    const selected = matchById || matchByEmail || matchByPhone || matchByName

    if (selected) {
      // Defer opening until after Contacts page has painted with loaded data.
      setPendingAutoEditContact(selected)
    } else {
      // Never leave the page filtered to an empty list on failed auto-match.
      setSearch('')
    }
    setDidAutoOpenEdit(true)
    navigate('/dashboard/contacts', { replace: true })
  }, [contacts, didAutoOpenEdit, location.state, navigate])

  useEffect(() => {
    if (!pendingAutoEditContact) return
    const timer = window.setTimeout(() => {
      handleContactClick(pendingAutoEditContact)
      openUpdateModal(pendingAutoEditContact)
      setPendingAutoEditContact(null)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [pendingAutoEditContact])

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

  function openCreateModal() {
    setCreateFormData({
      firstName: '', middleName: '', lastName: '',
      email: '', phone: '',
      addressLine1: '', addressLine2: '',
      city: '', state: 'AL', postalCode: '',
    })
    setCreateModalOpen(true)
  }

  function closeCreateModal() {
    if (isSubmitting) return
    setCreateModalOpen(false)
  }

  function handleCreateInputChange(event) {
    const { name, value } = event.target
    setCreateFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmitCreateContact(event) {
    event.preventDefault()
    try {
      setErrorMessage('')
      setIsSubmitting(true)
      const response = await apiRequest('/api/sales/contacts', {
        method: 'POST',
        body: JSON.stringify(createFormData),
      })
      const created = response?.contact
      if (created?.id) {
        setContacts((current) => [created, ...current])
        setSelectedContactName(`${created.name || 'Contact'} - Created`)
      }
      setCreateModalOpen(false)
    } catch (error) {
      setErrorMessage(contactActionErrorMessage(error, 'Failed to create contact'))
    } finally {
      setIsSubmitting(false)
    }
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

  function isRequiredField(key) {
    return requiredContactFieldKeys.includes(key)
  }

  function requiredInputClass(key) {
    return isRequiredField(key) ? 'border-red-400 focus:border-red-500 focus-visible:ring-red-500/40' : ''
  }

  const hasActiveFilters = search.trim() || dateFilter !== 'all'

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
            <span className="rounded-lg bg-[#262742]/10 p-2 text-[#1a1b30]">
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
      <div className="rounded-xl border border-zinc-200 bg-white [overflow:clip]">

        {/* Sticky banner: toolbar + column headers */}
        <div className="sticky top-0 z-20 bg-white">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-zinc-900">
                {hasActiveFilters ? 'Filtered contacts' : 'All contacts'}
              </h2>
              {!isLoading && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                  {filteredContacts.length} {filteredContacts.length === 1 ? 'result' : 'results'}
                </span>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-1">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search contacts..."
                    className="h-9 w-full rounded-lg border-zinc-200 pl-8 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-[#262742]"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}>
                    <option value="all">All time</option>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                  </select>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                      onClick={() => { setSearch(''); setDateFilter('all') }}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                className="h-9 shrink-0 bg-[#262742] px-4 text-white hover:bg-[#1a1b30]"
                onClick={openCreateModal}>
                  New Contact
              </Button>
            </div>
          </div>
          {/* Column headers (outside <table> so they stay sticky with the toolbar) */}
          <div className="hidden border-b border-zinc-200 md:block">
            <table className="min-w-full table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Email / Phone</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Location</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Source</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Added</th>
                </tr>
              </thead>
            </table>
          </div>
        </div>

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
                ? 'Contacts are synced automatically from Jobber.'
                : 'Try adjusting your search or clearing the filters.'}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && filteredContacts.length > 0 && (
          <div>
            <div className="divide-y divide-zinc-100 md:hidden">
              {filteredContacts.map((contact) => {
                const badge = sourceBadge(contact.source)
                return (
                  <button
                    key={contact.id}
                    type="button"
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                    onClick={() => handleContactClick(contact)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-zinc-900">{contact.name || 'Unnamed contact'}</p>
                        {(contact.email || contact.phone) ? (
                          <p className="truncate text-sm text-zinc-600">{contact.email || contact.phone}</p>
                        ) : null}
                      </div>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', badge.className)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} />
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {[contact.addressLine1, contact.city, contact.state, contact.postalCode].filter(Boolean).join(', ') || '—'}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">{formatRelativeTime(contact.createdAt)}</p>
                  </button>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full table-fixed">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[22%]" />
                    <col className="w-[28%]" />
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                  </colgroup>
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
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={() => openUpdateModal(selectedContactDetail)}>Edit Contact</Button>
              <Button type="button" variant="outline" onClick={() => openDeleteModal(selectedContactDetail)}>Delete Contact</Button>
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
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true">
            <h3 className="text-base font-bold text-zinc-900">Update Contact</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Update details for <span className="font-medium">{shortContactLabel(updateModalContact)}</span>.
            </p>
            <form onSubmit={handleSubmitUpdateContact} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="update-firstName">First Name</Label>
                  <Input id="update-firstName" name="firstName" value={updateFormData.firstName} onChange={handleUpdateInputChange} className={requiredInputClass('fullName')} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-middleName">Middle Name</Label>
                  <Input id="update-middleName" name="middleName" value={updateFormData.middleName} onChange={handleUpdateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-lastName">Last Name</Label>
                  <Input id="update-lastName" name="lastName" value={updateFormData.lastName} onChange={handleUpdateInputChange} className={requiredInputClass('fullName')} required />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="update-email">Email</Label>
                  <Input id="update-email" name="email" type="email" value={updateFormData.email} onChange={handleUpdateInputChange} className={requiredInputClass('phoneOrEmail')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-phone">Phone</Label>
                  <Input id="update-phone" name="phone" value={updateFormData.phone} onChange={handleUpdateInputChange} className={requiredInputClass('phoneOrEmail')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-addressLine1">Address Line 1</Label>
                <Input id="update-addressLine1" name="addressLine1" value={updateFormData.addressLine1} onChange={handleUpdateInputChange} className={requiredInputClass('addressLine1')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-addressLine2">Address Line 2</Label>
                <Input id="update-addressLine2" name="addressLine2" value={updateFormData.addressLine2} onChange={handleUpdateInputChange} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="update-city">City</Label>
                  <Input id="update-city" name="city" value={updateFormData.city} onChange={handleUpdateInputChange} className={requiredInputClass('city')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-state">State</Label>
                  <Input id="update-state" name="state" maxLength={2} value={updateFormData.state} onChange={handleUpdateInputChange} className={requiredInputClass('state')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="update-postalCode">ZIP Code</Label>
                  <Input id="update-postalCode" name="postalCode" value={updateFormData.postalCode} onChange={handleUpdateInputChange} className={requiredInputClass('postalCode')} />
                </div>
              </div>
              {requiredContactFieldKeys.length > 0 ? (
                <p className="text-xs text-red-600">
                  Red bordered fields are required for Jobber sync.
                </p>
              ) : null}
              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-100 bg-white pt-3">
                <Button type="button" variant="outline" onClick={closeUpdateModal} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Create modal */}
      {createModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeCreateModal}
          onKeyDown={(event) => { if (event.key === 'Escape') closeCreateModal() }}
          role="button"
          tabIndex={0}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true">
            <h3 className="text-base font-bold text-zinc-900">Create Contact</h3>
            <p className="mt-1 text-sm text-zinc-600">Add the client details needed for quotes and Jobber sync.</p>
            <form onSubmit={handleSubmitCreateContact} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="create-firstName">First Name</Label>
                  <Input id="create-firstName" name="firstName" value={createFormData.firstName} onChange={handleCreateInputChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-middleName">Middle Name</Label>
                  <Input id="create-middleName" name="middleName" value={createFormData.middleName} onChange={handleCreateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-lastName">Last Name</Label>
                  <Input id="create-lastName" name="lastName" value={createFormData.lastName} onChange={handleCreateInputChange} required />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-email">Email</Label>
                  <Input id="create-email" name="email" type="email" value={createFormData.email} onChange={handleCreateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-phone">Phone</Label>
                  <Input id="create-phone" name="phone" value={createFormData.phone} onChange={handleCreateInputChange} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-addressLine1">Address Line 1</Label>
                <Input id="create-addressLine1" name="addressLine1" value={createFormData.addressLine1} onChange={handleCreateInputChange} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-addressLine2">Address Line 2</Label>
                <Input id="create-addressLine2" name="addressLine2" value={createFormData.addressLine2} onChange={handleCreateInputChange} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="create-city">City</Label>
                  <Input id="create-city" name="city" value={createFormData.city} onChange={handleCreateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-state">State</Label>
                  <Input id="create-state" name="state" maxLength={2} value={createFormData.state} onChange={handleCreateInputChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-postalCode">ZIP Code</Label>
                  <Input id="create-postalCode" name="postalCode" value={createFormData.postalCode} onChange={handleCreateInputChange} />
                </div>
              </div>
              <p className="text-xs text-zinc-500">First name + last name and at least one of email or phone are required.</p>
              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-100 bg-white pt-3">
                <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" className="bg-[#262742] text-white hover:bg-[#1a1b30]" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Contact'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ContactsPage
