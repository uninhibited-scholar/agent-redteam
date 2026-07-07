/** ThemeCustomizer — pick/tune a color scheme with live preview; applies via onChange rather than mutating global CSS. */
import { useState } from 'react'
import { theme as chrome } from '../theme'
import { Panel, Slider } from './ui'

export interface CustomTheme {
  bg: string
  surface: string
  primary: string
  success: string
  warning: string
  danger: string
  text: string
  textDim: string
  border: string
  radius: string
  fontFamily: string
  monoFamily: string
}

interface ThemeCustomizerProps {
  theme: CustomTheme
  onChange: (theme: CustomTheme) => void
}

export const PRESET_THEMES: Array<{ name: string; description: string; theme: CustomTheme }> = [
  { name: 'SOC 暗黑', description: '默认深蓝黑', theme: { bg: '#0A0E1A', surface: '#141B2D', primary: '#00E5FF', success: '#00E676', warning: '#FFB300', danger: '#FF1744', text: '#E0E6ED', textDim: '#8B98AC', border: '#1E2A42', radius: '8px', fontFamily: "'Inter',-apple-system,sans-serif", monoFamily: "'JetBrains Mono','SF Mono',monospace" } },
  { name: '午夜紫', description: '深紫主调', theme: { bg: '#0D0B1A', surface: '#1A1530', primary: '#B388FF', success: '#69F0AE', warning: '#FFB300', danger: '#FF5252', text: '#E8E0F0', textDim: '#9D8BB5', border: '#2D2450', radius: '8px', fontFamily: "'Inter',-apple-system,sans-serif", monoFamily: "'JetBrains Mono','SF Mono',monospace" } },
  { name: '终端绿', description: '黑底绿字复古', theme: { bg: '#000000', surface: '#0A0F0A', primary: '#00FF41', success: '#00FF41', warning: '#FFD700', danger: '#FF0000', text: '#00FF41', textDim: '#008F11', border: '#003B00', radius: '2px', fontFamily: "'Courier New',monospace", monoFamily: "'Courier New',monospace" } },
  { name: '高对比白', description: '白底高对比', theme: { bg: '#FFFFFF', surface: '#F5F5F5', primary: '#0066CC', success: '#00875A', warning: '#FF8B00', danger: '#DE350B', text: '#172B4D', textDim: '#5E6C84', border: '#DFE1E6', radius: '8px', fontFamily: "'Inter',-apple-system,sans-serif", monoFamily: "'JetBrains Mono','SF Mono',monospace" } },
]

const STORAGE_KEY = 'agent-redteam:theme-custom'

export function loadCustomTheme(): CustomTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCustomTheme(theme: CustomTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    /* localStorage may be unavailable (private mode); fail silently */
  }
}

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

const UI_FONTS = [
  { label: 'Inter', value: "'Inter',-apple-system,sans-serif" },
  { label: 'System UI', value: "system-ui,-apple-system,sans-serif" },
  { label: 'Courier New', value: "'Courier New',monospace" },
]

const MONO_FONTS = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono','SF Mono',monospace" },
  { label: 'SF Mono', value: "'SF Mono',monospace" },
  { label: 'Courier New', value: "'Courier New',monospace" },
]

type ColorKey = 'bg' | 'surface' | 'primary' | 'success' | 'warning' | 'danger'
const COLOR_FIELDS: Array<{ key: ColorKey; label: string }> = [
  { key: 'bg', label: '背景' },
  { key: 'surface', label: '卡片' },
  { key: 'primary', label: '主色' },
  { key: 'success', label: '成功' },
  { key: 'warning', label: '警告' },
  { key: 'danger', label: '危险' },
]

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value)

  function commit(next: string) {
    setText(next)
    if (HEX_RE.test(next)) onChange(next)
  }

  function handleBlur() {
    if (!HEX_RE.test(text)) setText(value) // invalid hex -> revert to last valid value
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ position: 'relative', width: 28, height: 28, borderRadius: 6, overflow: 'hidden', border: `1px solid ${chrome.border}`, cursor: 'pointer', background: value }}>
        <input
          type="color"
          value={HEX_RE.test(value) && value.length === 7 ? value : '#000000'}
          onChange={e => commit(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </label>
      <input
        value={text}
        onChange={e => commit(e.target.value)}
        onBlur={handleBlur}
        style={{ width: 90, padding: '5px 8px', fontSize: 12, fontFamily: chrome.monoFamily, background: chrome.bg, border: `1px solid ${chrome.border}`, borderRadius: 4, color: chrome.text, outline: 'none' }}
      />
      <span style={{ fontSize: 12, color: chrome.textDim }}>{label}</span>
    </div>
  )
}

