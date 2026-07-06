/**
 * HelpOverlay — "?" triggered help panel: shortcuts, suite descriptions, FAQ, links.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Section, KbdRow } from './ui'

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', '打开命令面板'],
  ['ESC', '关闭弹层/抽屉'],
  ['1 - 6', '切换页面'],
]

const SUITES: [string, string][] = [
  ['Injection', 'Prompt 注入能否诱导 agent 执行危险操作'],
  ['Tool Abuse', '破坏性工具调用能否被拦截'],
  ['Supply Chain', 'typosquatting / dependency confusion / CI-CD 投毒'],
  ['Model DoS', 'token 耗尽 / 递归生成 / 上下文炸弹'],
  ['Excessive Agency', 'agent 是否声称超出其能力的权限'],
  ['Info Leak', '系统提示/工具定义/模型配置能否被套出'],
  ['Insecure Output', '是否会生成恶意代码/webshell/exploit'],
  ['Sensitive Data', 'PII/凭据/密钥/训练数据泄露'],
  ['Over-Refusal', '正当防御/教育问题是否被安全模型误拒'],
  ['Over-Dependency', '幻觉/过度自信——对不确定的事给了确定答案'],
]

const FAQ: [string, string][] = [
  ['分数怎么算的？', '每个套件独立打分（通过样本数/总样本数 * 100），总分为各套件平均分。'],
  ['为什么同一个模型每次分数不一样？', 'LLM 输出本身有随机性；建议多跑几次取平均，或固定 temperature。'],
  ['样本会过时吗？', '会。已内置样本变异器，可对已有攻击生成新的表面形式（编码/换词/角色扮演等）以对抗针对性修补。'],
  ['能测本地部署的 agent 吗？', '能，用 --target local --endpoint <url> 指向任意 HTTP 端点。'],
  ['API key 会被发到前端吗？', '不会，后端只返回 key_configured 布尔值，key 本身永不出现在响应/日志中。'],
]

interface Props {
  repoUrl?: string
  docsUrl?: string
  /** Controlled mode: when provided, the parent owns open state. */
  open?: boolean
  onClose?: () => void
}

export function HelpOverlay({ repoUrl = 'https://github.com/uninhibited-scholar/agent-redteam', docsUrl = 'https://github.com/uninhibited-scholar/agent-redteam', open: controlledOpen, onClose }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  // Controlled if both open and onClose are supplied
  const controlled = controlledOpen !== undefined && onClose !== undefined
  const isOpen = controlled ? controlledOpen! : internalOpen

  function close() {
    if (controlled) {
      onClose!()
    } else {
      setInternalOpen(false)
    }
  }

  return (
    <>
      {!controlled && (
        <button
          onClick={() => setInternalOpen(o => !o)}
          aria-label="Help"
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: theme.surface, border: `1px solid ${theme.border}`,
            color: theme.textDim, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', transition: theme.transition,
          }}
        >
          ?
        </button>
      )}

      {isOpen && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(4,7,14,0.6)', animation: 'fadeIn 150ms ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '8vh', left: '50%', transform: 'translateX(-50%)',
              width: 'min(640px, 92vw)', maxHeight: '84vh', overflowY: 'auto',
              background: theme.surface, border: `1px solid ${theme.borderActive}`,
              borderRadius: theme.radius, padding: 24,
              animation: 'slideIn 200ms ease',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>帮助</h2>
              <div style={{ flex: 1 }} />
              <button
                onClick={close}
                style={{ background: 'transparent', border: 'none', color: theme.textDim, fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <Section title="快捷键" variant="subtle">
              {SHORTCUTS.map(([key, desc]) => (
                <KbdRow key={key} k={key} d={desc} />
              ))}
            </Section>

            <Section title="十个攻击套件" variant="subtle">
              {SUITES.map(([name, desc]) => (
                <div key={name} style={{ padding: '6px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{name}</div>
                  <div style={{ fontSize: 11, color: theme.textDim }}>{desc}</div>
                </div>
              ))}
            </Section>

            <Section title="常见问题" variant="subtle">
              {FAQ.map(([q, a]) => (
                <div key={q} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{q}</div>
                  <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.6 }}>{a}</div>
                </div>
              ))}
            </Section>

            <Section title="链接" variant="subtle">
              <div style={{ display: 'flex', gap: 16 }}>
                <a href={repoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: theme.primary }}>GitHub ↗</a>
                <a href={docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: theme.primary }}>文档 ↗</a>
              </div>
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
