/** ConnectionStatus — WebSocket connection state indicator for LiveScan, with reconnect affordance. */
import { useEffect, useState } from 'react'
import { theme } from '../theme'

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface ConnectionStatusProps {
  status: ConnState
  /** Current reconnect attempt number, shown while status === 'reconnecting'. */
  reconnectAttempt?: number
  /** Timestamp (ms epoch) of the last received message, used for the "Xs ago" readout. */
  lastMessageAt?: number
  /** Manual reconnect callback (shows a "重连" button when disconnected). */
  onReconnect?: () => void
  /** Compact mode for embedding in a toolbar — dot + short label only. */
  compact?: boolean
}

const STATUS_COLOR: Record<ConnState, string> = {
  connecting: theme.warning,
  connected: theme.success,
  disconnected: theme.danger,
  reconnecting: theme.warning,
}

const STATUS_LABEL: Record<ConnState, string> = {
  connecting: '连接中…',
  connected: '已连接',
  disconnected: '已断开',
  reconnecting: '重连中…',
}

const COMPACT_LABEL: Record<ConnState, string> = {
  connecting: '连接',
  connected: '连接',
  disconnected: '断开',
  reconnecting: '重连',
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

export function ConnectionStatus({ status, reconnectAttempt, lastMessageAt, onReconnect, compact = false }: ConnectionStatusProps) {
  const showTimestamp = status === 'connected' && !!lastMessageAt
  const now = useNow(showTimestamp)
  const color = STATUS_COLOR[status]

  const dotAnimation = status === 'connecting'
    ? 'pulse 1.5s ease infinite'
    : status === 'reconnecting'
      ? 'pulse 0.8s ease infinite'
      : 'none'

  const label = compact
    ? COMPACT_LABEL[status]
    : status === 'reconnecting'
      ? `重连中(${reconnectAttempt ?? 0})…`
      : STATUS_LABEL[status]

  let agoText: string | null = null
  let agoColor: string = theme.textFaint
  if (showTimestamp && lastMessageAt) {
    const secs = Math.max(0, Math.floor((now - lastMessageAt) / 1000))
    agoText = `最后更新 ${secs}s 前`
    agoColor = secs < 5 ? theme.success : secs >= 10 ? theme.warning : theme.textDim
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 6 : 12,
      padding: compact ? '2px 0' : '8px 12px',
      borderRadius: theme.radiusSm,
      background: status === 'disconnected' && !compact ? theme.danger + '10' : 'transparent',
    }}>
      <span style={{
        width: compact ? 7 : 10,
        height: compact ? 7 : 10,
        borderRadius: '50%',
        background: color,
        animation: dotAnimation,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: compact ? 11 : 13,
        fontWeight: 600,
        color: theme.text,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>

      {!compact && agoText && (
        <span style={{ fontSize: 11, color: agoColor }}>
          {agoText}
        </span>
      )}

      {!compact && status === 'disconnected' && onReconnect && (
        <button
          onClick={onReconnect}
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.danger,
            background: theme.danger + '18',
            border: `1px solid ${theme.danger}`,
            borderRadius: theme.radiusSm,
            cursor: 'pointer',
            transition: theme.transition,
          }}
        >
          重连
        </button>
      )}
    </div>
  )
}
