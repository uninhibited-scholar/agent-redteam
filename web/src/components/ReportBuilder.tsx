/**
 * ReportBuilder — pick which sections a Markdown report should contain
 * (summary for management, failure detail for engineers, ...), customize
 * title/branding, then preview and download.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, Field } from './ui'
import type { ScanReport, SampleResult, SuiteResult } from '../types'

interface ReportBuilderProps {
  report: ScanReport
}

interface ReportSections {
  summary: boolean
  suiteDetails: boolean
  failures: boolean
  remediation: boolean
  compliance: boolean
  appendix: boolean
}

interface ReportConfig {
  title: string
  subtitle: string
  sections: ReportSections
  failureFilter: 'all' | 'critical-high'
  responseTruncate: number
}

type SectionKey = keyof ReportSections

const SECTION_META: Array<{ key: SectionKey; icon: string; name: string; description: string; defaultOn: boolean }> = [
  { key: 'summary', icon: '📊', name: '执行摘要', description: '总分 + pass/fail 概览 + 一句话结论', defaultOn: true },
  { key: 'suiteDetails', icon: '📋', name: '套件明细', description: '各套件分数表 + 评级', defaultOn: true },
  { key: 'failures', icon: '🚨', name: '失败样本', description: '所有 fail 样本的 ID + 问题 + 响应', defaultOn: true },
  { key: 'remediation', icon: '🛠️', name: '修复建议', description: '从失败模式生成的加固建议', defaultOn: false },
  { key: 'compliance', icon: '⚖️', name: 'OWASP 合规矩阵', description: '各类别的合规状态', defaultOn: false },
  { key: 'appendix', icon: '📎', name: '附录：完整数据', description: 'JSON 格式的所有样本', defaultOn: false },
]

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

function conclusion(score: number): string {
  if (score >= 80) return '安全表现良好'
  if (score >= 50) return '存在中等风险'
  return '存在严重风险'
}

function suiteStatus(score: number): string {
  if (score >= 80) return '合规'
  if (score >= 50) return '部分合规'
  return '不合规'
}

function truncate(text: string, len: number): string {
  return text.length > len ? `${text.slice(0, len)}…` : text
}

function buildSummarySection(report: ScanReport): string[] {
  const lines: string[] = []
  lines.push('## 执行摘要', '')
  lines.push(`- 模型：${report.target_model}`)
  lines.push(`- 总分：${report.overall_score.toFixed(1)}/100（${scoreToGrade(report.overall_score)}）`)
  lines.push(`- 样本：${report.total_samples}（${report.total_passed} passed · ${report.total_failed} failed）`)
  lines.push(`- 结论：${conclusion(report.overall_score)}`)
  lines.push('')
  return lines
}

function buildSuiteDetailsSection(suites: SuiteResult[]): string[] {
  const lines: string[] = []
  lines.push('## 套件明细', '')
  lines.push('| 套件 | 分数 | 评级 | Pass/Fail |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of suites) {
    lines.push(`| ${s.name} | ${s.score.toFixed(1)} | ${scoreToGrade(s.score)} | ${s.passed}/${s.failed} |`)
  }
  lines.push('')
  return lines
}

function buildFailuresSection(samples: SampleResult[], filter: ReportConfig['failureFilter'], truncateLen: number): string[] {
  const lines: string[] = []
  lines.push('## 失败样本', '')
  let fails = samples.filter(s => s.verdict === 'fail')
  if (filter === 'critical-high') {
    fails = fails.filter(s => s.severity === 'critical' || s.severity === 'high')
  }
  if (fails.length === 0) {
    lines.push('无匹配的失败样本。', '')
    return lines
  }
  for (const s of fails) {
    lines.push(`### ${s.sample_id}（${s.severity}）`, '')
    lines.push(`**问题**：${s.question}`, '')
    lines.push(`**响应**：${truncate(s.response, truncateLen)}`, '')
  }
  return lines
}

/** Simple per-suite hardening guidance, derived from suite name (no external data). */
function remediationSteps(suiteName: string): string[] {
  return [
    `审查 ${suiteName} 相关的系统提示与工具权限边界`,
    '对失败样本的攻击模式做正则/语义层面的输入过滤',
    '加入针对该套件的回归测试，纳入 CI 门禁',
  ]
}

function buildRemediationSection(suites: SuiteResult[], samples: SampleResult[]): string[] {
  const lines: string[] = []
  lines.push('## 修复建议', '')
  const weak = suites.filter(s => s.failed > 0).sort((a, b) => b.failed - a.failed)
  if (weak.length === 0) {
    lines.push('未发现需要修复的套件。', '')
    return lines
  }
  for (const s of weak) {
    const failCount = samples.filter(sm => sm.suite === s.name && sm.verdict === 'fail').length
    lines.push(`### ${s.name}（${failCount} 个失败）`, '')
    remediationSteps(s.name).forEach((step, i) => lines.push(`${i + 1}. ${step}`))
    lines.push('')
  }
  return lines
}

function buildComplianceSection(suites: SuiteResult[]): string[] {
  const lines: string[] = []
  lines.push('## OWASP 合规矩阵', '')
  lines.push('| OWASP | 类别 | 状态 | 分数 |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of suites) {
    lines.push(`| ${s.owasp ?? '—'} | ${s.name} | ${suiteStatus(s.score)} | ${s.score.toFixed(1)} |`)
  }
  lines.push('')
  return lines
}

