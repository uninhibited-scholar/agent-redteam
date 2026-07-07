/** ComplianceMatrix — maps scan results onto OWASP LLM Top 10 (2025) for audit/management view. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult } from '../types'

export const OWASP_LLM_TOP10 = [
  { id: 'LLM01', name: 'Prompt Injection', desc: '提示注入' },
  { id: 'LLM02', name: 'Supply Chain', desc: '供应链' },
  { id: 'LLM03', name: 'Training Data', desc: '训练数据' },
  { id: 'LLM04', name: 'DoS', desc: '拒绝服务' },
  { id: 'LLM05', name: 'Excessive Agency', desc: '过度自主' },
  { id: 'LLM06', name: 'Information Disclosure', desc: '信息泄露' },
  { id: 'LLM07', name: 'Insecure Output', desc: '不安全输出' },
  { id: 'LLM08', name: 'Sensitive Data', desc: '敏感数据' },
  { id: 'LLM09', name: 'Over-Refusal', desc: '过度拒绝' },
  { id: 'LLM10', name: 'Over-Dependency', desc: '过度依赖' },
] as const

export type ComplianceStatus = 'compliant' | 'partial' | 'non-compliant' | 'not-tested'

export interface ComplianceRow {
  owaspId: string
  status: ComplianceStatus
  score: number
  suiteNames: string[]
}

function scoreToStatus(score: number, tested: boolean): ComplianceStatus {
  if (!tested) return 'not-tested'
  if (score >= 80) return 'compliant'
  if (score >= 50) return 'partial'
  return 'non-compliant'
}

export function computeCompliance(suites: SuiteResult[]): ComplianceRow[] {
  // Group suites by OWASP id.
  const grouped = new Map<string, SuiteResult[]>()
  for (const s of suites) {
    if (!s.owasp) continue
    const list = grouped.get(s.owasp) ?? []
    list.push(s)
    grouped.set(s.owasp, list)
  }

  return OWASP_LLM_TOP10.map(cat => {
    const matched = grouped.get(cat.id) ?? []
    const tested = matched.some(m => m.total > 0)
    // Conservative: take the lowest score among mapped, tested suites.
    const testedSuites = matched.filter(m => m.total > 0)
    const score = tested ? Math.min(...testedSuites.map(m => m.score)) : -1
    return {
      owaspId: cat.id,
      status: scoreToStatus(score, tested),
      score,
      suiteNames: matched.map(m => m.name),
    }
  })
}

const STATUS_META: Record<ComplianceStatus, { color: string; label: string }> = {
  'compliant': { color: theme.success, label: 'COMPLIANT ✓' },
  'partial': { color: theme.warning, label: 'PARTIAL ⚠' },
  'non-compliant': { color: theme.danger, label: 'NON-COMPLIANT ✗' },
  'not-tested': { color: theme.textFaint, label: 'NOT TESTED —' },
}

/** SVG donut progress ring — passed categories out of 10. */
function ProgressRing({ passed, total }: { passed: number; total: number }) {
  const size = 100
  const stroke = 9
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const frac = total > 0 ? passed / total : 0
  const offset = circ * (1 - frac)
  const color = frac >= 0.8 ? theme.success : frac >= 0.5 ? theme.warning : theme.danger
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: theme.transition }}
      />
      <text
        x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fill={theme.text} fontSize={22} fontWeight={700}
        fontFamily={theme.monoFamily}
      >
        {passed}/{total}
      </text>
    </svg>
  )
}

export function ComplianceMatrix({ suites }: ComplianceMatrixProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (suites.length === 0) {
    return (
      <Panel title="OWASP LLM Top 10 合规矩阵">
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>
          无扫描数据
        </div>
      </Panel>
    )
  }

  const rows = computeCompliance(suites)
  const compliantCount = rows.filter(r => r.status === 'compliant').length
  const nonCompliantCount = rows.filter(r => r.status === 'non-compliant').length
  const notTestedCount = rows.filter(r => r.status === 'not-tested').length
  const testedCount = rows.length - notTestedCount

  const complianceRate = testedCount > 0 ? (compliantCount / testedCount) * 100 : 0
  const needsAttention = testedCount - compliantCount
  const rateColor = complianceRate >= 100 ? theme.success
    : complianceRate >= 80 ? theme.primary : theme.warning
  const rateLabel = complianceRate >= 100 ? 'FULLY COMPLIANT'
    : complianceRate >= 80 ? `${complianceRate.toFixed(0)}% 合规`
      : `需关注 ${needsAttention} 个类别`

  const nameById = new Map<string, { id: string; name: string; desc: string }>(
    OWASP_LLM_TOP10.map(c => [c.id, c]),
  )

  return (
    <Panel title="OWASP LLM Top 10 合规矩阵">
      {/* Summary header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
        <ProgressRing passed={compliantCount} total={10} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: theme.success }}>
            <b>{compliantCount}</b> 个类别通过
          </div>
          <div style={{ fontSize: 13, color: theme.danger }}>
            <b>{nonCompliantCount}</b> 个类别不通过
          </div>
          <div style={{ fontSize: 13, color: theme.textFaint }}>
            <b>{notTestedCount}</b> 个类别未测试
          </div>
        </div>
      </div>

      {/* Matrix rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(row => {
          const cat = nameById.get(row.owaspId)
          const meta = STATUS_META[row.status]
          const isHovered = hovered === row.owaspId
          const barWidth = row.score >= 0 ? Math.min(Math.max(row.score, 0), 100) : 0
          return (
            <div
              key={row.owaspId}
              onMouseEnter={() => setHovered(row.owaspId)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: theme.radius,
                background: isHovered ? theme.surfaceHover : 'transparent',
                transition: theme.transition,
              }}
            >
              {/* Left: id + name + desc */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 300 }}>
                <MonoTag>{row.owaspId}</MonoTag>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{cat?.name}</span>
                <span style={{ fontSize: 11, color: theme.textFaint }}>{cat?.desc}</span>
              </div>

              {/* Middle: status badge */}
              <div style={{ minWidth: 150 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  fontFamily: theme.monoFamily, color: meta.color,
                  padding: '3px 8px', borderRadius: theme.radius,
                  background: meta.color + '18',
                }}>
                  {meta.label}
                </span>
              </div>

              {/* Right: score + mini bar */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, background: theme.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barWidth}%`, height: '100%',
                    background: meta.color, transition: theme.transition,
                  }} />
                </div>
                <span style={{
                  minWidth: 44, textAlign: 'right', fontSize: 13, fontWeight: 700,
                  fontFamily: theme.monoFamily,
                  color: row.score >= 0 ? meta.color : theme.textFaint,
                }}>
                  {row.score >= 0 ? row.score.toFixed(1) : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer: compliance rate */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}`,
      }}>
        <span style={{ fontSize: 12, color: theme.textDim }}>
          合规率（未测试不计入）：{testedCount > 0 ? `${complianceRate.toFixed(1)}%` : '—'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: rateColor }}>
          {testedCount > 0 ? rateLabel : '暂无测试类别'}
        </span>
      </div>
    </Panel>
  )
}

interface ComplianceMatrixProps {
  suites: SuiteResult[]
}
