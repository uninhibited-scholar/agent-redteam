/**
 * DetailDrawer — right-side slide-in drawer with full sample detail.
 * Closes on ESC, backdrop click, or the close button.
 */
import { useEffect } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { SeverityBadge } from './ui'

interface Props {
  sample: SampleResult | null
  onClose: () => void
  timestamp?: string
}

export function DetailDrawer({ sample, onClose, timestamp }: Props) {
  useEffect(() => {
    if (!sample) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sample, onClose])

  if (!sample) return null

  const failed = sample.verdict === 'fail'

  function copyAttack() {
    navigator.clipboard?.writeText(sample!.question)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(4,7,14,0.6)',
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 92vw)',
          background: theme.surface,
          borderLeft: `1px solid ${theme.borderActive}`,
          display: 'flex', flexDirection: 'column',
          animation: 'drawerSlideIn 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        }}
      >
        <style>{`
          @keyframes drawerSlideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <code style={{ fontSize: 12, color: theme.textDim, fontFamily: theme.monoFamily }}>
            {sample.sample_id}
          </code>
          <div style={{ flex: 1 }} />
          <SeverityBadge severity={sample.severity} />
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: theme.textDim,
              fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <Field label="Suite">
            <span style={{ color: theme.primary, fontWeight: 600, fontSize: 13 }}>
              {sample.suite.replace(/_/g, ' ')}
            </span>
            {sample.owasp && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 600, color: theme.primary,
                background: theme.primary + '15', padding: '2px 6px', borderRadius: theme.radiusSm,
                fontFamily: theme.monoFamily,
              }}>
                {sample.owasp}
              </span>
            )}
          </Field>

          <Field label="Verdict">
            <span style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              color: failed ? theme.danger : theme.success,
            }}>
              {sample.verdict}
            </span>
          </Field>

          <Field label="Attack">
            <pre style={{
              fontSize: 12.5, color: theme.text, fontFamily: theme.monoFamily,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
              background: theme.bg, padding: 12, borderRadius: theme.radiusSm,
              border: `1px solid ${theme.border}`, margin: 0,
            }}>
              {sample.question}
            </pre>
          </Field>

          <Field label="Expected">
            <div style={{ fontSize: 12, color: theme.warning }}>{sample.expected}</div>
          </Field>

          <Field label="Response">
            <pre style={{
              fontSize: 12, color: failed ? theme.danger : theme.success,
              fontFamily: theme.monoFamily, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              lineHeight: 1.6, background: theme.bg, padding: 12, borderRadius: theme.radiusSm,
              border: `1px solid ${theme.border}`, maxHeight: 220, overflowY: 'auto', margin: 0,
            }}>
              {sample.response || '(empty)'}
            </pre>
          </Field>

          {sample.tags.length > 0 && (
            <Field label="Tags">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sample.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, color: theme.textDim, background: theme.bg,
                    padding: '2px 8px', borderRadius: 10, border: `1px solid ${theme.border}`,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </Field>
          )}

          {timestamp && (
            <Field label="Timestamp">
              <span style={{ fontSize: 12, color: theme.textDim, fontFamily: theme.monoFamily }}>
                {timestamp}
              </span>
            </Field>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 20px',
          borderTop: `1px solid ${theme.border}`,
        }}>
          <ActionButton label="Copy attack" onClick={copyAttack} />
          <ActionButton label="Mark reviewed" onClick={() => {}} />
          <ActionButton label="Jump to suite" onClick={() => {}} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, color: theme.textFaint, marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 10px', fontSize: 12,
        background: theme.bg, border: `1px solid ${theme.border}`,
        borderRadius: theme.radiusSm, color: theme.textDim, cursor: 'pointer',
        transition: theme.transition,
      }}
    >
      {label}
    </button>
  )
}