function PreviewCard({ t }: { t: CustomTheme }) {
  return (
    <div style={{ padding: 12, background: t.bg, borderRadius: t.radius, border: `1px solid ${t.border}` }}>
      <div style={{ height: 6, width: '40%', background: t.primary, borderRadius: 3, marginBottom: 8 }} />
      <div style={{ padding: 10, background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radius, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontFamily: t.fontFamily, color: t.text, marginBottom: 4 }}>Panel content</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: t.success + '30', color: t.success }}>PASS</span>
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: t.danger + '30', color: t.danger }}>FAIL</span>
        </div>
      </div>
      <div style={{ fontSize: 10, fontFamily: t.monoFamily, color: t.textDim, marginBottom: 6 }}>sample_id: inj-001</div>
      <div style={{ height: 5, borderRadius: 3, background: t.border, overflow: 'hidden' }}>
        <div style={{ width: '65%', height: '100%', background: `linear-gradient(90deg, ${t.primary}, ${t.success})` }} />
      </div>
    </div>
  )
}

export function ThemeCustomizer({ theme, onChange }: ThemeCustomizerProps) {
  const [customOpen, setCustomOpen] = useState(false)

  function patch(partial: Partial<CustomTheme>) {
    onChange({ ...theme, ...partial })
  }

  function applyPreset(preset: CustomTheme) {
    onChange(preset)
  }

  function handleSave() {
    saveCustomTheme(theme)
  }

  function handleReset() {
    onChange(PRESET_THEMES[0].theme)
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agent-redteam-theme.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const radiusNum = parseInt(theme.radius, 10) || 0

  return (
    <Panel title="主题定制">
      {/* Region 1: presets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {PRESET_THEMES.map(p => {
          const active = JSON.stringify(p.theme) === JSON.stringify(theme)
          return (
            <button
              key={p.name}
              onClick={() => applyPreset(p.theme)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: 10,
                background: chrome.surface, borderRadius: chrome.radius,
                border: `1px solid ${active ? p.theme.primary : chrome.border}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: chrome.text, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: chrome.textFaint, marginBottom: 8 }}>{p.description}</div>
              <PreviewCard t={p.theme} />
            </button>
          )
        })}
      </div>

      {/* Region 2: custom adjustments (collapsible) */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setCustomOpen(v => !v)}
          style={{ fontSize: 12, color: chrome.primary, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: customOpen ? 12 : 0 }}
        >
          {customOpen ? '▼ 自定义调整' : '▶ 自定义调整'}
        </button>

        {customOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: chrome.surface, borderRadius: chrome.radius, border: `1px solid ${chrome.border}` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {COLOR_FIELDS.map(f => (
                <ColorField key={f.key} label={f.label} value={theme[f.key]} onChange={hex => patch({ [f.key]: hex } as Partial<CustomTheme>)} />
              ))}
            </div>

            <Slider
              label={`圆角 ${radiusNum}px`}
              value={radiusNum}
              min={0}
              max={16}
              onChange={v => patch({ radius: `${v}px` })}
            />

            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: chrome.textDim }}>
                UI 字体
                <select
                  value={theme.fontFamily}
                  onChange={e => patch({ fontFamily: e.target.value })}
                  style={{ padding: '6px 8px', background: chrome.bg, border: `1px solid ${chrome.border}`, borderRadius: 4, color: chrome.text, fontSize: 12 }}
                >
                  {UI_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: chrome.textDim }}>
                代码字体
                <select
                  value={theme.monoFamily}
                  onChange={e => patch({ monoFamily: e.target.value })}
                  style={{ padding: '6px 8px', background: chrome.bg, border: `1px solid ${chrome.border}`, borderRadius: 4, color: chrome.text, fontSize: 12 }}
                >
                  {MONO_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Region 3: live preview */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: chrome.textDim, marginBottom: 8 }}>实时预览</div>
        <div style={{ maxWidth: 320 }}>
          <PreviewCard t={theme} />
        </div>
      </div>

      {/* Region 4: actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: `1px solid ${chrome.border}` }}>
        <button onClick={handleSave} style={actionButtonStyle(theme.primary, true)}>保存主题</button>
        <button onClick={handleReset} style={actionButtonStyle(chrome.border, false)}>重置为默认</button>
        <button onClick={handleExport} style={actionButtonStyle(chrome.border, false)}>导出主题 JSON</button>
      </div>
    </Panel>
  )
}

function actionButtonStyle(color: string, filled: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: filled ? color + '18' : chrome.bg,
    border: `1px solid ${color}`,
    borderRadius: 6,
    color: filled ? color : chrome.textDim,
    transition: chrome.transition,
  }
}
