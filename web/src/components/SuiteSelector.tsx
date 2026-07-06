/**
 * SuiteSelector — enhanced attack-suite picker for ScanLauncher.
 *
 * Groups suites by OWASP category, supports live search, and surfaces
 * per-suite sample counts and last-scan scores. Purely presentational —
 * selection state lives in the parent (controlled via `selected`/`onToggle`).
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

interface SuiteOption {
  name: string
  owasp: string
  count: number
  description: string
}

interface SuiteSelectorProps {
  suites: SuiteOption[]
  /** 当前选中的套件名集合（受控） */
  selected: Set<string>
  /** 切换某套件的选中状态 */
  onToggle: (name: string) => void
  /** 可选：每个套件上次扫描的分数（显示在卡片上），key=套件名 */
  lastScores?: Record<string, number>
}

const OWASP_LABELS: Record<string, string> = {
  LLM01: 'LLM01 — Injection & Tool Abuse',
  LLM02: 'LLM02 — Insecure Output Handling',
  LLM03: 'LLM03 — Training Data Poisoning',
  LLM04: 'LLM04 — Denial of Service',
  LLM05: 'LLM05 — Supply Chain',
  LLM06: 'LLM06 — Sensitive Info Disclosure',
  LLM07: 'LLM07 — Insecure Plugin Design',
  LLM08: 'LLM08 — Excessive Agency',
  LLM09: 'LLM09 — Overreliance',
  LLM10: 'LLM10 — Model Theft',
}

function scoreColor(score: number): string {
  if (score >= 80) return theme.success
  if (score >= 50) return theme.warning
  return theme.danger
}

export function SuiteSelector({ suites, selected, onToggle, lastScores }: SuiteSelectorProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byOwasp = new Map<string, SuiteOption[]>()
    for (const s of suites) {
      if (q) {
        const hit = s.name.toLowerCase().includes(q)
          || s.description.toLowerCase().includes(q)
          || s.owasp.toLowerCase().includes(q)
        if (!hit) continue
      }
      const list = byOwasp.get(s.owasp) || []
      list.push(s)
      byOwasp.set(s.owasp, list)
    }
    return [...byOwasp.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [suites, query])

  const selectAll = () => suites.forEach(s => { if (!selected.has(s.name)) onToggle(s.name) })
  const clearAll = () => suites.forEach(s => { if (selected.has(s.name)) onToggle(s.name) })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search suites..."
          style={{
            flex: 1, padding: '8px 12px', background: theme.bg,
            border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
            color: theme.text, fontSize: 12, outline: 'none',
          }}
        />
        <button onClick={selectAll} style={miniBtnStyle}>全选</button>
        <button onClick={clearAll} style={miniBtnStyle}>清空</button>
        <span style={{ fontSize: 12, color: theme.textFaint, whiteSpace: 'nowrap' }}>
          {selected.size} / {suites.length} selected
        </span>
      </div>

      {suites.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无可用套件
        </div>
      )}

      {suites.length > 0 && groups.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          未匹配到套件
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(([owasp, items]) => (
          <Panel key={owasp} title={OWASP_LABELS[owasp] || owasp} padding="12px 14px">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 8,
            }}>
              {items.map(s => {
                const on = selected.has(s.name)
                const score = lastScores?.[s.name]
                return (
                  <button
                    key={s.name}
                    onClick={() => onToggle(s.name)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: on ? theme.primary + '12' : theme.surface,
                      border: `1px solid ${on ? theme.primary : theme.border}`,
                      borderRadius: theme.radius,
                      cursor: 'pointer', transition: theme.transition,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: `1.5px solid ${on ? theme.primary : theme.borderActive}`,
                        background: on ? theme.primary : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: theme.bg, fontWeight: 700, flexShrink: 0,
                      }}>
                        {on ? '✓' : ''}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: on ? theme.primary : theme.text,
                      }}>
                        {s.name.replace(/_/g, ' ')}
                      </span>
                      <span style={{
                        fontSize: 9, fontFamily: theme.monoFamily,
                        color: theme.primary, background: theme.primary + '15',
                        padding: '1px 5px', borderRadius: 3, marginLeft: 'auto',
                      }}>
                        {s.owasp}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: theme.textFaint, paddingLeft: 22, marginBottom: score !== undefined ? 6 : 0 }}>
                      {s.count} samples · {s.description}
                    </div>
                    {score !== undefined && (
                      <div style={{ paddingLeft: 22 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: scoreColor(score),
                          background: scoreColor(score) + '18',
                          padding: '1px 6px', borderRadius: 10,
                        }}>
                          last: {score}
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}

const miniBtnStyle: React.CSSProperties = {
  padding: '7px 14px',
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.textDim,
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer', transition: theme.transition,
  whiteSpace: 'nowrap',
}
