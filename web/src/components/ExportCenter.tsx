/** ExportCenter — export current scan report as JSON / Markdown / CSV. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge } from './ui'
import type { ScanReport, SampleResult } from '../types'

interface ExportCenterProps {
  report: ScanReport
  samples?: SampleResult[]
  onExported?: (format: 'json' | 'markdown' | 'csv') => void
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function samplesToCsv(samples: SampleResult[]): string {
  const header = ['suite', 'sample_id', 'category', 'difficulty', 'verdict', 'severity', 'question', 'response']
  const rows = samples.map(s => [
    s.suite, s.sample_id, s.category, s.difficulty, s.verdict, s.severity, s.question, s.response,
  ].map(csvEscape).join(','))
  return [header.join(','), ...rows].join('\n')
}

interface ExportFormat {
  key: 'json' | 'markdown' | 'csv'
  icon: string
  label: string
  desc: string
}

const FORMATS: ExportFormat[] = [
  { key: 'json', icon: '{}', label: 'JSON', desc: '完整结构化数据' },
  { key: 'markdown', icon: 'M↓', label: 'Markdown', desc: '可读报告' },
  { key: 'csv', icon: '▦', label: 'CSV', desc: '表格样本明细' },
]

export function ExportCenter({ report, samples, onExported }: ExportCenterProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  function handleExport(format: ExportFormat['key']) {
    if (format === 'json') {
      window.open('/api/export/json', '_blank')
    } else if (format === 'markdown') {
      window.open('/api/export/markdown', '_blank')
    } else {
      const rows = samples ?? report.samples ?? []
      const csv = samplesToCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.target_model}-samples.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
    onExported?.(format)
  }

  return (
    <Panel
      title="导出报告"
      subtitle={`${report.target_model} · ${report.total_samples} samples`}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        {FORMATS.map(f => {
          const isHover = hovered === f.key
          return (
            <button
              key={f.key}
              onClick={() => handleExport(f.key)}
              onMouseEnter={() => setHovered(f.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '20px 12px',
                background: isHover ? theme.surfaceHover : theme.bg,
                border: `1px solid ${isHover ? theme.primary : theme.border}`,
                borderRadius: theme.radiusSm,
                cursor: 'pointer',
                transition: theme.transition,
                fontFamily: theme.fontFamily,
              }}
            >
              <span style={{
                fontSize: 22, fontFamily: theme.monoFamily, color: theme.primary,
                lineHeight: 1,
              }}>
                {f.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                {f.label}
              </span>
              <span style={{ fontSize: 11, color: theme.textDim, textAlign: 'center' }}>
                {f.desc}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <SeverityBadge severity="low" />
        <span style={{ fontSize: 11, color: theme.textFaint }}>
          API key 不会出现在任何导出文件中
        </span>
      </div>
    </Panel>
  )
}
