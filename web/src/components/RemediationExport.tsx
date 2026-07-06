/**
 * RemediationExport — export per-suite hardening recommendations as a
 * Markdown document, or copy the same content to the clipboard.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

export interface RemediationItem {
  suite: string
  title: string
  steps: string[]
  refs: string[]
  failCount: number
  riskScore: number
}

interface RemediationExportProps {
  items: RemediationItem[]
  modelLabel: string
}

export function remediationToMarkdown(items: RemediationItem[], modelLabel: string): string {
  const sorted = [...items].sort((a, b) => b.riskScore - a.riskScore)
  const totalFail = items.reduce((sum, i) => sum + i.failCount, 0)

  const lines: string[] = []
  lines.push(`# ${modelLabel} 安全修复建议`)
  lines.push('')
  lines.push('> 基于 agent-redteam 扫描结果自动生成')
  lines.push('')
  lines.push('## 风险摘要')
  lines.push(`- 受影响套件：${items.length} 个`)
  lines.push(`- 总失败样本：${totalFail} 个`)
  lines.push('')

  sorted.forEach((item, i) => {
    lines.push(`## ${i + 1}. ${item.title}（${item.suite}）`)
    lines.push('')
    lines.push(`**风险分：${item.riskScore} · 失败：${item.failCount} 个**`)
    lines.push('')
    lines.push('### 建议措施')
    item.steps.forEach((step, si) => lines.push(`${si + 1}. ${step}`))
    lines.push('')
    lines.push('### 参考')
    item.refs.forEach(ref => lines.push(`- ${ref}`))
    lines.push('')
  })

  return lines.join('\n')
}

export function RemediationExport({ items, modelLabel }: RemediationExportProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  function flash(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2000)
  }

  function handleDownload() {
    const md = remediationToMarkdown(items, modelLabel)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${modelLabel}-remediation.md`
    a.click()
    URL.revokeObjectURL(url)
    flash('已下载')
  }

  async function handleCopy() {
    const md = remediationToMarkdown(items, modelLabel)
    await navigator.clipboard.writeText(md)
    flash('已复制！')
  }

  const totalFail = items.reduce((sum, i) => sum + i.failCount, 0)

  return (
    <Panel
      title="导出修复建议"
      subtitle={`${items.length} 个套件 · ${totalFail} 个失败`}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={handleDownload}
          style={{
            flex: 1, padding: '10px 16px',
            background: theme.primary, border: 'none',
            borderRadius: theme.radiusSm, color: theme.bg,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          导出 Markdown
        </button>
        <button
          onClick={handleCopy}
          style={{
            flex: 1, padding: '10px 16px',
            background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          复制全部
        </button>
      </div>

      {feedback && (
        <div style={{
          marginTop: 12, fontSize: 12, color: theme.success,
          textAlign: 'center',
        }}>
          {feedback}
        </div>
      )}
    </Panel>
  )
}
