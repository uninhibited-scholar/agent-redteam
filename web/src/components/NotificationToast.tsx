/**
 * NotificationToast — top-right toast stack + useNotification() hook.
 */
import { useState, useCallback, createContext, useContext } from 'react'
import { theme } from '../theme'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
  duration: number
}

interface NotifyContextValue {
  notify: (message: string, type?: ToastType, duration?: number) => void
}

const NotifyContext = createContext<NotifyContextValue | null>(null)

const MAX_TOASTS = 3
let idCounter = 0

const TYPE_STYLE: Record<ToastType, { color: string; icon: string }> = {
  success: { color: theme.success, icon: '✓' },
  warning: { color: theme.warning, icon: '⚠' },
  error: { color: theme.danger, icon: '✕' },
  info: { color: theme.info, icon: 'ℹ' },
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const notify = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = ++idCounter
    setToasts(t => [...t.slice(-(MAX_TOASTS - 1)), { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
  }, [remove])

  return (
    <NotifyContext.Provider value={{ notify }}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 200,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 340,
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </NotifyContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { color, icon } = TYPE_STYLE[toast.type]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: theme.surface,
      border: `1px solid ${color}40`,
      borderLeft: `3px solid ${color}`,
      borderRadius: theme.radius,
      padding: '10px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      animation: 'toastSlideIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <span style={{ color, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: theme.text, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent', border: 'none', color: theme.textFaint,
          fontSize: 13, cursor: 'pointer', padding: 0, flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

export function useNotification(): NotifyContextValue {
  const ctx = useContext(NotifyContext)
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return ctx
}