function buildAppendixSection(samples: SampleResult[]): string[] {
  return ['## 附录：完整数据', '', '```json', JSON.stringify(samples, null, 2), '```', '']
}

export function buildReport(report: ScanReport, config: ReportConfig): string {
  const lines: string[] = []
  const date = (report.finished_at || new Date().toISOString()).slice(0, 10)
  lines.push(`# ${config.title}`, '')
  lines.push(`> ${config.subtitle} · ${date}`, '')

  const samples = report.samples ?? []

  if (config.sections.summary) lines.push(...buildSummarySection(report))
  if (config.sections.suiteDetails) lines.push(...buildSuiteDetailsSection(report.suites))
  if (config.sections.failures) lines.push(...buildFailuresSection(samples, config.failureFilter, config.responseTruncate))
  if (config.sections.remediation) lines.push(...buildRemediationSection(report.suites, samples))
  if (config.sections.compliance) lines.push(...buildComplianceSection(report.suites))
  if (config.sections.appendix) lines.push(...buildAppendixSection(samples))

  return lines.join('\n')
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: theme.bg,
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

export function ReportBuilder({ report }: ReportBuilderProps) {
  const [title, setTitle] = useState(`${report.target_model} 安全扫描报告`)
  const [subtitle, setSubtitle] = useState('Generated by agent-redteam')
  const [sections, setSections] = useState<ReportSections>(() =>
    SECTION_META.reduce((acc, s) => ({ ...acc, [s.key]: s.defaultOn }), {} as ReportSections))
  const [failureFilter, setFailureFilter] = useState<ReportConfig['failureFilter']>('all')
  const [responseTruncate, setResponseTruncate] = useState(200)
  const [showPreview, setShowPreview] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  function toggleSection(key: SectionKey) {
    setSections(s => ({ ...s, [key]: !s[key] }))
  }

  function currentConfig(): ReportConfig {
    return { title, subtitle, sections, failureFilter, responseTruncate }
  }

  function flash(message: string) {
    setFeedback(message)
    setTimeout(() => setFeedback(null), 2000)
  }

  function handleDownload() {
    const md = buildReport(report, currentConfig())
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'report'}.md`
    a.click()
    URL.revokeObjectURL(url)
    flash('已下载')
  }

  async function handleCopy() {
    await navigator.clipboard?.writeText(buildReport(report, currentConfig()))
    flash('已复制！')
  }

  const previewText = showPreview ? buildReport(report, currentConfig()).split('\n').slice(0, 40).join('\n') : ''

  return (
    <Panel title="自定义报告">
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Field label="报告标题">
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="副标题 / 品牌信息">
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      </div>

      <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 16 }}>
        日期：{(report.finished_at || new Date().toISOString()).slice(0, 10)}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {SECTION_META.map(s => {
          const checked = sections[s.key]
          return (
            <label
              key={s.key}
              style={{
                display: 'flex', gap: 8, padding: 10, cursor: 'pointer',
                background: checked ? theme.primary + '10' : theme.bg,
                border: `1px solid ${checked ? theme.primary : theme.border}`,
                borderRadius: theme.radius, transition: theme.transition,
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleSection(s.key)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12.5, color: theme.text, fontWeight: 600 }}>{s.icon} {s.name}</div>
                <div style={{ fontSize: 11, color: theme.textFaint }}>{s.description}</div>
              </div>
            </label>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Field label="失败样本范围">
          <select
            value={failureFilter}
            onChange={e => setFailureFilter(e.target.value as ReportConfig['failureFilter'])}
            style={inputStyle}
          >
            <option value="all">全部</option>
            <option value="critical-high">仅 critical/high</option>
          </select>
        </Field>
        <Field label="响应截断长度">
          <input
            type="number"
            value={responseTruncate}
            onChange={e => setResponseTruncate(Number(e.target.value))}
            style={{ ...inputStyle, width: 100 }}
          />
        </Field>
        <Field label="趋势对比" hint="暂无历史扫描数据源可用（组件仅接收单次 report）">
          <input type="checkbox" disabled />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: showPreview ? 12 : 0 }}>
        <button onClick={() => setShowPreview(v => !v)} style={secondaryButtonStyle}>
          {showPreview ? '收起预览' : '预览'}
        </button>
        <button onClick={handleDownload} style={primaryButtonStyle}>下载 Markdown</button>
        <button onClick={handleCopy} style={secondaryButtonStyle}>复制到剪贴板</button>
      </div>

      {feedback && (
        <div style={{ fontSize: 12, color: theme.success, marginBottom: 8 }}>{feedback}</div>
      )}

      {showPreview && (
        <pre style={{
          fontSize: 11.5, color: theme.text, fontFamily: theme.monoFamily,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
          background: theme.bg, padding: 12, borderRadius: theme.radiusSm,
          border: `1px solid ${theme.border}`, maxHeight: 400, overflowY: 'auto', margin: 0,
        }}>
          {previewText}
        </pre>
      )}
    </Panel>
  )
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, fontWeight: 600,
  background: theme.primary, border: 'none', borderRadius: theme.radiusSm,
  color: theme.bg, cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, background: 'transparent',
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, cursor: 'pointer',
}
