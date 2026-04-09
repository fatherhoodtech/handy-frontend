import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { History } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function centsToDollarInput(value) {
  const cents = toInt(value)
  return (cents / 100).toFixed(2)
}

function dollarsToCents(value) {
  const raw = String(value ?? '').trim().replace(/[^0-9.]/g, '')
  if (!raw) return 0
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

function buildLaborLabel(trade, expertiseLevel) {
  const cleanTrade = String(trade ?? '').trim() || 'Labor'
  const cleanLevel = String(expertiseLevel ?? '').trim() || 'standard'
  return `${cleanTrade} (${cleanLevel}) labor`
}

function recalcDraft(draft) {
  const normalizedLineItems = draft.lineItems.map((item) => {
    const isLabor = item.itemType === 'labor'
    const quantity = isLabor ? toInt(item.hours) : toInt(item.quantity)
    const unitPriceCents = isLabor ? toInt(item.hourlyRateCents) : toInt(item.unitPriceCents)
    return {
      ...item,
      productOrServiceName: isLabor
        ? buildLaborLabel(item.trade, item.expertiseLevel)
        : String(item.productOrServiceName ?? ''),
      quantity,
      unitPriceCents,
      totalPriceCents: quantity * unitPriceCents,
    }
  })

  const subtotalCents = normalizedLineItems.reduce((sum, item) => sum + item.totalPriceCents, 0)
  const discountCents = toInt(draft.clientView.discountCents)
  const taxCents = toInt(draft.clientView.taxCents)
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents)

  return {
    ...draft,
    lineItems: normalizedLineItems,
    clientView: {
      ...draft.clientView,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
    },
  }
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      const role = entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : null
      if (!role) return null
      const text = String(entry?.text ?? '').trim()
      if (!text) return null
      return {
        id: String(entry?.id ?? `${role}-${Date.now()}-${index}`),
        role,
        text,
        createdAt: String(entry?.createdAt ?? new Date().toISOString()),
      }
    })
    .filter(Boolean)
}

function createDefaultQuoteDraft() {
  return recalcDraft({
    title: '',
    quoteDescription: '',
    client: { fullName: '', phone: '', email: '', address: '' },
    salespersonName: '',
    lineItems: [],
    clientView: {
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
    },
    attachments: [{ url: '', name: '' }],
  })
}

function AiAssistantPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [quoteDraft, setQuoteDraft] = useState(createDefaultQuoteDraft)
  const [messages, setMessages] = useState([])
  const [clientOptions, setClientOptions] = useState([])
  const [clientSearch, setClientSearch] = useState('')
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false)
  const [isLoadingClientOptions, setIsLoadingClientOptions] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogItems, setCatalogItems] = useState([])
  const [catalogSelectionId, setCatalogSelectionId] = useState('')
  const [isLoadingCatalogItems, setIsLoadingCatalogItems] = useState(false)
  const [laborOptions, setLaborOptions] = useState([])
  const [isLoadingLaborOptions, setIsLoadingLaborOptions] = useState(false)
  const [laborTradeSearch, setLaborTradeSearch] = useState('')
  const [laborTradeSuggestions, setLaborTradeSuggestions] = useState([])
  const [isLoadingLaborTradeSuggestions, setIsLoadingLaborTradeSuggestions] = useState(false)
  const [activeLaborTradeRow, setActiveLaborTradeRow] = useState(-1)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isSavingClient, setIsSavingClient] = useState(false)
  const [isLoadingThread, setIsLoadingThread] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [draftUpdated, setDraftUpdated] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isApprovingQuote, setIsApprovingQuote] = useState(false)
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyRecords, setHistoryRecords] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [chatError, setChatError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const chatViewportRef = useRef(null)
  const chatBottomRef = useRef(null)
  const clientPickerRef = useRef(null)
  const didLoadThreadRef = useRef(false)
  const didHandleContactHandoffRef = useRef(false)
  const didHandleQuoteResumeRef = useRef(false)

  function scrollToLatest(behavior = 'smooth') {
    chatBottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }

  useEffect(() => {
    let isCancelled = false

    async function loadThread() {
      try {
        setIsLoadingThread(true)
        const threadResponse = await apiRequest('/api/sales/ai-assistant/thread')
        if (isCancelled) return
        setMessages(normalizeMessages(threadResponse?.messages))
        if (threadResponse?.quoteDraft) {
          setQuoteDraft(recalcDraft(threadResponse.quoteDraft))
        }
        setSelectedClientId(threadResponse?.selectedClientId ?? '')
        didLoadThreadRef.current = true
        requestAnimationFrame(() => scrollToLatest('auto'))
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Could not load AI assistant thread')
      } finally {
        if (!isCancelled) setIsLoadingThread(false)
      }
    }

    loadThread()
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const resumeQuoteId = location.state?.resumeQuoteId
    if (!resumeQuoteId || didHandleQuoteResumeRef.current) return
    didHandleQuoteResumeRef.current = true
    let cancelled = false
    async function runQuoteResume() {
      try {
        setChatError('')
        setActionNotice('')
        const response = await apiRequest(`/api/sales/quotes/${encodeURIComponent(resumeQuoteId)}/continue`, {
          method: 'POST',
        })
        if (cancelled) return
        setMessages(normalizeMessages(response?.messages))
        if (response?.quoteDraft) setQuoteDraft(recalcDraft(response.quoteDraft))
        setSelectedClientId(response?.selectedClientId ?? '')
        setDraftUpdated(false)
        setActionNotice('Draft quote loaded into AI Assistant. Continue editing below.')
        navigate(location.pathname, { replace: true, state: null })
        requestAnimationFrame(() => scrollToLatest('auto'))
      } catch (error) {
        if (cancelled) return
        setChatError(error?.message || 'Failed to load selected draft quote')
      }
    }
    void runQuoteResume()
    return () => {
      cancelled = true
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    const handoffContactId = location.state?.contactId
    const shouldStartNewChat = Boolean(location.state?.startNewChat)
    if (!handoffContactId || !shouldStartNewChat || didHandleContactHandoffRef.current) return
    didHandleContactHandoffRef.current = true
    let cancelled = false
    async function runContactHandoff() {
      try {
        setChatError('')
        setActionNotice('')
        setIsCreatingNewChat(true)
        const resetResponse = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
        if (cancelled) return
        setMessages(normalizeMessages(resetResponse?.messages))
        if (resetResponse?.quoteDraft) setQuoteDraft(recalcDraft(resetResponse.quoteDraft))
        const clientResponse = await apiRequest('/api/sales/ai-assistant/thread/client', {
          method: 'PATCH',
          body: JSON.stringify({ selectedClientId: handoffContactId }),
        })
        if (cancelled) return
        if (clientResponse?.quoteDraft) setQuoteDraft(recalcDraft(clientResponse.quoteDraft))
        if (Array.isArray(clientResponse?.messages)) setMessages(normalizeMessages(clientResponse.messages))
        setSelectedClientId(clientResponse?.selectedClientId ?? handoffContactId)
        setActionNotice('New chat started with selected contact from Contacts.')
        navigate(location.pathname, { replace: true, state: null })
      } catch (error) {
        if (cancelled) return
        setChatError(error?.message || 'Failed to start new chat from selected contact')
      } finally {
        if (!cancelled) setIsCreatingNewChat(false)
      }
    }
    void runContactHandoff()
    return () => {
      cancelled = true
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    let isCancelled = false
    const timer = setTimeout(async () => {
      try {
        setIsLoadingClientOptions(true)
        const search = clientSearch.trim()
        const response = await apiRequest(
          `/api/sales/ai-assistant/clients?q=${encodeURIComponent(search)}&limit=40`
        )
        if (isCancelled) return
        setClientOptions(Array.isArray(response?.clients) ? response.clients : [])
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Failed to load client options')
      } finally {
        if (!isCancelled) setIsLoadingClientOptions(false)
      }
    }, 250)
    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [clientSearch])

  useEffect(() => {
    let isCancelled = false
    const timer = setTimeout(async () => {
      try {
        const q = catalogSearch.trim()
        if (!q) {
          setCatalogItems([])
          setCatalogSelectionId('')
          setIsLoadingCatalogItems(false)
          return
        }
        setIsLoadingCatalogItems(true)
        const response = await apiRequest(
          `/api/sales/ai-assistant/catalog-items?q=${encodeURIComponent(q)}&limit=60`
        )
        if (isCancelled) return
        const items = Array.isArray(response?.items) ? response.items : []
        setCatalogItems(items)
        if (items.length > 0 && !catalogSelectionId) {
          setCatalogSelectionId(String(items[0].id))
        }
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Failed to load catalog items')
      } finally {
        if (!isCancelled) setIsLoadingCatalogItems(false)
      }
    }, 250)
    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [catalogSearch])

  useEffect(() => {
    let isCancelled = false
    async function loadLaborOptions() {
      try {
        setIsLoadingLaborOptions(true)
        const response = await apiRequest('/api/sales/ai-assistant/labor-options?limit=200')
        if (isCancelled) return
        setLaborOptions(Array.isArray(response?.items) ? response.items : [])
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Failed to load labor options')
      } finally {
        if (!isCancelled) setIsLoadingLaborOptions(false)
      }
    }
    void loadLaborOptions()
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!Array.isArray(laborOptions) || laborOptions.length === 0) return
    setQuoteDraft((current) => {
      let changed = false
      const lineItems = current.lineItems.map((item) => {
        if (item.itemType !== 'labor') return item
        const trade = String(item.trade ?? '').trim().toLowerCase()
        const expertiseLevel = String(item.expertiseLevel ?? '').trim().toLowerCase() || 'standard'
        const match = laborOptions.find(
          (option) =>
            String(option.trade ?? '').trim().toLowerCase() === trade &&
            String(option.expertiseLevel ?? '').trim().toLowerCase() === expertiseLevel
        )
        if (!match) return item
        const nextRate = toInt(match.hourlyRateCents)
        if (toInt(item.hourlyRateCents) === nextRate) return item
        changed = true
        return { ...item, hourlyRateCents: nextRate }
      })
      if (!changed) return current
      return recalcDraft({ ...current, lineItems })
    })
  }, [laborOptions])

  useEffect(() => {
    let isCancelled = false
    const timer = setTimeout(async () => {
      try {
        const q = laborTradeSearch.trim()
        if (!q) {
          setLaborTradeSuggestions([])
          setIsLoadingLaborTradeSuggestions(false)
          return
        }
        setIsLoadingLaborTradeSuggestions(true)
        const response = await apiRequest(
          `/api/sales/ai-assistant/labor-options?q=${encodeURIComponent(q)}&limit=80`
        )
        if (isCancelled) return
        const items = Array.isArray(response?.items) ? response.items : []
        const uniqueTrades = [...new Set(items.map((item) => item.trade).filter(Boolean))]
        setLaborTradeSuggestions(uniqueTrades)
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Failed to search labor trades')
      } finally {
        if (!isCancelled) setIsLoadingLaborTradeSuggestions(false)
      }
    }, 250)
    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [laborTradeSearch])

  useEffect(() => {
    if (!historyOpen) return
    let isCancelled = false
    const timer = setTimeout(async () => {
      try {
        setIsLoadingHistory(true)
        const response = await apiRequest(
          `/api/sales/ai-assistant/history?q=${encodeURIComponent(historySearch.trim())}`
        )
        if (isCancelled) return
        setHistoryRecords(Array.isArray(response?.history) ? response.history : [])
      } catch (error) {
        if (isCancelled) return
        setChatError(error?.message || 'Failed to load chat history')
      } finally {
        if (!isCancelled) setIsLoadingHistory(false)
      }
    }, 250)
    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [historyOpen, historySearch])

  useEffect(() => {
    function handleClickOutside(event) {
      if (!clientPickerRef.current?.contains(event.target)) {
        setIsClientPickerOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!didLoadThreadRef.current) return
    if (isNearBottom) {
      setShowJumpToLatest(false)
      requestAnimationFrame(() => scrollToLatest('smooth'))
      return
    }
    setShowJumpToLatest(true)
  }, [messages, isNearBottom])

  function handleChatScroll() {
    const el = chatViewportRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom < 56
    setIsNearBottom(nearBottom)
    if (nearBottom) setShowJumpToLatest(false)
  }

  function updateQuoteField(key, value) {
    setQuoteDraft((current) => ({ ...current, [key]: value }))
  }

  function updateLineItem(index, key, value) {
    setQuoteDraft((current) => {
      const lineItems = current.lineItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        return { ...item, [key]: value }
      })
      return recalcDraft({ ...current, lineItems })
    })
  }

  function addCustomLineItem() {
    setQuoteDraft((current) =>
      recalcDraft({
        ...current,
        lineItems: [
          ...current.lineItems,
          {
            productOrServiceName: '',
            quantity: 1,
            unitPriceCents: 0,
            totalPriceCents: 0,
          },
        ],
      })
    )
  }

  function addLaborLineItem() {
    const fallback = laborOptions[0] ?? null
    setQuoteDraft((current) =>
      recalcDraft({
        ...current,
        lineItems: [
          ...current.lineItems,
          {
            itemType: 'labor',
            trade: fallback?.trade ?? 'general_handyman',
            expertiseLevel: fallback?.expertiseLevel ?? 'standard',
            hours: 1,
            hourlyRateCents: toInt(fallback?.hourlyRateCents),
            productOrServiceName: buildLaborLabel(
              fallback?.trade ?? 'general_handyman',
              fallback?.expertiseLevel ?? 'standard'
            ),
            quantity: 1,
            unitPriceCents: toInt(fallback?.hourlyRateCents),
            totalPriceCents: 0,
          },
        ],
      })
    )
  }

  function removeLineItem(index) {
    setQuoteDraft((current) => {
      const nextLineItems = current.lineItems.filter((_, idx) => idx !== index)
      return recalcDraft({ ...current, lineItems: nextLineItems })
    })
  }

  function updateLaborLineItem(index, key, value) {
    setQuoteDraft((current) => {
      const lineItems = current.lineItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        if (item.itemType !== 'labor') return item
        const next = { ...item, [key]: value }
        const trade = String(next.trade ?? '').trim().toLowerCase()
        const expertiseLevel = String(next.expertiseLevel ?? '').trim().toLowerCase() || 'standard'
        const matchedRate = laborOptions.find(
          (option) =>
            String(option.trade ?? '').trim().toLowerCase() === trade &&
            String(option.expertiseLevel ?? '').trim().toLowerCase() === expertiseLevel
        )?.hourlyRateCents
        return {
          ...next,
          hourlyRateCents: typeof matchedRate === 'number' ? toInt(matchedRate) : 0,
        }
      })
      return recalcDraft({ ...current, lineItems })
    })
  }

  function addCatalogLineItem() {
    const selected = catalogItems.find((item) => String(item.id) === catalogSelectionId)
    if (!selected) return
    setQuoteDraft((current) =>
      recalcDraft({
        ...current,
        lineItems: [
          ...current.lineItems,
          {
            productOrServiceName: selected.name,
            quantity: 1,
            unitPriceCents: toInt(selected.unitPriceCents),
            totalPriceCents: toInt(selected.unitPriceCents),
          },
        ],
      })
    )
  }

  function updateTotalsField(key, value) {
    setQuoteDraft((current) =>
      recalcDraft({
        ...current,
        clientView: { ...current.clientView, [key]: value },
      })
    )
  }

  function updateAttachment(index, key, value) {
    setQuoteDraft((current) => ({
      ...current,
      attachments: (() => {
        const next = [...(current.attachments?.length ? current.attachments : [{ url: '', name: '' }])]
        while (next.length <= index) {
          next.push({ url: '', name: '' })
        }
        next[index] = { ...next[index], [key]: value }
        return next
      })(),
    }))
  }

  async function handleSend() {
    const trimmed = prompt.trim()
    if (!trimmed || isSending || !selectedClientId) return

    const optimisticUserMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    }
    setMessages((current) => [...current, optimisticUserMessage])
    setPrompt('')
    setChatError('')
    setIsSending(true)

    try {
      const response = await apiRequest('/api/sales/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed }),
      })
      setMessages(normalizeMessages(response?.messages))
      if (response?.quoteDraft) {
        setQuoteDraft(recalcDraft(response.quoteDraft))
      }
      setDraftUpdated(Boolean(response?.draftUpdated))
    } catch (error) {
      setChatError(error?.message || 'AI assistant request failed')
    } finally {
      setIsSending(false)
    }
  }

  async function handleSelectClient(clientId) {
    setSelectedClientId(clientId)
    if (!clientId) return
    setChatError('')
    setIsSavingClient(true)
    try {
      const response = await apiRequest('/api/sales/ai-assistant/thread/client', {
        method: 'PATCH',
        body: JSON.stringify({ selectedClientId: clientId }),
      })
      if (response?.quoteDraft) {
        setQuoteDraft(recalcDraft(response.quoteDraft))
      }
      if (Array.isArray(response?.messages)) {
        setMessages(normalizeMessages(response.messages))
      }
      setSelectedClientId(response?.selectedClientId ?? clientId)
      setIsClientPickerOpen(false)
    } catch (error) {
      setChatError(error?.message || 'Failed to set selected client')
    } finally {
      setIsSavingClient(false)
    }
  }

  async function handleSaveDraft() {
    if (!selectedClientId || isSavingDraft || isCreatingNewChat) return
    setChatError('')
    setActionNotice('')
    setIsSavingDraft(true)
    try {
      const response = await apiRequest('/api/sales/ai-assistant/draft/save', { method: 'POST' })
      const quoteId = String(response?.quote?.id ?? '')
      const resetResponse = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
      setMessages(normalizeMessages(resetResponse?.messages))
      if (resetResponse?.quoteDraft) setQuoteDraft(recalcDraft(resetResponse.quoteDraft))
      setSelectedClientId('')
      setClientSearch('')
      setDraftUpdated(false)
      setCatalogSearch('')
      setCatalogSelectionId('')
      setActionNotice(
        quoteId
          ? `Draft saved successfully (${quoteId.slice(0, 8)}). Started a new blank draft.`
          : 'Draft saved successfully. Started a new blank draft.'
      )
      requestAnimationFrame(() => scrollToLatest('auto'))
    } catch (error) {
      setChatError(error?.message || 'Failed to save draft quote')
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handleApproveQuote() {
    if (!selectedClientId || isApprovingQuote) return
    setChatError('')
    setActionNotice('')
    setIsApprovingQuote(true)
    try {
      const response = await apiRequest('/api/sales/ai-assistant/draft/approve', { method: 'POST' })
      const quoteId = String(response?.quote?.id ?? '')
      const syncStatus = String(response?.jobberSync?.status ?? '')
      const syncError = String(response?.jobberSync?.error ?? '')
      const jobberQuoteId = String(response?.jobberSync?.jobberQuoteId ?? '')
      const resetResponse = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
      setMessages(normalizeMessages(resetResponse?.messages))
      if (resetResponse?.quoteDraft) setQuoteDraft(recalcDraft(resetResponse.quoteDraft))
      setSelectedClientId('')
      setClientSearch('')
      setDraftUpdated(false)
      setCatalogSearch('')
      setCatalogSelectionId('')
      setLaborTradeSearch('')
      setLaborTradeSuggestions([])
      setActiveLaborTradeRow(-1)
      setActionNotice(
        syncStatus === 'synced'
          ? `Quote approved (${quoteId.slice(0, 8)}) and synced to Jobber${jobberQuoteId ? ` (${jobberQuoteId.slice(0, 10)})` : ''}. Started a new blank draft.`
          : syncStatus === 'failed'
            ? `Quote approved locally (${quoteId.slice(0, 8)}), but Jobber sync failed${syncError ? `: ${syncError}` : '.'} Started a new blank draft.`
            : quoteId
              ? `Quote approved and saved (${quoteId.slice(0, 8)}). Started a new blank draft.`
              : 'Quote approved and saved. Started a new blank draft.'
      )
      requestAnimationFrame(() => scrollToLatest('auto'))
    } catch (error) {
      setChatError(error?.message || 'Failed to approve quote')
    } finally {
      setIsApprovingQuote(false)
    }
  }

  async function handleNewChat() {
    if (isCreatingNewChat) return
    setChatError('')
    setActionNotice('')
    setIsCreatingNewChat(true)
    try {
      const response = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
      setMessages(normalizeMessages(response?.messages))
      if (response?.quoteDraft) setQuoteDraft(recalcDraft(response.quoteDraft))
      setSelectedClientId('')
      setClientSearch('')
      setDraftUpdated(false)
      setHistoryOpen(false)
    } catch (error) {
      setChatError(error?.message || 'Failed to start a new chat')
    } finally {
      setIsCreatingNewChat(false)
    }
  }

  async function handleOpenHistorySession(historyId) {
    try {
      setActionNotice('')
      const response = await apiRequest(`/api/sales/ai-assistant/history/${historyId}`)
      setMessages(normalizeMessages(response?.messages))
      if (response?.quoteDraft) setQuoteDraft(recalcDraft(response.quoteDraft))
      setSelectedClientId(response?.selectedClientId ?? '')
      setDraftUpdated(false)
      setHistoryOpen(false)
    } catch (error) {
      setChatError(error?.message || 'Failed to load selected history')
    }
  }

  const selectedClient = clientOptions.find((client) => client.id === selectedClientId) || null
  const selectedCatalogItem =
    catalogItems.find((item) => String(item.id) === catalogSelectionId) || null

  return (
    <>
    <div className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-row gap-4 overflow-hidden">
        <Card className="flex h-full min-h-0 w-1/2 flex-col border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle>Quote Draft</CardTitle>
            <CardDescription>
              AI suggestions appear here. You can edit before saving or sending.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 pr-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Quote Title</label>
                  <Input value={quoteDraft.title} onChange={(event) => updateQuoteField('title', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Salesperson Name</label>
                  <Input
                    value={quoteDraft.salespersonName}
                    onChange={(event) => updateQuoteField('salespersonName', event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Quote Description</label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                  value={quoteDraft.quoteDescription ?? ''}
                  onChange={(event) => updateQuoteField('quoteDescription', event.target.value)}
                />
              </div>

              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">Client Selection</p>
                <div className="space-y-1" ref={clientPickerRef}>
                  <label className="text-xs font-semibold text-zinc-600">Search Client</label>
                  <Input
                    value={clientSearch}
                    placeholder={selectedClient ? selectedClient.name : 'Type name, email, or phone...'}
                    onFocus={() => setIsClientPickerOpen(true)}
                    onChange={(event) => {
                      setClientSearch(event.target.value)
                      setIsClientPickerOpen(true)
                    }}
                    disabled={isSavingClient || isLoadingThread}
                  />
                  {isClientPickerOpen ? (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white">
                      {isLoadingClientOptions ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">Searching clients...</p>
                      ) : null}
                      {!isLoadingClientOptions && clientOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">No clients found.</p>
                      ) : null}
                      {!isLoadingClientOptions
                        ? clientOptions.map((client) => (
                            <button
                              key={client.id}
                              type="button"
                              className={`flex w-full flex-col px-3 py-2 text-left hover:bg-zinc-50 ${
                                client.id === selectedClientId ? 'bg-zinc-100' : ''
                              }`}
                              onClick={() => handleSelectClient(client.id)}>
                              <span className="text-sm font-medium text-zinc-900">{client.name}</span>
                              {client.subtitle ? (
                                <span className="text-xs text-zinc-500">{client.subtitle}</span>
                              ) : null}
                            </button>
                          ))
                        : null}
                    </div>
                  ) : null}
                  {selectedClient ? (
                    <p className="text-xs text-zinc-600">
                      Selected: <span className="font-semibold">{selectedClient.name}</span>
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    Client details are auto-resolved for Jobber in the background.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">Line Items</p>
                <div className="mb-3 rounded-md border border-zinc-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-zinc-600">Add from Materials Catalog</p>
                  <div className="space-y-2">
                    <Input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Search material name..."
                    />
                    {catalogSearch.trim() ? (
                      <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white">
                        {isLoadingCatalogItems ? (
                          <p className="px-3 py-2 text-xs text-zinc-500">Searching materials...</p>
                        ) : null}
                        {!isLoadingCatalogItems && catalogItems.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-zinc-500">No materials found.</p>
                        ) : null}
                        {!isLoadingCatalogItems
                          ? catalogItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-50 ${
                                  String(item.id) === catalogSelectionId ? 'bg-zinc-100' : ''
                                }`}
                                onClick={() => setCatalogSelectionId(String(item.id))}>
                                <span className="text-sm text-zinc-900">
                                  {item.name} <span className="text-xs text-zinc-500">({item.uom})</span>
                                </span>
                                <span className="text-xs text-zinc-600">${(toInt(item.unitPriceCents) / 100).toFixed(2)}</span>
                              </button>
                            ))
                          : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addCatalogLineItem}
                        disabled={isLoadingCatalogItems || !selectedCatalogItem}>
                        Add Selected Material
                      </Button>
                      <Button type="button" variant="outline" onClick={addCustomLineItem}>
                        Add Custom
                      </Button>
                      <Button type="button" variant="outline" onClick={addLaborLineItem}>
                        Add Labor
                      </Button>
                    </div>
                    {selectedCatalogItem ? (
                      <p className="text-xs text-zinc-500">
                        Selected: <span className="font-medium text-zinc-700">{selectedCatalogItem.name}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3">
                  {quoteDraft.lineItems.map((item, index) => {
                    if (item.itemType === 'labor') return null
                    return (
                    <div key={`${item.productOrServiceName}-${index}`} className="rounded-md border border-zinc-200 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-600">Product / Service</label>
                          <Input
                            value={item.productOrServiceName}
                            onChange={(event) => updateLineItem(index, 'productOrServiceName', event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-600">Quantity</label>
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={(event) => updateLineItem(index, 'quantity', event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-600">Unit Price ($)</label>
                          <Input
                            type="text"
                            min={0}
                            value={centsToDollarInput(item.unitPriceCents)}
                            onChange={(event) =>
                              updateLineItem(index, 'unitPriceCents', dollarsToCents(event.target.value))
                            }
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs font-semibold text-zinc-600">Line Total ($)</label>
                          <Input value={`$${(toInt(item.totalPriceCents) / 100).toFixed(2)}`} disabled />
                        </div>
                        <div className="sm:col-span-2">
                          <Button type="button" variant="outline" onClick={() => removeLineItem(index)}>
                            Remove Item
                          </Button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Labor</p>
                  <Button type="button" variant="outline" size="sm" onClick={addLaborLineItem}>
                    Add Labor
                  </Button>
                </div>
                <div className="space-y-3">
                  {quoteDraft.lineItems.map((item, index) => {
                    if (item.itemType !== 'labor') return null
                    return (
                      <div key={`labor-${index}`} className="rounded-md border border-zinc-200 p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-600">Trade</label>
                            <Input
                              value={item.trade ?? ''}
                              onFocus={() => {
                                setActiveLaborTradeRow(index)
                                setLaborTradeSearch(String(item.trade ?? ''))
                              }}
                              onChange={(event) =>
                                {
                                  updateLaborLineItem(index, 'trade', event.target.value)
                                  setActiveLaborTradeRow(index)
                                  setLaborTradeSearch(event.target.value)
                                }
                              }
                              placeholder="Search existing trade or type new trade..."
                            />
                            {activeLaborTradeRow === index && laborTradeSearch.trim() ? (
                              <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-200 bg-white">
                                {isLoadingLaborTradeSuggestions ? (
                                  <p className="px-3 py-2 text-xs text-zinc-500">Searching trades...</p>
                                ) : null}
                                {!isLoadingLaborTradeSuggestions && laborTradeSuggestions.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-zinc-500">
                                    No existing trades found. You can keep this as a new trade.
                                  </p>
                                ) : null}
                                {!isLoadingLaborTradeSuggestions
                                  ? laborTradeSuggestions.map((tradeName) => (
                                      <button
                                        key={`${index}-${tradeName}`}
                                        type="button"
                                        className="flex w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                                        onClick={() => {
                                          updateLaborLineItem(index, 'trade', tradeName)
                                          setLaborTradeSearch(tradeName)
                                          setActiveLaborTradeRow(-1)
                                        }}>
                                        {tradeName}
                                      </button>
                                    ))
                                  : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-600">
                              Expertise Level
                            </label>
                            <select
                              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                              value={item.expertiseLevel ?? 'standard'}
                              onChange={(event) =>
                                updateLaborLineItem(index, 'expertiseLevel', event.target.value)
                              }>
                              <option value="standard">standard</option>
                              <option value="expert">expert</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-600">Hours</label>
                            <Input
                              type="number"
                              min={0}
                              value={item.hours ?? 0}
                              onChange={(event) =>
                                updateLaborLineItem(index, 'hours', event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-600">
                              Hourly Rate ($)
                            </label>
                            <Input
                              type="text"
                              value={centsToDollarInput(item.hourlyRateCents)}
                              disabled
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-zinc-600">
                              Labor Total ($)
                            </label>
                            <Input value={`$${(toInt(item.totalPriceCents) / 100).toFixed(2)}`} disabled />
                          </div>
                          <div className="sm:col-span-2">
                            <Button type="button" variant="outline" onClick={() => removeLineItem(index)}>
                              Remove Labor
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!quoteDraft.lineItems.some((item) => item.itemType === 'labor') ? (
                    <p className="text-xs text-zinc-500">
                      No labor rows yet. Click <span className="font-semibold">Add Labor</span> above.
                    </p>
                  ) : null}
                  {isLoadingLaborOptions ? (
                    <p className="text-xs text-zinc-500">Loading labor trades and expertise...</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">Totals</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Subtotal ($)</label>
                    <Input value={`$${(toInt(quoteDraft.clientView.subtotalCents) / 100).toFixed(2)}`} disabled />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Discount ($)</label>
                    <Input
                      type="text"
                      min={0}
                      value={centsToDollarInput(quoteDraft.clientView.discountCents)}
                      onChange={(event) => updateTotalsField('discountCents', dollarsToCents(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Tax ($)</label>
                    <Input
                      type="text"
                      min={0}
                      value={centsToDollarInput(quoteDraft.clientView.taxCents)}
                      onChange={(event) => updateTotalsField('taxCents', dollarsToCents(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Total ($)</label>
                    <Input value={`$${(toInt(quoteDraft.clientView.totalCents) / 100).toFixed(2)}`} disabled />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">Attachment</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Attachment URL</label>
                    <Input
                      value={quoteDraft.attachments[0]?.url ?? ''}
                      onChange={(event) => updateAttachment(0, 'url', event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Attachment Name</label>
                    <Input
                      value={quoteDraft.attachments[0]?.name ?? ''}
                      onChange={(event) => updateAttachment(0, 'name', event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!selectedClientId || isSavingDraft || isApprovingQuote}>
                  {isSavingDraft ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button
                  type="button"
                  onClick={handleApproveQuote}
                  disabled={!selectedClientId || isApprovingQuote || isSavingDraft}>
                  {isApprovingQuote ? 'Approving...' : 'Approve Quote'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 w-1/2 flex-col border-zinc-200 bg-white">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Chat</CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" onClick={handleNewChat} disabled={isCreatingNewChat}>
                  {isCreatingNewChat ? 'Creating...' : 'New Chat'}
                </Button>
              </div>
            </div>
            <CardDescription>
              Ask for quote ideas, pricing adjustments, and follow-up suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            {chatError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{chatError}</p>
            ) : null}
            {actionNotice ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {actionNotice}
              </p>
            ) : null}
            <div
              ref={chatViewportRef}
              onScroll={handleChatScroll}
              className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'ml-auto bg-zinc-900 text-white'
                        : 'bg-white text-zinc-800 border border-zinc-200'
                    }`}>
                    {message.text}
                  </div>
                ))}
                {isLoadingThread ? <p className="text-xs text-zinc-500">Loading conversation...</p> : null}
                <div ref={chatBottomRef} />
              </div>
            </div>
            {showJumpToLatest ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit self-end"
                onClick={() => {
                  setShowJumpToLatest(false)
                  setIsNearBottom(true)
                  scrollToLatest('smooth')
                }}>
                New messages
              </Button>
            ) : null}
            <div className="flex shrink-0 gap-2">
              <Input
                placeholder="Ask AI assistant..."
                value={prompt}
                disabled={isSending || !selectedClientId}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSend()
                }}
              />
              <Button type="button" onClick={handleSend} disabled={isSending || !prompt.trim() || !selectedClientId}>
                {isSending ? 'Sending...' : 'Send'}
              </Button>
            </div>
            {!selectedClientId ? (
              <p className="text-xs text-amber-700">Select a client before sending AI messages.</p>
            ) : null}
            {selectedClientId && !isSending ? (
              <p className="text-xs text-zinc-500">{draftUpdated ? 'Draft updated from last message.' : 'Draft unchanged from last message.'}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
    {historyOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Past Chats</h2>
            <Button type="button" variant="outline" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </div>
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search old chats and saved draft content..."
          />
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {isLoadingHistory ? <p className="text-sm text-zinc-500">Searching history...</p> : null}
            {!isLoadingHistory && historyRecords.length === 0 ? (
              <p className="text-sm text-zinc-500">No history found.</p>
            ) : null}
            {!isLoadingHistory
              ? historyRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className="w-full rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50"
                    onClick={() => handleOpenHistorySession(record.id)}>
                    <p className="font-medium text-zinc-900">{record.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{new Date(record.createdAt).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-zinc-600">{record.snippet}</p>
                  </button>
                ))
              : null}
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}

export default AiAssistantPage
