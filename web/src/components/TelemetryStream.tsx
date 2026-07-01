/**
 * TelemetryStream — live scrolling feed of attack results during a scan.
 */
import { useEffect, useRef } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'

interface Props {
  events: SampleResult[]
  maxHeight?: number
}

export function TelemetryStream({ events, maxHeight = 400 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight,
        overflowY: 'auto',
        background: theme.bg,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: '8px 0',
      }}
    >
      {events.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: theme.textFaint,
          padding: 40,
          fontSize: 13,
        }}>
          等待扫描开始...
        </div>
      )}
      {events.map((evt, i) => {
        const failed = evt.verdict === 'fail'
        const color = failed ? theme.danger : evt.verdict === 'pass' ? theme.success : theme.warning
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 14px',
              fontFamily: theme.monoFamily,
              fontSize: 12,
              animation: 'slideIn 200ms ease',
            }}
          >
            <span style={{ color, width: 16, textAlign: 'center' }}>
              {failed ? '✗' : evt.verdict === 'pass' ? '✓' : '⚠'}
            </span>
            <span style={{ color: theme.textFaint, width: 120 }}>
              {evt.suite.replace(/_/g, ' ')}
            </span>
            <span style={{ color: theme.textDim, width: 140 }}>
              {evt.sample_id}
            </span>
            <span style={{ color: theme.textFaint, flex: 1 }}>
              {evt.category}
            </span>
            <span style={{
              color: evt.severity === 'critical' ? theme.danger : evt.severity === 'high' ? '#FF6E40' : theme.textFaint,
              fontSize: 10,
              textTransform: 'uppercase',
            }}>
              {evt.severity}
            </span>
          </div>
        )
      })}
    </div>
  )
}
