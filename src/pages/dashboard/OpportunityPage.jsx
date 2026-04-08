import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/apiClient'

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost']

function formatStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function OpportunityPage() {
  const [opportunities, setOpportunities] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [selectedOpportunity, setSelectedOpportunity] = useState('')

  const sorted = useMemo(
    () => [...opportunities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [opportunities]
  )

  useEffect(() => {
    let cancelled = false
    async function loadOpportunities() {
      try {
        const result = await apiRequest('/api/sales/opportunities')
        if (!cancelled) {
          setOpportunities(result.opportunities || [])
          setErrorMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Failed to load opportunities')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOpportunities()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleStatusChange(id, nextStatus) {
    setUpdatingId(id)
    try {
      const result = await apiRequest(`/api/sales/opportunities/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      const updated = result.opportunity
      setOpportunities((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to update status')
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <Card className="border-zinc-200 bg-white">
      <CardHeader>
        <CardTitle>Opportunity</CardTitle>
        <CardDescription>
          External leads from Thumbtack and other platforms land here for in-app management.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMessage && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading && <p className="text-sm text-zinc-500">Loading opportunities...</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-zinc-500">No opportunities yet. Incoming external leads will appear here.</p>
        )}

        {sorted.map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedOpportunity(item.name)}
                className="text-left">
                <p className="font-semibold text-zinc-900">{item.name}</p>
                <p className="text-sm text-zinc-600">{item.phone || item.email || 'No phone or email'}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[item.city, item.state].filter(Boolean).join(', ') || 'No location'} -{' '}
                  {item.source}
                </p>
                <p className="mt-1 text-xs text-zinc-400">Created: {formatDate(item.createdAt)}</p>
              </button>

              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  value={item.status}
                  disabled={updatingId === item.id}
                  onChange={(event) => handleStatusChange(item.id, event.target.value)}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={() => setSelectedOpportunity(`${item.name} - Open Contact`)}>
                  Open Contact
                </Button>
                <Button type="button" onClick={() => setSelectedOpportunity(`${item.name} - Create Quote`)}>
                  Create Quote
                </Button>
              </div>
            </div>
          </div>
        ))}

        <p className="pt-1 text-sm text-zinc-500">
          {selectedOpportunity
            ? `Selected: ${selectedOpportunity}`
            : 'Click an opportunity or action to start working it.'}
        </p>
      </CardContent>
    </Card>
  )
}

export default OpportunityPage
