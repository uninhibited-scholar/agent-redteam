/**
 * BatchActions — floating bulk-action bar for the Findings page.
 * Controlled: selection state lives in the parent; this only reads it.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { SeverityBadge } from './ui'
import type { SampleResult } from '../types'

interface BatchActionsProps {
  /** Currently selected sample_ids. */
  selected: Set<string>
  /** Samples currently visible (e.g. current page/filter) to select-all/export from. */
  visibleSamples: SampleResult[]
  /** Total count matching the active filters (may exceed visibleSamples.length). */
  totalMatched: number
  onSelectAll: () => void
  onClear: () => void
}

const REVIEW_KEY = 'agent-redteam:reviewed-samples'

function readReviewed(): Set<string> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function writeReviewed(set: Set<string>) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // localStorage unavailable — skip persistence
  }
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function samplesToCsv(samples: SampleResult[]): string {
  const header = ['sample_id', 'suite', 'category', 'verdict', 'severity', 'question']
  const rows = samples.map(s => [s.sample_id, s.suite, s.category, s.verdict, s.severity, s.question]
    .map(csvEscape)
    .join(','))
  return [header.join(','), ...rows].join('\n')
}

export function BatchActions({ selected, visibleSamples, totalMatched, onSelectAll, onClear }: BatchActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  if (selected.size === 0) return null

  function flash(message: string) {
    setFeedback(message)
    setTimeout(() => setFeedback(null), 2500)
  }

  const selectedSamples = visibleSamples.filter(s => selected.has(s.sample_id))
  const severities = Array.from(new Set(selectedSamples.map(s => s.severity)))

  function markReviewed() {
    const reviewed = readReviewed()
    selected.forEach(id => reviewed.add(id))
    writeReviewed(reviewed)
    flash(`已标记 ${selected.size} 个为已审阅`)
  }

  function copyIds() {
    navigator.clipboard?.writeText(Array.from(selected).join(','))
    flash(`已复制 ${selected.size} 个 ID`)
  }

  function exportCsv() {
    const csv = samplesToCsv(selectedSamples)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `findings-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    flash(`已导出 ${selectedSamples.length} 行 CSV`)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 150, display: 'flex', alignItems: 'center', gap: 16,
      background: theme.surface, border: `1px solid ${theme.borderActive}`,
      borderRadius: theme.radius, padding: '12px 18px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
      animation: 'batchActionsSlideIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <style>{`
        @keyframes batchActionsSlideIn {
          from { opacity: 0; transform: translate(-50%, 16px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: theme.text, whiteSpace: 'nowrap' }}>
          已选 <strong style={{ color: theme.primary }}>{selected.size}</strong> 个（共 {totalMatched} 匹配）
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {severities.map(sev => <SeverityBadge key={sev} severity={sev} />)}
        </div>
        <TextButton label="全选当前页" onClick={onSelectAll} />
        <TextButton label="清空" onClick={onClear} />
      </div>

      <div style={{ width: 1, height: 20, background: theme.border }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton label="标记已审阅" color={theme.success} onClick={markReviewed} />
        <ActionButton label="复制 ID" color={theme.primary} onClick={copyIds} />
        <ActionButton label="导出 CSV" color={theme.textDim} onClick={exportCsv} />
      </div>

      {feedback && (
        <span style={{ fontSize: 11, color: theme.success, whiteSpace: 'nowrap' }}>{feedback}</span>
      )}
    </div>
  )
}

function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', color: theme.textDim,
        fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline',
      }}
    >
      {label}
    </button>
  )
}

function ActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        background: color + '18', border: `1px solid ${color}60`,
        borderRadius: theme.radius, color, cursor: 'pointer',
        transition: theme.transition,
      }}
    >
      {label}
    </button>
  )
}
