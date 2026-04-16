import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/apiClient'
import { Bot, Copy, FileText, History, UserCircle2, X } from 'lucide-react'
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
    const next = { ...item }
    delete next.productOrServiceName
    return {
      ...next,
      materialName: isLabor
        ? buildLaborLabel(item.trade, item.expertiseLevel)
        : String(item.materialName ?? item.productOrServiceName ?? ''),
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

function tryParseJson(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/** Extract first parseable JSON object/array from assistant text (plain, fenced, or embedded). */
function extractEmbeddedJson(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null

  let v = tryParseJson(trimmed)
  if (v !== null && (typeof v === 'object' || Array.isArray(v)))
    return { value: v, raw: trimmed, preamble: '', postamble: '' }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim()
    v = tryParseJson(inner)
    if (v !== null && (typeof v === 'object' || Array.isArray(v))) {
      const full = fenceMatch[0]
      const idx = trimmed.indexOf(full)
      return {
        value: v,
        raw: inner,
        preamble: idx > 0 ? trimmed.slice(0, idx).trim() : '',
        postamble: idx >= 0 ? trimmed.slice(idx + full.length).trim() : '',
      }
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1)
    v = tryParseJson(candidate)
    if (v !== null && typeof v === 'object' && !Array.isArray(v))
      return {
        value: v,
        raw: candidate,
        preamble: trimmed.slice(0, start).trim(),
        postamble: trimmed.slice(end + 1).trim(),
      }
  }

  const arrStart = trimmed.indexOf('[')
  const arrEnd = trimmed.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    const candidate = trimmed.slice(arrStart, arrEnd + 1)
    v = tryParseJson(candidate)
    if (v !== null && Array.isArray(v))
      return {
        value: v,
        raw: candidate,
        preamble: trimmed.slice(0, arrStart).trim(),
        postamble: trimmed.slice(arrEnd + 1).trim(),
      }
  }

  return null
}

function isQuoteLikePayload(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const qd = obj.quoteDraft
  if (qd && typeof qd === 'object' && !Array.isArray(qd)) {
    if (Array.isArray(qd.lineItems)) return true
    if (qd.clientView && typeof qd.clientView === 'object') return true
  }
  if (Array.isArray(obj.lineItems)) return true
  if (obj.clientView && typeof obj.clientView === 'object' && (obj.title != null || obj.quoteDescription != null))
    return true
  return false
}

/** Map API / AI JSON into a draft shape compatible with recalcDraft. */
function normalizeInboundQuoteDraft(raw) {
  const base = createDefaultQuoteDraft()
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw) && raw.quoteDraft && typeof raw.quoteDraft === 'object'
      ? raw.quoteDraft
      : raw
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null

  const lineItems = Array.isArray(src.lineItems)
    ? src.lineItems.map((line) => {
        const item = line || {}
        const isLabor = item.itemType === 'labor'
        if (isLabor) {
          const hours = toInt(item.hours) || 1
          const hourlyRateCents = toInt(item.hourlyRateCents)
          return {
            itemType: 'labor',
            trade: String(item.trade ?? 'general_handyman'),
            expertiseLevel: String(item.expertiseLevel ?? 'standard'),
            hours,
            hourlyRateCents,
            materialName: buildLaborLabel(item.trade, item.expertiseLevel),
            quantity: 1,
            unitPriceCents: hourlyRateCents,
            totalPriceCents: hours * hourlyRateCents,
          }
        }
        const qty = toInt(item.quantity) || 1
        const unitPriceCents = toInt(item.unitPriceCents)
        const totalPriceCents = toInt(item.totalPriceCents) || qty * unitPriceCents
        return {
          materialName: String(item.materialName ?? item.productOrServiceName ?? ''),
          quantity: qty,
          unitPriceCents,
          totalPriceCents,
        }
      })
    : []

  const cv = src.clientView && typeof src.clientView === 'object' ? src.clientView : {}
  return {
    ...base,
    title: String(src.title ?? base.title),
    quoteDescription: String(src.quoteDescription ?? base.quoteDescription),
    salespersonName: String(src.salespersonName ?? base.salespersonName),
    client: {
      fullName: String(src.client?.fullName ?? base.client.fullName),
      phone: String(src.client?.phone ?? base.client.phone),
      email: String(src.client?.email ?? base.client.email),
      address: String(src.client?.address ?? base.client.address),
    },
    lineItems,
    clientView: {
      subtotalCents: toInt(cv.subtotalCents),
      discountCents: toInt(cv.discountCents),
      taxCents: toInt(cv.taxCents),
      totalCents: toInt(cv.totalCents),
    },
    attachments:
      Array.isArray(src.attachments) && src.attachments.length > 0
        ? src.attachments.map((a) => ({ url: String(a?.url ?? ''), name: String(a?.name ?? '') }))
        : base.attachments,
  }
}

