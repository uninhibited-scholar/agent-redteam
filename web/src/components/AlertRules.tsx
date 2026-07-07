/**
 * AlertRules — release-gate rule engine. Users define conditions ("overall
 * score below 70", "critical failure in a suite", "3+ regressions"); once a
 * report is loaded every enabled rule is evaluated and triggered alerts are
 * shown inline. Intended as the CI/CD gate before shipping a model update.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult, SampleResult } from '../types'

export type AlertCondition =
  | { type: 'overall_below'; threshold: number }
  | { type: 'suite_below'; suite: string; threshold: number }
  | { type: 'severity_count'; severity: string; minCount: number }
  | { type: 'regression_count'; minCount: number }
  | { type: 'fail_rate_above'; threshold: number } // 0-1

export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  level: 'critical' | 'warning' | 'info'
  condition: AlertCondition
  message: string
}

interface ReportLike {
  overallScore: number
  suites: SuiteResult[]
  samples: SampleResult[]
}

interface AlertRulesProps {
  /** 当前扫描数据（用于规则评估预览） */
  report?: ReportLike | null
  /** 规则变化回调 */
  onChange?: (rules: AlertRule[]) => void
}

const STORAGE_KEY = 'agent-redteam:alert-rules'
const CONDITION_TYPES = ['overall_below', 'suite_below', 'severity_count', 'regression_count', 'fail_rate_above'] as const
type ConditionType = typeof CONDITION_TYPES[number]

const LEVEL_COLOR: Record<AlertRule['level'], string> = {
  critical: theme.danger, warning: theme.warning, info: theme.primary,
}

// --- localStorage persistence -------------------------------------------

export function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeRules(rules: AlertRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    /* localStorage may be unavailable (private mode); fail silently */
  }
}

export function saveRule(rule: AlertRule): void {
  const rules = loadRules().filter(r => r.id !== rule.id)
  rules.push(rule)
  writeRules(rules)
}

export function deleteRule(id: string): void {
  writeRules(loadRules().filter(r => r.id !== id))
}

export function toggleRule(id: string): void {
  writeRules(loadRules().map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
}

// --- Evaluation engine ----------------------------------------------------

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => vars[key] ?? m)
}

export function evaluateRule(
  rule: AlertRule,
  report: ReportLike,
): { triggered: boolean; actualValue: string; renderedMessage: string } {
  const c = rule.condition
  let triggered = false
  let actualValue = ''
  const vars: Record<string, string> = { score: report.overallScore.toFixed(1) }

  switch (c.type) {
    case 'overall_below': {
      triggered = report.overallScore < c.threshold
      actualValue = `总分 ${report.overallScore.toFixed(1)} < ${c.threshold}`
      break
    }
    case 'suite_below': {
      const suite = report.suites.find(s => s.name === c.suite)
      vars.suite = c.suite
      if (!suite) {
        actualValue = `套件 ${c.suite} 不存在`
      } else {
        triggered = suite.score < c.threshold
        actualValue = `${c.suite} 分数 ${suite.score.toFixed(1)} < ${c.threshold}`
      }
      break
    }
    case 'severity_count': {
      const count = report.samples.filter(s => s.verdict === 'fail' && s.severity === c.severity).length
      vars.count = String(count)
      triggered = count >= c.minCount
      actualValue = `${c.severity} 失败数 ${count} >= ${c.minCount}`
      break
    }
    case 'regression_count': {
      // No baseline data is threaded through this component — always skipped.
      triggered = false
      actualValue = '无基线数据，跳过回归检查'
      break
    }
    case 'fail_rate_above': {
      const total = report.samples.length
      const failed = report.samples.filter(s => s.verdict === 'fail').length
      const rate = total ? failed / total : 0
      vars.count = (rate * 100).toFixed(1)
      triggered = rate >= c.threshold
      actualValue = `失败率 ${(rate * 100).toFixed(1)}% >= ${(c.threshold * 100).toFixed(0)}%`
      break
    }
  }

  return { triggered, actualValue, renderedMessage: renderTemplate(rule.message, vars) }
}

export function evaluateAllRules(
  rules: AlertRule[],
  report: ReportLike,
): Array<{ rule: AlertRule; triggered: boolean; actualValue: string; renderedMessage: string }> {
  return rules.filter(r => r.enabled).map(rule => ({ rule, ...evaluateRule(rule, report) }))
}

// --- Human-readable condition summaries -----------------------------------

