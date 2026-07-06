/**
 * SettingsPanel — persisted app settings backed by the backend /api/settings
 * endpoint (~/.agent-redteam/settings.json on the server).
 *
 * The API key is NEVER handled here — it lives only in the operator's config
 * file and is managed out-of-band. This panel edits UI/scan defaults that are
 * safe to expose over HTTP.
 */
import { useState, useEffect, useCallback } from 'react'
import { theme } from '../theme'
import type { AppSettings } from '../types'
import { Section, Field, SmallButton, StatusText, TextInput, Slider } from './ui'

const DEFAULT_SETTINGS: AppSettings = {
  default_model: '',
  default_base_url: '',
  workers: 4,
  max_tokens: 500,
  fail_below: 80,
  theme: 'dark',
}

interface Props {
  version?: string
  repoUrl?: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SettingsPanel({ version = '0.1.0', repoUrl = 'https://github.com/uninhibited-scholar/agent-redteam' }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  // Load settings from backend on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then(r => r.json())
      .then((data: Partial<AppSettings>) => {
        if (cancelled) return
        setSettings({ ...DEFAULT_SETTINGS, ...data })
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }))
  }, [])

  // Persist to backend
  async function save() {
    setSaveState('saving')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const merged = await res.json()
      setSettings({ ...DEFAULT_SETTINGS, ...merged })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  async function testConnection() {
    setTestState('testing')
    try {
      // /api/scan/config reports key_configured without leaking the key
      const res = await fetch('/api/scan/config')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const status = await res.json()
      setTestState(status.key_configured ? 'ok' : 'fail')
    } catch {
      setTestState('fail')
    }
    setTimeout(() => setTestState('idle'), 3000)
  }

  if (!loaded) {
    return <div style={{ color: theme.textDim, fontSize: 13 }}>Loading settings…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      {/* Scan defaults */}
      <Section title="扫描默认值">
        <Field label="默认模型 (default_model)" hint="扫描启动时若不指定则使用此模型">
          <TextInput
            value={settings.default_model}
            onChange={e => update('default_model', e.target.value)}
            placeholder="glm-4-plus / gpt-4o / claude-3-5-sonnet"
          />
        </Field>

        <Field label="默认 Base URL (default_base_url)" hint="OpenAI 兼容端点；留空使用官方">
          <TextInput
            value={settings.default_base_url}
            onChange={e => update('default_base_url', e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SmallButton label="测试连接" onClick={testConnection} disabled={testState === 'testing'} />
          {testState === 'testing' && <StatusText tone="info">检查中…</StatusText>}
          {testState === 'ok' && <StatusText tone="success">✓ 已配置 API Key</StatusText>}
          {testState === 'fail' && <StatusText tone="error">✗ 未配置 API Key（请在 ~/.agent-redteam/config 中设置）</StatusText>}
        </div>
      </Section>

      {/* Execution tuning */}
      <Section title="执行参数">
        <Field label={`并发 Workers (${settings.workers})`} hint="同时发起的请求数；过高可能触发限流">
          <Slider value={settings.workers} onChange={v => update('workers', v)} min={1} max={16} />
        </Field>

        <Field label="Max Tokens" hint="单次响应上限">
          <TextInput
            type="number" min={1} max={8192} value={settings.max_tokens}
            onChange={e => update('max_tokens', Number(e.target.value))}
          />
        </Field>

        <Field label="Fail-below 阈值 (%)" hint="总分低于此值时标记为不达标">
          <TextInput
            type="number" min={0} max={100} value={settings.fail_below}
            onChange={e => update('fail_below', Number(e.target.value))}
          />
        </Field>
      </Section>

      {/* Theme */}
      <Section title="主题">
        <div style={{ display: 'flex', gap: 10 }}>
          <ThemePreview label="暗色 (SOC)" active={settings.theme === 'dark'} onClick={() => update('theme', 'dark')} dark />
          <ThemePreview label="亮色" active={settings.theme === 'light'} onClick={() => update('theme', 'light')} dark={false} />
        </div>
        <p style={{ fontSize: 11, color: theme.textFaint, marginTop: 8 }}>
          亮色主题为预览，渲染管线当前固定为暗色 SOC 风格。
        </p>
      </Section>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <button
          onClick={save}
          disabled={saveState === 'saving'}
          style={{
            padding: '10px 24px', fontSize: 13, fontWeight: 700,
            background: theme.primary, color: theme.bg,
            border: 'none', borderRadius: theme.radius,
            cursor: saveState === 'saving' ? 'wait' : 'pointer',
            opacity: saveState === 'saving' ? 0.7 : 1,
          }}
        >
          {saveState === 'saving' ? '保存中…' : '保存设置'}
        </button>
        {saveState === 'saved' && <StatusText tone="success">✓ 已写入 settings.json</StatusText>}
        {saveState === 'error' && <StatusText tone="error">✗ 保存失败，请检查后端</StatusText>}
      </div>

      {/* About */}
      <Section title="关于">
        <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.8 }}>
          <div>版本 v{version}</div>
          <a href={repoUrl} target="_blank" rel="noreferrer" style={{ color: theme.primary }}>
            GitHub 仓库 ↗
          </a>
          <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6 }}>
            API Key 仅通过本地配置文件读取，永不在前端或 HTTP 响应中出现。
          </div>
        </div>
      </Section>
    </div>
  )
}

function ThemePreview({ label, active, onClick, dark }: { label: string; active: boolean; onClick: () => void; dark: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer', borderRadius: theme.radius,
        border: `2px solid ${active ? theme.primary : theme.border}`,
        overflow: 'hidden', width: 110,
      }}
    >
      <div style={{
        height: 50,
        background: dark ? theme.bg : '#F2F4F8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 60, height: 24, borderRadius: 4,
          background: dark ? theme.surface : '#FFFFFF',
          border: `1px solid ${dark ? theme.border : '#D8DEE8'}`,
        }} />
      </div>
      <div style={{
        textAlign: 'center', fontSize: 11, padding: '4px 0',
        color: active ? theme.primary : theme.textDim,
        background: theme.surface,
      }}>
        {label}
      </div>
    </div>
  )
}
