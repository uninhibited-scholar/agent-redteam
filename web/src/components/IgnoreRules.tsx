/** IgnoreRules — mark known/acceptable failures so they're excluded from score calculation. Rules persist in localStorage. */
import { useEffect, useState } from 'react'
import { theme } from '../theme'
import { Panel, Field, SeverityBadge, MonoTag } from './ui'
import type { SampleResult } from '../types'

export interface IgnoreRule {
  id: string
  matchType: 'sample_id' | 'suite' | 'category' | 'tag'
  matchValue: string
  reason: string
  createdAt: string
}

interface IgnoreRulesProps {
  failures: SampleResult[]
  onChange?: (rules: IgnoreRule[]) => void
}

const STORAGE_KEY = 'agent-redteam:ignore-rules'

export function matchesRule(sample: SampleResult, rule: IgnoreRule): boolean {
  switch (rule.matchType) {
    case 'sample_id': return sample.sample_id === rule.matchValue
    case 'suite': return sample.suite === rule.matchValue
    case 'category': return sample.category === rule.matchValue
    case 'tag': return sample.tags.includes(rule.matchValue)
  }
}

export function applyIgnoreRules(samples: SampleResult[], rules: IgnoreRule[]): {
  ignored: SampleResult[]
  remaining: SampleResult[]
} {
  const ignored: SampleResult[] = []
  const remaining: SampleResult[] = []
  for (const s of samples) {
    if (rules.some(r => matchesRule(s, r))) ignored.push(s)
    else remaining.push(s)
  }
  return { ignored, remaining }
}

export function loadRules(): IgnoreRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeRules(rules: IgnoreRule[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    /* localStorage may be unavailable (private mode); fail silently */
  }
}

export function saveRule(rule: Omit<IgnoreRule, 'id' | 'createdAt'>): IgnoreRule {
  const id = `${rule.matchType}:${rule.matchValue}`
  const full: IgnoreRule = { ...rule, id, createdAt: new Date().toISOString() }
  const rules = loadRules().filter(r => r.id !== id)
  rules.push(full)
  writeRules(rules)
  return full
}

