/**
 * DetailDrawer — right-side slide-in drawer with full sample detail.
 * Closes on ESC, backdrop click, or the close button.
 *
 * "Mark reviewed" toggles a per-sample review flag persisted in localStorage
 * (keyed by sample_id). "Jump to suite" delegates to the host via onJumpToSuite.
 */
import { useEffect, useState } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { SeverityBadge } from './ui'
import { AnnotationLayer } from './AnnotationLayer'
import { ConversationViewer } from './ConversationViewer'

interface Props {
  sample: SampleResult | null
  onClose: () => void
  timestamp?: string
  /** Called when the user clicks "Jump to suite". Host navigates to SuiteDetail. */
  onJumpToSuite?: (suite: string) => void
}

const REVIEW_KEY = 'agent-redteam:reviewed-samples'

/** Read the set of reviewed sample_ids from localStorage. */
function readReviewed(): Set<string> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

/** Persist the reviewed set back to localStorage. */
function writeReviewed(set: Set<string>) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify([...set]))
  } catch {
    /* localStorage may be unavailable (private mode); fail silently */
  }
}

export function DetailDrawer({ sample, onClose, timestamp, onJumpToSuite }: Props) {
  const [reviewed, setReviewed] = useState<Set<string>>(readReviewed)

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
  const isReviewed = reviewed.has(sample.sample_id)

  function copyAttack() {
    navigator.clipboard?.writeText(sample!.question)
  }

  function toggleReviewed() {
    setReviewed(prev => {
      const next = new Set(prev)
      if (next.has(sample!.sample_id)) next.delete(sample!.sample_id)
      else next.add(sample!.sample_id)
      writeReviewed(next)
      return next
    })
  }

  function jumpToSuite() {
    if (!onJumpToSuite) return
    onClose()
    onJumpToSuite(sample!.suite)
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

          {/* Multi-turn conversation history (only for multi_turn suite) */}
          {sample.metadata?.conversation && (
            <Field label={`Conversation (${sample.metadata.turns || 0} turns)`}>
              <ConversationViewer
                conversation={sample.metadata.conversation}
                turns={sample.metadata.turns || 0}
              />
            </Field>
          )}

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

        {/* Annotation layer — analyst notes on this sample */}
        <div style={{ padding: '0 20px 12px' }}>
          <AnnotationLayer sampleId={sample.sample_id} />
        </div>

        {/* Footer actions */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 20px',
          borderTop: `1px solid ${theme.border}`,
        }}>
          <ActionButton label="Copy attack" onClick={copyAttack} />
          <ActionButton
            label={isReviewed ? '✓ Reviewed' : 'Mark reviewed'}
            active={isReviewed}
            onClick={toggleReviewed}
          />
          <ActionButton
            label="Jump to suite"
            onClick={jumpToSuite}
            disabled={!onJumpToSuite}
          />
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

function ActionButton({ label, onClick, active, disabled }: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '8px 10px', fontSize: 12,
        background: active ? theme.success + '15' : theme.bg,
        border: `1px solid ${active ? theme.success + '60' : theme.border}`,
        borderRadius: theme.radiusSm,
        color: active ? theme.success : disabled ? theme.textFaint : theme.textDim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition,
      }}
    >
      {label}
    </button>
  )
}
