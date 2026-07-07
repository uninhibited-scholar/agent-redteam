/**
 * ThreatIntelFeed — curated feed of AI security threat intelligence, read
 * from a built-in knowledge base (no network calls). Each entry links to an
 * OWASP LLM Top 10 category and the suites that test for it, so users can
 * see what's currently happening in AI security.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

interface IntelItem {
  id: string
  title: string             // 如 "Prompt injection via base64 encoding"
  summary: string           // 一段话描述
  owaspCategory: string     // 如 "LLM01"
  relatedSuites: string[]   // 如 ["injection", "tool_abuse"]
  severity: 'critical' | 'high' | 'medium' | 'low'
  date: string              // ISO
  source: string            // 如 "OWASP", "NIST AI RMF", "arXiv"
}

interface ThreatIntelFeedProps {
  /** 额外的情报项（用户扫描发现的新威胁可动态注入） */
  customItems?: IntelItem[]
  /** 最多显示多少条，默认 20 */
  maxItems?: number
  /** 点击某条情报回调 */
  onSelect?: (item: IntelItem) => void
}

export const DEFAULT_INTEL: IntelItem[] = [
  {
    id: 'intel-001',
    title: 'Prompt injection via base64-encoded payloads',
    summary: '攻击者将注入指令用 base64 编码，绕过基于关键词的输入过滤器；模型在解码后仍会执行被编码的指令，说明纯字符串黑名单防护不可靠。',
    owaspCategory: 'LLM01',
    relatedSuites: ['injection'],
    severity: 'critical',
    date: '2025-06',
    source: 'OWASP LLM Top 10',
  },
  {
    id: 'intel-002',
    title: 'Dependency confusion in AI plugin ecosystems',
    summary: '恶意包伪装成官方 Agent 插件/工具包发布到公共仓库，诱导开发者误装，从而在模型工具调用链中植入后门逻辑。',
    owaspCategory: 'LLM02',
    relatedSuites: ['supply_chain'],
    severity: 'high',
    date: '2025-04',
    source: 'NIST AI RMF',
  },
  {
    id: 'intel-003',
    title: 'System prompt leakage via indirect questioning',
    summary: '通过角色扮演、翻译请求等间接提问方式诱导模型逐段泄露 system prompt，直接询问会被拒绝，但迂回提问常常绕过防护。',
    owaspCategory: 'LLM06',
    relatedSuites: ['info_leak'],
    severity: 'medium',
    date: '2025-05',
    source: 'arXiv',
  },
  {
    id: 'intel-004',
    title: 'Recursive self-invocation causing resource exhaustion',
    summary: '攻击者构造让 Agent 反复调用自身或递归展开子任务的指令，耗尽 token 预算和计算资源，形成拒绝服务效果。',
    owaspCategory: 'LLM04',
    relatedSuites: ['model_dos'],
    severity: 'high',
    date: '2025-03',
    source: 'OWASP LLM Top 10',
  },
  {
    id: 'intel-005',
    title: 'Excessive agency: unconfirmed destructive tool calls',
    summary: '缺乏二次确认机制的 Agent 在收到模糊指令时会直接执行删除文件、发起转账等高风险工具调用，未对不可逆操作设置人工审批门槛。',
    owaspCategory: 'LLM05',
    relatedSuites: ['excessive_agency'],
    severity: 'critical',
    date: '2025-07',
    source: 'OWASP LLM Top 10',
  },
  {
    id: 'intel-006',
    title: 'Insecure output handling leads to stored XSS',
    summary: '模型生成的 HTML/Markdown 输出未经过滤直接渲染到前端，攻击者诱导模型输出包含 <script> 的内容，造成存储型 XSS。',
    owaspCategory: 'LLM07',
    relatedSuites: ['insecure_output'],
    severity: 'high',
    date: '2025-02',
    source: 'OWASP LLM Top 10',
  },
  {
    id: 'intel-007',
    title: 'PII extraction through multi-turn context accumulation',
    summary: '攻击者不在单轮请求敏感信息，而是通过多轮对话逐步拼凑上下文，最终诱导模型间接输出训练数据中记忆的个人信息片段。',
    owaspCategory: 'LLM08',
    relatedSuites: ['sensitive_data'],
    severity: 'medium',
    date: '2025-05',
    source: 'arXiv',
  },
  {
    id: 'intel-008',
    title: 'Over-refusal on legitimate security research queries',
    summary: '过度保守的安全对齐导致模型拒绝回答合法的渗透测试、CTF 教学类问题，损害了正当安全研究和教育场景的可用性。',
    owaspCategory: 'LLM09',
    relatedSuites: ['over_refusal'],
    severity: 'low',
    date: '2025-06',
    source: 'NIST AI RMF',
  },
  {
    id: 'intel-009',
    title: 'Overreliance on hallucinated API signatures',
    summary: '模型自信地编造不存在的函数签名或库 API，下游 Agent 未做校验直接调用，导致运行时错误甚至被利用来加载恶意同名包。',
    owaspCategory: 'LLM10',
    relatedSuites: ['over_dependency'],
    severity: 'medium',
    date: '2025-01',
    source: 'arXiv',
  },
  {
    id: 'intel-010',
    title: 'Tool abuse via chained function-calling escalation',
    summary: '攻击者利用一系列表面无害的工具调用组合（如先读取配置再写入计划任务）逐步提升权限，单步审查难以发现整体攻击链路。',
    owaspCategory: 'LLM01',
    relatedSuites: ['tool_abuse', 'injection'],
    severity: 'high',
    date: '2025-04',
    source: 'OWASP LLM Top 10',
  },
]

