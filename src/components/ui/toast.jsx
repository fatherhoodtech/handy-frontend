import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Info, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext(null)

const STYLES = {
  error: { border: 'border-red-200', bar: 'bg-red-500', icon: 'text-red-500', Icon: AlertCircle },
  success: { border: 'border-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-600', Icon: CheckCircle },
  info: { border: 'border-[#262742]/30', bar: 'bg-[#262742]', icon: 'text-[#262742]', Icon: Info },
}

function ToastItem({ id, message, type, onRemove }) {
  const { border, bar, icon, Icon } = STYLES[type] ?? STYLES.info

  useEffect(() => {
    if (type === 'error') return
    const t = setTimeout(() => onRemove(id), 5000)
    return () => clearTimeout(t)
  }, [id, type, onRemove])

  return (
    <div className={cn('relative w-80 overflow-hidden rounded-xl border bg-white shadow-xl', border)} role="alert">
      <div className={cn('absolute inset-y-0 left-0 w-1', bar)} />
      <div className="flex items-start gap-3 py-3.5 pl-5 pr-3.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} />
        <p className="flex-1 text-sm leading-snug text-zinc-800">{message}</p>
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-700">
          <X className="h-3.5 w-3.5" />
        </button>
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

  const showToast = useCallback((message, type = 'error') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  useEffect(() => {
    const goOffline = () => setIsOnline(false)
    const goOnline = () => {
      setIsOnline(true)
      showToast('Back online', 'success')
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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
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
