import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Info, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext(null)

const STYLES = {
  error: {
    strip: 'bg-red-500',
    iconColor: 'text-red-500',
    titleColor: 'text-red-700',
    Icon: AlertCircle,
  },
  success: {
    strip: 'bg-emerald-500',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-700',
    Icon: CheckCircle,
  },
  info: {
    strip: 'bg-[#262742]',
    iconColor: 'text-[#262742]',
    titleColor: 'text-[#1a1b30]',
    Icon: Info,
  },
}

function formatFieldName(raw) {
  return String(raw || '')
    .replace(/^client\./, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

function ToastItem({ id, content, type, onRemove }) {
  const { strip, iconColor, titleColor, Icon } = STYLES[type] ?? STYLES.info
  const isString = typeof content === 'string'
  const title = isString ? null : content.title
  const body = isString ? content : content.body
  const items = isString ? null : content.items
  const hint = isString ? null : content.hint

  useEffect(() => {
    if (type === 'error') return
    const t = setTimeout(() => onRemove(id), 5000)
    return () => clearTimeout(t)
  }, [id, type, onRemove])

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      role="alert">
      <div className={cn('h-1 w-full', strip)} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
          <div className="min-w-0 flex-1">
            {title && (
              <p className={cn('text-sm font-bold leading-snug', titleColor)}>{title}</p>
            )}
            {body && (
              <p className={cn('text-sm leading-snug text-zinc-700', title && 'mt-1')}>{body}</p>
            )}
            {items && items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-800">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {hint && (
              <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500">
                {hint}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((content, type = 'error') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, content, type }])
  }, [])

  useEffect(() => {
    const goOffline = () => setIsOnline(false)
    const goOnline = () => {
      setIsOnline(true)
      showToast('You\'re back online.', 'success')
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {!isOnline && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="h-4 w-4 shrink-0" />
          You're offline — reconnect to the internet to use Handy Dudes
        </div>
      )}
      <div
        className={cn(
          'fixed left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4',
          isOnline ? 'top-4' : 'top-14'
        )}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} {...toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export { formatFieldName }