const OWASP_ORDER = ['ALL', 'LLM01', 'LLM02', 'LLM03', 'LLM04', 'LLM05', 'LLM06', 'LLM07', 'LLM08', 'LLM09', 'LLM10']
const SEVERITIES: IntelItem['severity'][] = ['critical', 'high', 'medium', 'low']

function severityColor(sev: IntelItem['severity']): string {
  if (sev === 'critical') return theme.danger
  if (sev === 'high') return '#FF6E40'
  if (sev === 'medium') return theme.warning
  return theme.success
}

function IntelCard({ item, onSelect }: { item: IntelItem; onSelect?: (item: IntelItem) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const color = severityColor(item.severity)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(item)}
      style={{
        borderLeft: `3px solid ${color}`,
        background: hovered ? theme.surfaceHover : theme.surface,
        border: `1px solid ${theme.border}`,
        borderLeftWidth: 3, borderLeftColor: color,
        borderRadius: theme.radius,
        padding: '12px 14px',
        cursor: onSelect ? 'pointer' : 'default',
        transition: theme.transition,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 4 }}>
        {item.title}
      </div>
      <div
        onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        style={{
          fontSize: 12, color: theme.textDim, lineHeight: 1.5, cursor: 'pointer',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}
      >
        {item.summary}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <MonoTag tone="primary">{item.owaspCategory}</MonoTag>
        {item.relatedSuites.map(s => (
          <MonoTag key={s} tone="dim">{s.replace(/_/g, ' ')}</MonoTag>
        ))}
        <span style={{ fontSize: 10, color: theme.textFaint, marginLeft: 'auto' }}>{item.source}</span>
        <span style={{ fontSize: 10, color: theme.textFaint }}>{item.date}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
          color, background: color + '18', padding: '2px 7px', borderRadius: 10,
        }}>
          {item.severity}
        </span>
      </div>
    </div>
  )
}

export function ThreatIntelFeed({ customItems, maxItems = 20, onSelect }: ThreatIntelFeedProps) {
  const [query, setQuery] = useState('')
  const [owaspFilter, setOwaspFilter] = useState('ALL')
  const [severityFilter, setSeverityFilter] = useState<Set<IntelItem['severity']>>(new Set())

  const allItems = useMemo(() => [...(customItems || []), ...DEFAULT_INTEL], [customItems])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allItems.filter(item => {
      if (owaspFilter !== 'ALL' && item.owaspCategory !== owaspFilter) return false
      if (severityFilter.size > 0 && !severityFilter.has(item.severity)) return false
      if (q) {
        const hit = item.title.toLowerCase().includes(q)
          || item.summary.toLowerCase().includes(q)
          || item.relatedSuites.some(s => s.toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
  }, [allItems, query, owaspFilter, severityFilter])

  const visible = filtered.slice(0, maxItems)
  const hiddenCount = filtered.length - visible.length

  function toggleSeverity(sev: IntelItem['severity']) {
    setSeverityFilter(prev => {
      const next = new Set(prev)
      if (next.has(sev)) next.delete(sev)
      else next.add(sev)
      return next
    })
  }

  return (
    <Panel title="威胁情报" subtitle="AI 安全领域的最新发现">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索标题 / 摘要 / 相关套件..."
          style={{
            padding: '8px 12px', background: theme.bg,
            border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
            color: theme.text, fontSize: 12, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {OWASP_ORDER.map(cat => {
            const active = owaspFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setOwaspFilter(cat)}
                style={{
                  padding: '3px 9px', fontSize: 10, fontWeight: 700, fontFamily: theme.monoFamily,
                  background: active ? theme.primary + '18' : theme.bg,
                  border: `1px solid ${active ? theme.primary : theme.border}`,
                  borderRadius: 10, color: active ? theme.primary : theme.textDim,
                  cursor: 'pointer', transition: theme.transition,
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {SEVERITIES.map(sev => {
            const active = severityFilter.has(sev)
            const color = severityColor(sev)
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                style={{
                  padding: '3px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  background: active ? color + '18' : theme.bg,
                  border: `1px solid ${active ? color : theme.border}`,
                  borderRadius: 10, color: active ? color : theme.textDim,
                  cursor: 'pointer', transition: theme.transition,
                }}
              >
                {sev}
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          未找到匹配的威胁情报
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(item => (
            <IntelCard key={item.id} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: theme.textFaint, marginTop: 10 }}>
          + {hiddenCount} 更多
        </div>
      )}
    </Panel>
  )
}
