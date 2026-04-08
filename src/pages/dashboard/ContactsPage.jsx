import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'

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
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'AL',
    postalCode: '',
  })
  const [updateFormData, setUpdateFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'AL',
    postalCode: '',
  })

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [contacts]
  )
  const sourceOptions = useMemo(() => {
    const set = new Set(sortedContacts.map((contact) => (contact.source || 'unknown').toLowerCase()))
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
        if (!cancelled) {
          setErrorMessage(error?.message || 'Failed to load contacts')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadContacts()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (shouldOpenCreateFromQuickAction) {
      setShowCreateForm(true)
    }
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
          firstName: formData.firstName,
          middleName: formData.middleName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
        }),
      })
      const created = result.contact
      setContacts((current) => [created, ...current])
      setFormData({
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: 'AL',
        postalCode: '',
      })
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
    const segments = String(contact?.name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
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
      firstName: nameParts.first,
      middleName: nameParts.middle,
      lastName: nameParts.last,
      email: contact.email || '',
      phone: contact.phone || '',
      addressLine1: contact.addressLine1 || '',
      addressLine2: contact.addressLine2 || '',
      city: contact.city || '',
      state: contact.state || 'AL',
      postalCode: contact.postalCode || '',
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
    navigate('/dashboard/ai-assistant', { state: { contactId: contact.id, startNewChat: true } })
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

  return (
    <>
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-3">
        {showCreateForm ? (
          <form
            onSubmit={handleCreateContact}
            className="space-y-4 rounded-lg border border-zinc-200 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="middleName">Middle Name</Label>
                <Input
                  id="middleName"
                  name="middleName"
                  placeholder="Middle name"
                  value={formData.middleName}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                placeholder="Street address"
                value={formData.addressLine1}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                name="addressLine2"
                placeholder="Apartment, suite, etc."
                value={formData.addressLine2}
                onChange={handleInputChange}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  placeholder="AL"
                  maxLength={2}
                  value={formData.state}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postalCode">ZIP Code</Label>
                <Input
                  id="postalCode"
                  name="postalCode"
                  placeholder="ZIP"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Contact'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => {
                  setShowCreateForm(false)
                  setErrorMessage('')
                }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            Use <span className="font-medium">Quick Actions - New Contact</span> to open the
            create contact form.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or phone..."
          />
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}>
                {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source === 'all' ? 'All sources' : titleCase(source)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">All dates</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        {errorMessage && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading && <p className="text-sm text-zinc-500">Loading contacts...</p>}

        {!isLoading && filteredContacts.length === 0 && (
          <p className="text-sm text-zinc-500">No contacts yet. Create your first contact above.</p>
        )}

        {!isLoading && filteredContacts.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Email / Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => handleContactClick(contact)}>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900">
                      {contact.name || 'Unnamed contact'}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{contact.email || contact.phone || 'No email or phone'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">
                      {[contact.city, contact.state].filter(Boolean).join(', ') || 'Alabama'}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{titleCase(contact.source || 'unknown')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                      {formatRelativeTime(contact.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="pt-1 text-sm text-zinc-500">
          {selectedContactName
            ? `Selected: ${selectedContactName}`
            : 'Click a contact row to select it.'}
        </p>
      </CardContent>
    </Card>
    {selectedContactDetail ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Contact Details</h2>
            <Button type="button" variant="outline" onClick={() => setSelectedContactDetail(null)}>
              Close
            </Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p className="text-sm text-zinc-700"><span className="font-semibold">Name:</span> {selectedContactDetail.name || 'Unnamed contact'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Source:</span> {titleCase(selectedContactDetail.source || 'unknown')}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Email:</span> {selectedContactDetail.email || '-'}</p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Phone:</span> {selectedContactDetail.phone || '-'}</p>
              <p className="text-sm text-zinc-700 sm:col-span-2">
                <span className="font-semibold">Address:</span>{' '}
                {[selectedContactDetail.addressLine1, selectedContactDetail.addressLine2, selectedContactDetail.city, selectedContactDetail.state, selectedContactDetail.postalCode]
                  .filter(Boolean)
                  .join(', ') || '-'}
              </p>
              <p className="text-sm text-zinc-700"><span className="font-semibold">Created:</span> {new Date(selectedContactDetail.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" onClick={() => openUpdateModal(selectedContactDetail)}>
                Edit Contact
              </Button>
              <Button type="button" variant="outline" onClick={() => openDeleteModal(selectedContactDetail)}>
                Delete Contact
              </Button>
              <Button type="button" variant="outline" onClick={() => handleCreateQuoteFromContact(selectedContactDetail)}>
                Create Quote
              </Button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {deleteModalContact ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
        onClick={closeDeleteModal}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeDeleteModal()
        }}
        role="button"
        tabIndex={0}>
        <div
          className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true">
          <h3 className="text-lg font-semibold text-zinc-900">Archive Contact</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Are you sure you want to archive <span className="font-medium">{shortContactLabel(deleteModalContact)}</span>?
            This keeps the record in the system but hides it from active contacts.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDeleteModal} disabled={isDeleting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmDeleteContact} disabled={isDeleting}>
              {isDeleting ? 'Archiving...' : 'Archive Contact'}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    {updateModalContact ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
        onClick={closeUpdateModal}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeUpdateModal()
        }}
        role="button"
        tabIndex={0}>
        <div
          className="w-full max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-lg"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true">
          <h3 className="text-lg font-semibold text-zinc-900">Update Contact</h3>
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
              <Button type="button" variant="outline" onClick={closeUpdateModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
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