function parseAssistantStructured(text) {
  const extracted = extractEmbeddedJson(text)
  if (!extracted) return { kind: 'text' }

  const { value, raw, preamble = '', postamble = '' } = extracted

  if (typeof value === 'object' && value !== null && !Array.isArray(value) && isQuoteLikePayload(value)) {
    const quoteDraft = normalizeInboundQuoteDraft(value)
    if (quoteDraft)
      return {
        kind: 'quote_preview',
        rawString: raw,
        value,
        quoteDraft,
        preamble,
        postamble,
      }
  }

  return {
    kind: 'json',
    rawString: raw,
    value,
    preamble,
    postamble,
  }
}

function AssistantMessageContent({
  message,
  quoteDraft,
  setQuoteDraft,
  recalcDraftFn,
  setActionNotice,
}) {
  const [showRaw, setShowRaw] = useState(false)

  if (message.role !== 'assistant') {
    return <div className="whitespace-pre-wrap break-words">{message.text}</div>
  }

  const structured = parseAssistantStructured(message.text)

  if (structured.kind === 'text') {
    return <div className="whitespace-pre-wrap break-words">{message.text}</div>
  }

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(structured.rawString)
      setActionNotice('Copied JSON to clipboard.')
      setTimeout(() => setActionNotice(''), 2500)
    } catch {
      setActionNotice('Could not copy to clipboard.')
      setTimeout(() => setActionNotice(''), 2500)
    }
  }

  const applyQuote = () => {
    if (structured.kind !== 'quote_preview') return
    const normalized = normalizeInboundQuoteDraft(structured.value)
    if (!normalized) return
    setQuoteDraft(
      recalcDraftFn({
        ...normalized,
        client: quoteDraft.client,
        salespersonName: normalized.salespersonName?.trim()
          ? normalized.salespersonName
          : quoteDraft.salespersonName,
      })
    )
    setActionNotice('Quote draft updated from this message.')
    setTimeout(() => setActionNotice(''), 3000)
  }

  const jsonPretty =
    structured.kind === 'json' ? JSON.stringify(structured.value, null, 2) : structured.rawString

  const displayDraft = structured.kind === 'quote_preview' ? recalcDraftFn(structured.quoteDraft) : null

  return (
    <div className="space-y-2 break-words">
      {structured.preamble ? (
        <p className="whitespace-pre-wrap text-sm text-zinc-700">{structured.preamble}</p>
      ) : null}

      {structured.kind === 'quote_preview' && displayDraft ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Quote preview</p>
          {displayDraft.title ? (
            <p className="mt-1 text-sm font-semibold text-zinc-900">{displayDraft.title}</p>
          ) : null}
          {displayDraft.quoteDescription ? (
            <p className="mt-1 text-xs text-zinc-600">{displayDraft.quoteDescription}</p>
          ) : null}
          {(displayDraft.client?.fullName || displayDraft.client?.phone || displayDraft.client?.email) ? (
            <div className="mt-2 rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
              {displayDraft.client.fullName ? <p className="font-medium">{displayDraft.client.fullName}</p> : null}
              {displayDraft.client.phone ? <p>{displayDraft.client.phone}</p> : null}
              {displayDraft.client.email ? <p>{displayDraft.client.email}</p> : null}
            </div>
          ) : null}
          {displayDraft.lineItems.length > 0 ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-zinc-100 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                    <th className="px-2 py-1">Item</th>
                    <th className="px-2 py-1">Qty</th>
                    <th className="px-2 py-1 text-right">Unit</th>
                    <th className="px-2 py-1 text-right">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {displayDraft.lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-zinc-100">
                      <td className="px-2 py-1">
                        {item.itemType === 'labor'
                          ? `${item.trade ?? 'Labor'} (${item.expertiseLevel ?? 'standard'})`
                          : item.materialName || '—'}
                      </td>
                      <td className="px-2 py-1">{item.itemType === 'labor' ? item.hours : item.quantity}</td>
                      <td className="px-2 py-1 text-right">
                        ${(toInt(item.itemType === 'labor' ? item.hourlyRateCents : item.unitPriceCents) / 100).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        ${(toInt(item.totalPriceCents) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">No line items in this payload.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 border-t border-zinc-100 pt-2 text-xs">
            <span className="text-zinc-600">
              Subtotal ${(toInt(displayDraft.clientView.subtotalCents) / 100).toFixed(2)}
            </span>
            <span className="text-zinc-600">
              Total ${(toInt(displayDraft.clientView.totalCents) / 100).toFixed(2)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={applyQuote}>
              Apply to draft
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={copyRaw}>
              <Copy className="mr-1 h-3 w-3" />
              Copy JSON
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Hide raw' : 'Show raw'}
            </Button>
          </div>
          {showRaw ? (
            <pre className="mt-2 max-h-36 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-100">
              {structured.rawString}
            </pre>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 text-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Structured data</p>
          <pre className="mt-2 max-h-48 overflow-auto rounded border border-violet-100 bg-white/90 p-2 text-[11px] leading-relaxed text-zinc-800">
            {jsonPretty}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={copyRaw}>
              <Copy className="mr-1 h-3 w-3" />
              Copy JSON
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Hide raw' : 'Show raw'}
            </Button>
          </div>
          {showRaw && structured.kind === 'json' ? (
            <pre className="mt-2 max-h-36 overflow-auto rounded border border-zinc-200 bg-zinc-950 p-2 text-[11px] text-zinc-100">
              {message.text}
            </pre>
          ) : null}
        </div>
      )}

      {structured.postamble ? (
        <p className="whitespace-pre-wrap text-sm text-zinc-700">{structured.postamble}</p>
      ) : null}
    </div>
  )
}

function applyHandoffClientToDraft(draft, handoffClient) {
  if (!handoffClient || typeof handoffClient !== 'object') return draft
  const fullName = String(handoffClient.fullName ?? '').trim()
  const phone = String(handoffClient.phone ?? '').trim()
  const email = String(handoffClient.email ?? '').trim()
  const address = String(handoffClient.address ?? '').trim()
  return {
    ...draft,
    client: {
      ...draft.client,
      fullName: fullName || draft.client.fullName,
      phone: phone || draft.client.phone,
      email: email || draft.client.email,
      address: address || draft.client.address,
    },
  }
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
  const [pendingSeedHandoff, setPendingSeedHandoff] = useState(null)
  const [pendingContactHandoff, setPendingContactHandoff] = useState(null)
  const [isHandoffSaving, setIsHandoffSaving] = useState(false)
  const chatViewportRef = useRef(null)
  const chatBottomRef = useRef(null)
  const clientPickerRef = useRef(null)
  const promptInputRef = useRef(null)
  const didLoadThreadRef = useRef(false)
  /** Last successful Create Quote handoff (React Router location.key) so we do not double-run or block retries. */
  const processedCreateQuoteHandoffKeyRef = useRef(null)
  const processedJobberSeedHandoffKeyRef = useRef(null)
  const didHandleQuoteResumeRef = useRef(false)

  function scrollToLatest(behavior = 'smooth') {
    chatBottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }

  useEffect(() => {
    const hasResumeQuote = Boolean(location.state?.resumeQuoteId)
    const hasContactHandoff = Boolean(location.state?.contactId && location.state?.startNewChat)
    const hasJobberSeedOnly = Boolean(
      location.state?.startNewChat && location.state?.jobberRequestSeed && !location.state?.contactId
    )
    if (hasResumeQuote || hasContactHandoff || hasJobberSeedOnly) {
      // Resume/handoff flows manage their own thread hydration and would be
      // overwritten by a concurrent default thread load.
      setIsLoadingThread(false)
      return
    }

    // A handoff effect already loaded the thread (e.g. seed handoff cleared state after navigate).
    // Avoid overwriting the seeded draft with the server's blank thread.
    if (didLoadThreadRef.current) return

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
  }, [location.state])

  useEffect(() => {
    const resumeQuoteId = location.state?.resumeQuoteId
    if (!resumeQuoteId || didHandleQuoteResumeRef.current) return
    didHandleQuoteResumeRef.current = true
    let cancelled = false
    async function runQuoteResume() {
      try {
        setIsLoadingThread(true)
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
        didLoadThreadRef.current = true
        setActionNotice('Draft quote loaded into AI Assistant. Continue editing below.')
        navigate(location.pathname, { replace: true, state: null })
        requestAnimationFrame(() => scrollToLatest('auto'))
      } catch (error) {
        if (cancelled) return
        setChatError(error?.message || 'Failed to load selected draft quote')
      } finally {
        if (!cancelled) setIsLoadingThread(false)
      }
    }
    void runQuoteResume()
    return () => {
      cancelled = true
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    const handoffContactId = location.state?.contactId
    const handoffClient = location.state?.handoffClient
    const shouldStartNewChat = Boolean(location.state?.startNewChat)
    if (!handoffContactId || !shouldStartNewChat) return

    const navKey = location.key
    if (processedCreateQuoteHandoffKeyRef.current === navKey) return

    let cancelled = false

    async function runContactHandoff() {
      try {
        setIsLoadingThread(true)
        setChatError('')
        setIsCreatingNewChat(true)

        // Immediate draft preview: client block fills before network completes.
        setQuoteDraft((current) => applyHandoffClientToDraft(current, handoffClient))
        setSelectedClientId(handoffContactId)

        const threadSnapshot = await apiRequest('/api/sales/ai-assistant/thread')
        if (cancelled) return

        const priorMessages = normalizeMessages(threadSnapshot?.messages)
        const priorClientId = String(threadSnapshot?.selectedClientId ?? '').trim()
        const hasUserTurn = priorMessages.some((m) => m.role === 'user')
        const seed = location.state?.jobberRequestSeed

        if (hasUserTurn && priorClientId) {
          // Ask the salesperson whether to save or discard the in-progress draft
          const priorClientName =
            String(threadSnapshot?.quoteDraft?.client?.fullName ?? '').trim() || 'the current client'
          setPendingContactHandoff({ navKey, handoffContactId, handoffClient, seed: seed ?? null, priorClientName })
          return
        }

        // No prior work — proceed directly
        await continueContactHandoff({ handoffContactId, handoffClient, seed: seed ?? null, navKey })
      } catch (error) {
        if (cancelled) return
        setChatError(error?.message || 'Failed to start new chat from selected contact')
        navigate(location.pathname, { replace: true, state: null })
      } finally {
        if (!cancelled) {
          setIsCreatingNewChat(false)
          setIsLoadingThread(false)
        }
      }
    }

    void runContactHandoff()
    return () => {
      cancelled = true
    }
  }, [location.key, location.state, location.pathname, navigate])

  async function applyJobberSeed(seed, navKey, wasSaved) {
    const resetResponse = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
    setMessages(normalizeMessages(resetResponse?.messages))
    const base = resetResponse?.quoteDraft ? recalcDraft(resetResponse.quoteDraft) : createDefaultQuoteDraft()
    const t = String(seed.title ?? '').trim()
    const d = String(seed.quoteDescription ?? '').trim()
    setQuoteDraft(recalcDraft({ ...base, title: t || base.title, quoteDescription: d || base.quoteDescription }))
    setSelectedClientId('')
    setDraftUpdated(false)
    // Persist seed fields to DB so they survive the first message send
    if (t || d) {
      await apiRequest('/api/sales/ai-assistant/thread/draft', {
        method: 'PATCH',
        body: JSON.stringify({ title: t || undefined, quoteDescription: d || undefined }),
      })
    }
    didLoadThreadRef.current = true
    processedJobberSeedHandoffKeyRef.current = navKey
    navigate(location.pathname, { replace: true, state: null })
    requestAnimationFrame(() => scrollToLatest('auto'))
  }

  async function handleSaveDraftAndContinue() {
    if (!pendingSeedHandoff || isHandoffSaving) return
    setIsHandoffSaving(true)
    setChatError('')
    try {
      await apiRequest('/api/sales/ai-assistant/draft/save', { method: 'POST' })
      await applyJobberSeed(pendingSeedHandoff.seed, pendingSeedHandoff.navKey, true)
      setPendingSeedHandoff(null)
    } catch (error) {
      setChatError(error?.message || 'Failed to save previous draft')
    } finally {
      setIsHandoffSaving(false)
    }
  }

  async function handleDiscardAndContinue() {
    if (!pendingSeedHandoff || isHandoffSaving) return
    setIsHandoffSaving(true)
    try {
      await applyJobberSeed(pendingSeedHandoff.seed, pendingSeedHandoff.navKey, false)
      setPendingSeedHandoff(null)
    } catch (error) {
      setChatError(error?.message || 'Failed to start from Jobber request')
    } finally {
      setIsHandoffSaving(false)
    }
  }

  async function continueContactHandoff({ handoffContactId, handoffClient, seed, navKey }) {
    const resetResponse = await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
    setMessages(normalizeMessages(resetResponse?.messages))
    if (resetResponse?.quoteDraft) {
      setQuoteDraft(recalcDraft(applyHandoffClientToDraft(recalcDraft(resetResponse.quoteDraft), handoffClient)))
    }

    const clientResponse = await apiRequest('/api/sales/ai-assistant/thread/client', {
      method: 'PATCH',
      body: JSON.stringify({ selectedClientId: handoffContactId }),
    })

    if (clientResponse?.quoteDraft) {
      setQuoteDraft(recalcDraft(applyHandoffClientToDraft(recalcDraft(clientResponse.quoteDraft), handoffClient)))
    }
    if (Array.isArray(clientResponse?.messages)) {
      setMessages(normalizeMessages(clientResponse.messages))
    }
    setSelectedClientId(clientResponse?.selectedClientId ?? handoffContactId)
    setDraftUpdated(false)
    didLoadThreadRef.current = true
    processedCreateQuoteHandoffKeyRef.current = navKey

    if (seed && typeof seed === 'object') {
      const t = String(seed.title ?? '').trim()
      const d = String(seed.quoteDescription ?? '').trim()

      if (t || d) {
        await apiRequest('/api/sales/ai-assistant/thread/draft', {
          method: 'PATCH',
          body: JSON.stringify({ title: t || undefined, quoteDescription: d || undefined }),
        })
      }

      const parts = ['New Jobber service request — please generate an initial quote draft.']
      if (t) parts.push(`Service: ${t}`)
      if (d) parts.push(`Request details:\n${d}`)
      const autoPrompt = parts.join('\n\n')
      if (autoPrompt) {
        setIsSending(true)
        try {
          const aiResponse = await apiRequest('/api/sales/ai-assistant/chat', {
            method: 'POST',
            body: JSON.stringify({ prompt: autoPrompt, forceQuoteUpdate: true }),
          })
          setMessages(normalizeMessages(aiResponse?.messages))
          if (aiResponse?.quoteDraft) setQuoteDraft(recalcDraft(aiResponse.quoteDraft))
          setDraftUpdated(Boolean(aiResponse?.draftUpdated))
        } finally {
          setIsSending(false)
        }
      }
    }

    navigate(location.pathname, { replace: true, state: null })
    requestAnimationFrame(() => scrollToLatest('auto'))
  }

  async function handleContactHandoffSaveDraftAndContinue() {
    if (!pendingContactHandoff || isHandoffSaving) return
    setIsHandoffSaving(true)
    setChatError('')
    try {
      await apiRequest('/api/sales/ai-assistant/draft/save', { method: 'POST' })
      await continueContactHandoff(pendingContactHandoff)
      setPendingContactHandoff(null)
    } catch (error) {
      setChatError(error?.message || 'Failed to save previous draft')
    } finally {
      setIsHandoffSaving(false)
    }
  }

  async function handleContactHandoffDiscardAndContinue() {
    if (!pendingContactHandoff || isHandoffSaving) return
    setIsHandoffSaving(true)
    setChatError('')
    try {
      await continueContactHandoff(pendingContactHandoff)
      setPendingContactHandoff(null)
    } catch (error) {
      setChatError(error?.message || 'Failed to start new quote')
    } finally {
      setIsHandoffSaving(false)
    }
  }

  useEffect(() => {
    const seed = location.state?.jobberRequestSeed
    const shouldStart = Boolean(location.state?.startNewChat)
    const contactId = location.state?.contactId
    if (!shouldStart || !seed || contactId) return

    const navKey = location.key
    if (processedJobberSeedHandoffKeyRef.current === navKey) return

    let cancelled = false

    async function runJobberSeedHandoff() {
      try {
        setIsLoadingThread(true)
        setChatError('')
        setActionNotice('')
        setIsCreatingNewChat(true)

        const threadSnapshot = await apiRequest('/api/sales/ai-assistant/thread')
        if (cancelled) return

        const priorMessages = normalizeMessages(threadSnapshot?.messages)
        const priorClientId = String(threadSnapshot?.selectedClientId ?? '').trim()
        const hasUserTurn = priorMessages.some((m) => m.role === 'user')

        if (hasUserTurn && priorClientId) {
          const priorClientName =
            String(threadSnapshot?.quoteDraft?.client?.fullName ?? '').trim() || 'current client'
          setPendingSeedHandoff({ seed, navKey, priorClientName })
          return
        }

        await applyJobberSeed(seed, navKey, false)
      } catch (error) {
        if (cancelled) return
        setChatError(error?.message || 'Failed to start from Jobber request')
        navigate(location.pathname, { replace: true, state: null })
      } finally {
        if (!cancelled) {
          setIsCreatingNewChat(false)
          setIsLoadingThread(false)
        }
      }
    }

    void runJobberSeedHandoff()
    return () => {
      cancelled = true
    }
  }, [location.key, location.state, location.pathname, navigate])

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

  useEffect(() => {
    const textarea = promptInputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`
  }, [prompt])

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
            materialName: '',
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
            materialName: buildLaborLabel(
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
            materialName: selected.name,
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
    if (!clientId) return
    setChatError('')
    setActionNotice('')
    setIsSavingClient(true)
    try {
      const isSwitchingClients = Boolean(selectedClientId) && selectedClientId !== clientId
      // Always hydrate the quote draft with the selected client first.
      const firstAttachResponse = await apiRequest('/api/sales/ai-assistant/thread/client', {
        method: 'PATCH',
        body: JSON.stringify({ selectedClientId: clientId }),
      })
      if (firstAttachResponse?.quoteDraft) {
        setQuoteDraft(recalcDraft(firstAttachResponse.quoteDraft))
      }
      if (Array.isArray(firstAttachResponse?.messages)) {
        setMessages(normalizeMessages(firstAttachResponse.messages))
      }

      if (isSwitchingClients) {
        setIsCreatingNewChat(true)
        // Archive previous conversation and reset, then attach selected client to blank draft.
        await apiRequest('/api/sales/ai-assistant/new-chat', { method: 'POST' })
        const attachAfterReset = await apiRequest('/api/sales/ai-assistant/thread/client', {
          method: 'PATCH',
          body: JSON.stringify({ selectedClientId: clientId }),
        })
        if (attachAfterReset?.quoteDraft) {
          setQuoteDraft(recalcDraft(attachAfterReset.quoteDraft))
        }
        if (Array.isArray(attachAfterReset?.messages)) {
          setMessages(normalizeMessages(attachAfterReset.messages))
        }
        setSelectedClientId(attachAfterReset?.selectedClientId ?? clientId)
        setDraftUpdated(false)
      } else {
        setSelectedClientId(firstAttachResponse?.selectedClientId ?? clientId)
      }

      setIsClientPickerOpen(false)
      if (isSwitchingClients) {
        setActionNotice('Previous chat was saved and a new chat started for the selected client.')
      }
    } catch (error) {
      setChatError(error?.message || 'Failed to set selected client')
    } finally {
      setIsSavingClient(false)
      setIsCreatingNewChat(false)
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

  async function handleCancelQuote() {
    if (isCreatingNewChat || isSavingDraft || isApprovingQuote) return
    const confirmed = window.confirm('Cancel this quote draft? Unsaved changes will be lost.')
    if (!confirmed) return
    await handleNewChat()
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {location.state?.jobberRequestSeed ? (
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-sky-500" />
          <p className="text-sm text-sky-800">
            Building quote for:{' '}
            <span className="font-semibold">
              {String(location.state.jobberRequestSeed.title ?? '').trim() || 'this request'}
            </span>
          </p>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-row gap-4 overflow-hidden">
        <div className="flex h-full min-h-0 w-1/2 flex-col rounded-xl border border-zinc-200 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-5 py-4">
            <FileText className="h-4 w-4 shrink-0 text-sky-500" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Quote Builder</h2>
              <p className="text-xs text-zinc-500">Edit before saving or sending.</p>
            </div>
          </div>
          <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-5 pb-5 pt-4">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Quote Title</label>
                  <Input value={quoteDraft.title} onChange={(event) => updateQuoteField('title', event.target.value)} />
                </div>
                <div className="mt-6 flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5">
                  <UserCircle2 className="h-3 w-3 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Rep</p>
                    <p className="truncate text-[10px] text-zinc-700">
                      {quoteDraft.salespersonName || 'Assigned sales rep'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Quote Description</label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                  value={quoteDraft.quoteDescription ?? ''}
                  onChange={(event) => updateQuoteField('quoteDescription', event.target.value)}
                />
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
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

              <div className="rounded-lg border border-zinc-200 bg-zinc-100/55 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">Line Items</p>
                <div className="mb-3 rounded-md border border-zinc-200 bg-white p-3">
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
                        className="bg-zinc-100 hover:bg-zinc-200"
                        onClick={addCatalogLineItem}
                        disabled={isLoadingCatalogItems || !selectedCatalogItem}>
                        Add Selected Material
                      </Button>
                      <Button type="button" variant="outline" className="bg-zinc-100 hover:bg-zinc-200" onClick={addCustomLineItem}>
                        Add Custom
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
                    <div key={`${item.materialName ?? 'line'}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-600">Material</label>
                          <Input
                            value={item.materialName ?? ''}
                            onChange={(event) => updateLineItem(index, 'materialName', event.target.value)}
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
                          <Button type="button" variant="outline" className="bg-zinc-100 hover:bg-zinc-200" onClick={() => removeLineItem(index)}>
                            Remove Item
                          </Button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-100/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Labor</p>
                  <Button type="button" variant="outline" size="sm" className="bg-zinc-100 hover:bg-zinc-200" onClick={addLaborLineItem}>
                    Add Labor
                  </Button>
                </div>
                <div className="space-y-3">
                  {quoteDraft.lineItems.map((item, index) => {
                    if (item.itemType !== 'labor') return null
                    return (
                      <div key={`labor-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
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
                            <Button type="button" variant="outline" className="bg-zinc-100 hover:bg-zinc-200" onClick={() => removeLineItem(index)}>
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

              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3">
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

              <div className="rounded-lg border border-zinc-200 bg-zinc-100/45 p-3">
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
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 bg-white pt-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-zinc-100 hover:bg-zinc-200"
                  onClick={handleCancelQuote}
                  disabled={isCreatingNewChat || isSavingDraft || isApprovingQuote}>
                  Cancel Quote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-zinc-100 hover:bg-zinc-200"
                  onClick={handleSaveDraft}
                  disabled={!selectedClientId || isSavingDraft || isApprovingQuote}>
                  {isSavingDraft ? 'Saving...' : 'Save Draft'}
                </Button>
              </div>
              <Button
                type="button"
                className="bg-sky-500 text-white hover:bg-sky-600"
                onClick={handleApproveQuote}
                disabled={!selectedClientId || isApprovingQuote || isSavingDraft}>
                {isApprovingQuote ? 'Approving...' : 'Approve & Send'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex h-full min-h-0 w-1/2 flex-col rounded-xl border border-zinc-200 bg-white">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 shrink-0 text-sky-500" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">AI Assistant</h2>
                <p className="text-xs text-zinc-500">Ask for pricing, adjustments, and suggestions.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" onClick={handleNewChat} disabled={isCreatingNewChat}>
                {isCreatingNewChat ? 'Creating...' : 'New Chat'}
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5 pt-4">
            {chatError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{chatError}</p>
            ) : null}
            {actionNotice ? (
              <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
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
                        ? 'ml-auto bg-sky-500 text-white'
                        : 'bg-white text-zinc-800 border border-zinc-200'
                    }`}>
                    <AssistantMessageContent
                      message={message}
                      quoteDraft={quoteDraft}
                      setQuoteDraft={setQuoteDraft}
                      recalcDraftFn={recalcDraft}
                      setActionNotice={setActionNotice}
                    />
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
            <div className="flex shrink-0 items-end gap-2">
              <textarea
                ref={promptInputRef}
                placeholder="Ask AI assistant..."
                value={prompt}
                disabled={isSending || !selectedClientId}
                className="max-h-[140px] min-h-[40px] w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSend()
                  }
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
          </div>
        </div>
      </div>
    </div>
    {pendingSeedHandoff ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
        <div
          className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
          role="dialog"
          aria-modal="true">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-sky-500" />
            <h3 className="text-base font-bold text-zinc-900">Unsaved quote in progress</h3>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            You have an active quote draft for{' '}
            <span className="font-semibold text-zinc-900">{pendingSeedHandoff.priorClientName}</span>.
            What would you like to do before starting this new request?
          </p>
          {chatError ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {chatError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscardAndContinue}
              disabled={isHandoffSaving}>
              Discard & Continue
            </Button>
            <Button
              type="button"
              className="bg-sky-500 text-white hover:bg-sky-600"
              onClick={handleSaveDraftAndContinue}
              disabled={isHandoffSaving}>
              {isHandoffSaving ? 'Saving...' : 'Save Draft & Continue'}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    {pendingContactHandoff ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
        <div
          className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
          role="dialog"
          aria-modal="true">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-sky-500" />
            <h3 className="text-base font-bold text-zinc-900">Unsaved quote in progress</h3>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            You have an active quote draft for{' '}
            <span className="font-semibold text-zinc-900">{pendingContactHandoff.priorClientName}</span>.
            Would you like to save it before working on this new request?
          </p>
          {chatError ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {chatError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleContactHandoffDiscardAndContinue}
              disabled={isHandoffSaving}>
              Discard & Continue
            </Button>
            <Button
              type="button"
              className="bg-sky-500 text-white hover:bg-sky-600"
              onClick={handleContactHandoffSaveDraftAndContinue}
              disabled={isHandoffSaving}>
              {isHandoffSaving ? 'Saving...' : 'Save Draft & Continue'}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    {historyOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-sky-500" />
              <h2 className="text-sm font-semibold text-zinc-900">Past Chats</h2>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
              <X className="h-4 w-4" />
            </button>
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