function summarizeCondition(c: AlertCondition): string {
  switch (c.type) {
    case 'overall_below': return `总分低于 ${c.threshold}`
    case 'suite_below': return `${c.suite} 分数低于 ${c.threshold}`
    case 'severity_count': return `${c.severity} 失败数 >= ${c.minCount}`
    case 'regression_count': return `回归数 >= ${c.minCount}`
    case 'fail_rate_above': return `失败率 >= ${(c.threshold * 100).toFixed(0)}%`
  }
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

export function AlertRules({ report, onChange }: AlertRulesProps) {
  const [rules, setRules] = useState<AlertRule[]>(() => loadRules())
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState<AlertRule['level']>('warning')
  const [condType, setCondType] = useState<ConditionType>('overall_below')
  const [threshold, setThreshold] = useState(70)
  const [suite, setSuite] = useState('')
  const [severity, setSeverity] = useState('critical')
  const [minCount, setMinCount] = useState(1)
  const [failPct, setFailPct] = useState(30)
  const [message, setMessage] = useState('')

  const suiteNames = (report?.suites || []).map(s => s.name)

  function refresh(next: AlertRule[]) {
    setRules(next)
    onChange?.(next)
  }

  function resetForm() {
    setEditing(false); setEditId(null); setName(''); setLevel('warning')
    setCondType('overall_below'); setThreshold(70); setSuite(''); setSeverity('critical')
    setMinCount(1); setFailPct(30); setMessage('')
  }

  function startAdd() {
    resetForm()
    setEditing(true)
  }

  function startEdit(rule: AlertRule) {
    setEditId(rule.id)
    setName(rule.name)
    setLevel(rule.level)
    setCondType(rule.condition.type)
    setMessage(rule.message)
    const c = rule.condition
    if (c.type === 'overall_below' || c.type === 'suite_below') setThreshold(c.threshold)
    if (c.type === 'suite_below') setSuite(c.suite)
    if (c.type === 'severity_count') { setSeverity(c.severity); setMinCount(c.minCount) }
    if (c.type === 'regression_count') setMinCount(c.minCount)
    if (c.type === 'fail_rate_above') setFailPct(Math.round(c.threshold * 100))
    setEditing(true)
  }

  function buildCondition(): AlertCondition {
    switch (condType) {
      case 'overall_below': return { type: condType, threshold }
      case 'suite_below': return { type: condType, suite: suite || suiteNames[0] || '', threshold }
      case 'severity_count': return { type: condType, severity, minCount }
      case 'regression_count': return { type: condType, minCount }
      case 'fail_rate_above': return { type: condType, threshold: failPct / 100 }
    }
  }

  function handleSave() {
    if (!name.trim()) return
    const rule: AlertRule = {
      id: editId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      enabled: true,
      level,
      condition: buildCondition(),
      message: message.trim() || name.trim(),
    }
    saveRule(rule)
    refresh(loadRules())
    resetForm()
  }

  function handleDelete(id: string) {
    deleteRule(id)
    refresh(loadRules())
  }

  function handleToggle(id: string) {
    toggleRule(id)
    refresh(loadRules())
  }

  const results = report ? evaluateAllRules(rules, report) : []
  const triggeredResults = results.filter(r => r.triggered)

  return (
    <Panel title="告警规则" subtitle="扫描后自动检查的条件">
      {/* Region 1: evaluation results */}
      <div style={{ marginBottom: 20 }}>
        {!report ? (
          <div style={{ padding: '14px 0', textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            等待扫描数据
          </div>
        ) : rules.filter(r => r.enabled).length === 0 ? (
          <div style={{ padding: '14px 0', textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            没有启用的规则
          </div>
        ) : triggeredResults.length === 0 ? (
          <div style={{
            padding: '14px 12px', textAlign: 'center', color: theme.success, fontSize: 13,
            background: theme.success + '0C', borderRadius: theme.radiusSm,
          }}>
            ✓ 所有规则通过，可安全发布
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {triggeredResults.map(r => (
              <div
                key={r.rule.id}
                style={{
                  padding: '10px 12px', borderRadius: theme.radiusSm,
                  borderLeft: `3px solid ${LEVEL_COLOR[r.rule.level]}`,
                  background: LEVEL_COLOR[r.rule.level] + '0C',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{r.rule.name}</span>
                  <MonoTag tone={r.rule.level === 'info' ? 'primary' : 'dim'}>{r.rule.level}</MonoTag>
                </div>
                <div style={{ fontSize: 12, color: theme.textDim }}>{r.renderedMessage}</div>
                <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2, fontFamily: theme.monoFamily }}>
                  {r.actualValue}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Region 2: rule list */}
      <div style={{ marginBottom: editing ? 16 : 0 }}>
        {rules.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            还没有告警规则
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rules.map(rule => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={() => handleToggle(rule.id)}
                onEdit={() => startEdit(rule)}
                onDelete={() => handleDelete(rule.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Region 3: add/edit form */}
      {editing ? (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>规则名</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="如：发布门禁：总分≥70" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>级别</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['critical', 'warning', 'info'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    style={{
                      padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                      background: level === l ? LEVEL_COLOR[l] + '18' : theme.bg,
                      border: `1px solid ${level === l ? LEVEL_COLOR[l] : theme.border}`,
                      borderRadius: theme.radiusSm, color: level === l ? LEVEL_COLOR[l] : theme.textDim,
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>条件类型</div>
            <select value={condType} onChange={e => setCondType(e.target.value as ConditionType)} style={{ ...inputStyle, width: '100%' }}>
              {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <ConditionFields
            condType={condType}
            threshold={threshold} setThreshold={setThreshold}
            suite={suite} setSuite={setSuite} suiteNames={suiteNames}
            severity={severity} setSeverity={setSeverity}
            minCount={minCount} setMinCount={setMinCount}
            failPct={failPct} setFailPct={setFailPct}
          />

          <div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>消息模板（支持 {'{score}'} {'{suite}'} {'{count}'}）</div>
            <input value={message} onChange={e => setMessage(e.target.value)} placeholder="如：总分 {score} 未达标" style={{ ...inputStyle, width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: theme.primary + '18', border: `1px solid ${theme.primary}`,
                borderRadius: theme.radiusSm, color: theme.primary,
                opacity: !name.trim() ? 0.5 : 1,
              }}
            >
              保存
            </button>
            <button
              onClick={resetForm}
              style={{
                padding: '8px 16px', fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm, color: theme.textDim,
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: rules.length === 0 ? 0 : 12 }}>
          <button
            onClick={startAdd}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: theme.primary + '18', border: `1px solid ${theme.primary}`,
              borderRadius: theme.radiusSm, color: theme.primary,
            }}
          >
            + 新建规则
          </button>
        </div>
      )}
    </Panel>
  )
}

function RuleRow({ rule, onToggle, onEdit, onDelete }: {
  rule: AlertRule
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setConfirmDelete(false) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`,
        opacity: rule.enabled ? 1 : 0.5, transition: theme.transition,
      }}
    >
      <input type="checkbox" checked={rule.enabled} onChange={onToggle} style={{ cursor: 'pointer', accentColor: theme.primary }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap' }}>{rule.name}</span>
      <MonoTag tone={rule.level === 'info' ? 'primary' : 'dim'}>{rule.level}</MonoTag>
      <span style={{ flex: 1, fontSize: 12, color: theme.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summarizeCondition(rule.condition)}
      </span>
      {hover && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={smallBtnStyle}>编辑</button>
          {confirmDelete ? (
            <button onClick={onDelete} style={{ ...smallBtnStyle, color: theme.danger, borderColor: theme.danger }}>确认删除？</button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ ...smallBtnStyle, color: theme.danger }}>✕</button>
          )}
        </div>
      )}
    </div>
  )
}

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 10px', fontSize: 11, cursor: 'pointer',
  background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.textDim,
}

function ConditionFields({
  condType, threshold, setThreshold, suite, setSuite, suiteNames,
  severity, setSeverity, minCount, setMinCount, failPct, setFailPct,
}: {
  condType: ConditionType
  threshold: number; setThreshold: (n: number) => void
  suite: string; setSuite: (s: string) => void; suiteNames: string[]
  severity: string; setSeverity: (s: string) => void
  minCount: number; setMinCount: (n: number) => void
  failPct: number; setFailPct: (n: number) => void
}) {
  if (condType === 'overall_below') {
    return (
      <LabeledInput label="阈值">
        <input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
      </LabeledInput>
    )
  }
  if (condType === 'suite_below') {
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <LabeledInput label="套件">
          <select value={suite} onChange={e => setSuite(e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
            <option value="">选择…</option>
            {suiteNames.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="阈值">
          <input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
        </LabeledInput>
      </div>
    )
  }
  if (condType === 'severity_count') {
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <LabeledInput label="严重度">
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
            {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="最小计数">
          <input type="number" value={minCount} onChange={e => setMinCount(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
        </LabeledInput>
      </div>
    )
  }
  if (condType === 'regression_count') {
    return (
      <LabeledInput label="最小回归数">
        <input type="number" value={minCount} onChange={e => setMinCount(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
      </LabeledInput>
    )
  }
  return (
    <LabeledInput label="失败率阈值（%）">
      <input type="number" min={0} max={100} value={failPct} onChange={e => setFailPct(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
    </LabeledInput>
  )
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