export function deleteRule(id: string): void {
  writeRules(loadRules().filter(r => r.id !== id))
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

function uniqueValues(failures: SampleResult[], field: 'suite' | 'category' | 'tag'): string[] {
  const set = new Set<string>()
  for (const f of failures) {
    if (field === 'tag') f.tags.forEach(t => set.add(t))
    else set.add(f[field])
  }
  return [...set].sort()
}

const MATCH_TYPES: IgnoreRule['matchType'][] = ['sample_id', 'suite', 'category', 'tag']

const MATCH_TYPE_LABEL: Record<IgnoreRule['matchType'], string> = {
  sample_id: 'sample_id',
  suite: 'suite',
  category: 'category',
  tag: 'tag',
}

export function IgnoreRules({ failures, onChange }: IgnoreRulesProps) {
  const [rules, setRules] = useState<IgnoreRule[]>(() => loadRules())
  const [matchType, setMatchType] = useState<IgnoreRule['matchType']>('sample_id')
  const [matchValue, setMatchValue] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    onChange?.(rules)
  }, [rules, onChange])

  function refresh(next: IgnoreRule[]) {
    setRules(next)
  }

  function handleAdd() {
    if (!matchValue.trim() || !reason.trim()) return
    saveRule({ matchType, matchValue: matchValue.trim(), reason: reason.trim() })
    refresh(loadRules())
    setMatchValue('')
    setReason('')
  }

  function handleDelete(id: string) {
    deleteRule(id)
    refresh(loadRules())
  }

  function quickIgnore(sampleId: string) {
    saveRule({ matchType: 'sample_id', matchValue: sampleId, reason: '待补充' })
    refresh(loadRules())
  }

  const { ignored, remaining } = applyIgnoreRules(failures, rules)
  const originalFailCount = failures.length
  const adjustedFailCount = remaining.length
  const originalScore = 0
  const adjustedScore = originalFailCount > 0 ? (ignored.length / originalFailCount) * 100 : 0
  const scoreRose = adjustedScore > originalScore

  const quickAddSamples = [...failures]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 10)

  const suiteOptions = uniqueValues(failures, 'suite')
  const categoryOptions = uniqueValues(failures, 'category')
  const tagOptions = uniqueValues(failures, 'tag')
  const dropdownOptions = matchType === 'suite' ? suiteOptions
    : matchType === 'category' ? categoryOptions
      : matchType === 'tag' ? tagOptions : []

  return (
    <Panel title="忽略规则">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>
          {rules.length} 条规则 · 排除 {ignored.length} 个失败样本
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: theme.textDim }}>
            {originalScore.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: theme.textFaint }}>→</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: scoreRose ? theme.success : theme.textDim }}>
            {adjustedScore.toFixed(1)}
          </span>
          {scoreRose && (
            <span style={{ fontSize: 12, color: theme.success }}>
              ↑ {(adjustedScore - originalScore).toFixed(1)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: theme.radiusSm, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <div style={{ width: originalFailCount > 0 ? `${(adjustedFailCount / originalFailCount) * 100}%` : '0%', background: theme.danger, transition: theme.transition }} />
          <div style={{ flex: 1, background: theme.success + '30' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textFaint, marginTop: 4 }}>
          <span>原始失败 {originalFailCount}</span>
          <span>排除后失败 {adjustedFailCount}</span>
        </div>
      </div>

      <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <Field label="匹配类型">
            <div style={{ display: 'flex', gap: 4 }}>
              {MATCH_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => { setMatchType(t); setMatchValue('') }}
                  style={{
                    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                    background: matchType === t ? theme.primary + '18' : theme.bg,
                    border: `1px solid ${matchType === t ? theme.primary : theme.border}`,
                    borderRadius: theme.radiusSm,
                    color: matchType === t ? theme.primary : theme.textDim,
                    transition: theme.transition,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="匹配值">
            {matchType === 'sample_id' ? (
              <input
                value={matchValue}
                onChange={e => setMatchValue(e.target.value)}
                placeholder="如 inj-001"
                style={inputStyle}
              />
            ) : (
              <select value={matchValue} onChange={e => setMatchValue(e.target.value)} style={inputStyle}>
                <option value="">选择…</option>
                {dropdownOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </Field>

          <Field label="原因">
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="如：已知行为，不影响业务"
              style={{ ...inputStyle, minWidth: 220 }}
            />
          </Field>
        </div>
        <button
          onClick={handleAdd}
          disabled={!matchValue.trim() || !reason.trim()}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: theme.primary + '18', border: `1px solid ${theme.primary}`,
            borderRadius: theme.radiusSm, color: theme.primary,
            opacity: (!matchValue.trim() || !reason.trim()) ? 0.5 : 1,
            transition: theme.transition,
          }}
        >
          添加规则
        </button>
      </div>

      <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>快速添加</div>
        {quickAddSamples.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.textFaint }}>当前无失败样本</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {quickAddSamples.map(s => {
              const covered = rules.some(r => matchesRule(s, r))
              return (
                <div key={s.sample_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                  borderRadius: theme.radiusSm, background: covered ? theme.bg : 'transparent',
                  opacity: covered ? 0.5 : 1,
                }}>
                  <SeverityBadge severity={s.severity} />
                  <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.text }}>{s.sample_id}</span>
                  <MonoTag tone="dim">{s.suite}</MonoTag>
                  <span style={{ flex: 1, fontSize: 12, color: theme.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncate(s.question, 60)}
                  </span>
                  {covered ? (
                    <span style={{ fontSize: 11, color: theme.textFaint }}>已忽略</span>
                  ) : (
                    <button
                      onClick={() => quickIgnore(s.sample_id)}
                      style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: theme.bg, border: `1px solid ${theme.border}`,
                        borderRadius: theme.radiusSm, color: theme.textDim,
                        transition: theme.transition,
                      }}
                    >
                      忽略
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>已保存规则</div>
        {rules.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.textFaint }}>暂无规则</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rules.map(r => {
              const affected = failures.filter(s => matchesRule(s, r)).length
              const unmatched = affected === 0
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`,
                  opacity: unmatched ? 0.5 : 1,
                }}>
                  <MonoTag tone="dim">{MATCH_TYPE_LABEL[r.matchType]}</MonoTag>
                  <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.text }}>{r.matchValue}</span>
                  <span style={{ fontSize: 12, color: theme.textDim, flex: 1 }}>{r.reason}</span>
                  <span style={{ fontSize: 11, color: theme.textFaint }}>{relativeTime(r.createdAt)}</span>
                  <span style={{ fontSize: 11, color: unmatched ? theme.textFaint : theme.primary }}>
                    {unmatched ? '未匹配任何样本' : `影响 ${affected} 个样本`}
                  </span>
                  <button
                    onClick={() => handleDelete(r.id)}
                    style={{
                      width: 22, height: 22, lineHeight: '20px', textAlign: 'center',
                      background: 'transparent', border: `1px solid ${theme.danger}`,
                      borderRadius: theme.radiusSm, color: theme.danger, cursor: 'pointer',
                      fontSize: 12, transition: theme.transition,
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical': return 4
    case 'high': return 3
    case 'medium': return 2
    case 'low': return 1
    default: return 0
  }
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
}
