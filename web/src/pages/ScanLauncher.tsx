/**
 * ScanLauncher — form to start a new scan from the dashboard.
 *
 * The API key is read server-side from ~/.agent-redteam/config; this page only
 * ever sees a boolean "key_configured" flag and never handles the key itself.
 */
import { useState, useEffect } from 'react'
import { theme } from '../theme'
import type { ScanConfigStatus, SuiteOption } from '../types'
import { useNotification } from '../components/NotificationToast'

interface Props {
  onScanStarted: () => void
}

export function ScanLauncher({ onScanStarted }: Props) {
  const { notify } = useNotification()
  const [config, setConfig] = useState<ScanConfigStatus | null>(null)
  const [model, setModel] = useState('')
  const [target, setTarget] = useState<'openai' | 'claude' | 'zai' | 'local'>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [workers, setWorkers] = useState(4)
  const [maxTokens, setMaxTokens] = useState(500)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/scan/config')
      .then(r => r.json())
      .then((c: ScanConfigStatus) => {
        setConfig(c)
        setModel(c.default_model || 'gpt-4o')
        setBaseUrl(c.default_base_url || '')
        // select all by default
        setSelected(new Set(c.suites.map(s => s.name)))
      })
      .catch(() => setError('Failed to load scan config'))
  }, [])

  const toggleSuite = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(config?.suites.map(s => s.name) || []))
  const selectNone = () => setSelected(new Set())

  const handleSubmit = async () => {
    setError(null)
    if (!model.trim()) { setError('Model is required'); return }
    if (selected.size === 0) { setError('Select at least one suite'); return }
    setSubmitting(true)
    try {
      const resp = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.trim(),
          base_url: baseUrl.trim() || undefined,
          target,
          suites: [...selected],
          workers,
          max_tokens: maxTokens,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error || `Failed (${resp.status})`)
        notify(`扫描启动失败：${data.error || resp.status}`, 'error')
        setSubmitting(false)
        return
      }
      notify(`已发起扫描（${selected.size} 个套件），跳转实时遥测…`, 'success')
      onScanStarted()
    } catch (e) {
      setError(String(e))
      notify(`请求失败：${String(e)}`, 'error')
      setSubmitting(false)
    }
  }

  if (!config) {
    return <div style={{ padding: 80, textAlign: 'center', color: theme.textFaint }}>Loading...</div>
  }

  const keyOk = config.key_configured

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Key status badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px',
        background: keyOk ? theme.success + '12' : theme.danger + '12',
        border: `1px solid ${keyOk ? theme.success + '40' : theme.danger + '40'}`,
        borderRadius: theme.radius,
        marginBottom: 24,
      }}>
        <span style={{ fontSize: 16 }}>{keyOk ? '✓' : '⚠'}</span>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: keyOk ? theme.success : theme.danger,
        }}>
          {keyOk ? 'API key configured' : 'No API key configured'}
        </span>
        <span style={{ fontSize: 12, color: theme.textDim }}>
          {keyOk
            ? 'Read from ~/.agent-redteam/config'
            : `Add "api_key: <your-key>" to ${config.config_path}`}
        </span>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: theme.danger + '15',
          border: `1px solid ${theme.danger}40`,
          borderRadius: theme.radius,
          marginBottom: 20,
          fontSize: 13, color: theme.danger,
        }}>
          {error}
        </div>
      )}

      {/* Model + target */}
      <Section title="Target">
        <Field label="Model ID">
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="gpt-4o, glm-4-plus, ..."
            style={inputStyle}
          />
        </Field>
        <Field label="Target type">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['openai', 'claude', 'zai', 'local'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                style={{
                  padding: '8px 16px',
                  background: target === t ? theme.primary + '20' : theme.surface,
                  border: `1px solid ${target === t ? theme.primary : theme.border}`,
                  borderRadius: theme.radiusSm,
                  color: target === t ? theme.primary : theme.textDim,
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: theme.transition,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        {target === 'openai' && (
          <Field label="Base URL (optional)">
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={inputStyle}
            />
          </Field>
        )}
        {target === 'zai' && (
          <div style={{
            fontSize: 11, color: theme.textFaint, padding: '8px 12px',
            background: theme.bg, borderRadius: theme.radiusSm,
            border: `1px solid ${theme.border}`,
          }}>
            Z.ai（智谱 Anthropic 端点）：API key 从 ~/.agent-redteam/config 读取，
            系统代理自动检测（7897/7890/1087/8080）。
            model 填 GLM-5.2 / GLM-4.5 等。
          </div>
        )}
      </Section>

      {/* Suites */}
      <Section title="Suites">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <MiniBtn onClick={selectAll}>Select all</MiniBtn>
          <MiniBtn onClick={selectNone}>Clear</MiniBtn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: theme.textFaint, alignSelf: 'center' }}>
            {selected.size} / {config.suites.length} selected
          </span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 8,
        }}>
          {config.suites.map((s: SuiteOption) => {
            const on = selected.has(s.name)
            return (
              <button
                key={s.name}
                onClick={() => toggleSuite(s.name)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: on ? theme.primary + '12' : theme.surface,
                  border: `1px solid ${on ? theme.primary + '60' : theme.border}`,
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
                    fontSize: 10, color: theme.bg, fontWeight: 700,
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
                <div style={{ fontSize: 11, color: theme.textFaint, paddingLeft: 22 }}>
                  {s.count} samples · {s.description}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* Parameters */}
      <Section title="Parameters">
        <div style={{ display: 'flex', gap: 16 }}>
          <Field label="Workers (parallel calls)">
            <input
              type="number" min={1} max={20}
              value={workers}
              onChange={e => setWorkers(Math.max(1, Number(e.target.value)))}
              style={{ ...inputStyle, width: 100 }}
            />
          </Field>
          <Field label="Max tokens">
            <input
              type="number" min={50} max={4096}
              value={maxTokens}
              onChange={e => setMaxTokens(Math.max(1, Number(e.target.value)))}
              style={{ ...inputStyle, width: 100 }}
            />
          </Field>
        </div>
      </Section>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !keyOk}
        style={{
          padding: '12px 32px',
          background: keyOk ? theme.primary : theme.surface,
          color: keyOk ? theme.bg : theme.textFaint,
          border: 'none',
          borderRadius: theme.radius,
          fontSize: 14, fontWeight: 700,
          cursor: keyOk && !submitting ? 'pointer' : 'not-allowed',
          transition: theme.transition,
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? 'Starting...' : '⚡ Start Scan'}
      </button>
      {!keyOk && (
        <p style={{ fontSize: 12, color: theme.textFaint, marginTop: 10 }}>
          Configure an API key to enable launching scans.
        </p>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.text,
  fontSize: 13,
  fontFamily: theme.monoFamily,
  outline: 'none',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: theme.surface,
      borderRadius: theme.radius,
      border: `1px solid ${theme.border}`,
      padding: 20,
      marginBottom: 20,
    }}>
      <h2 style={{
        fontSize: 13, fontWeight: 600, color: theme.primary,
        marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11, color: theme.textDim,
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radiusSm,
        color: theme.textDim,
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer', transition: theme.transition,
      }}
    >
      {children}
    </button>
  )
}
