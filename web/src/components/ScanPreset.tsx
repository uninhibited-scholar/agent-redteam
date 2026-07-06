/**
 * ScanPreset — save/load reusable scan configurations (e.g. "quick: 3 suites x
 * 10 samples") to localStorage, so the user doesn't reconfigure every run.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, Field } from './ui'

export interface PresetConfig {
  model: string
  target: 'openai' | 'claude' | 'zai' | 'local'
  suites: string[]
  workers: number
  max_tokens: number
}

interface ScanPresetProps {
  current: PresetConfig
  onApply: (preset: PresetConfig) => void
}

const STORAGE_KEY = 'agent-redteam:scan-presets'

interface StoredPreset {
  name: string
  config: PresetConfig
}

export function loadPresets(): StoredPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePreset(name: string, config: PresetConfig): void {
  const presets = loadPresets().filter(p => p.name !== name)
  presets.push({ name, config })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function deletePreset(name: string): void {
  const presets = loadPresets().filter(p => p.name !== name)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', background: theme.bg,
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, fontSize: 12, outline: 'none',
}

export function ScanPreset({ current, onApply }: ScanPresetProps) {
  const [presets, setPresets] = useState<StoredPreset[]>(() => loadPresets())
  const [name, setName] = useState('')
  const [hoverName, setHoverName] = useState<string | null>(null)

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    savePreset(trimmed, current)
    setPresets(loadPresets())
    setName('')
  }

  const handleDelete = (presetName: string) => {
    deletePreset(presetName)
    setPresets(loadPresets())
  }

  return (
    <Panel title="扫描预设">
      <Field label="保存当前配置">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="预设名称"
            style={inputStyle}
          />
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              padding: '8px 14px',
              background: name.trim() ? theme.primary : theme.surfaceHover,
              border: 'none',
              borderRadius: theme.radiusSm,
              color: name.trim() ? theme.bg : theme.textFaint,
              fontSize: 12,
              fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            保存
          </button>
        </div>
      </Field>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {presets.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            暂无预设
          </div>
        ) : (
          presets.map(p => (
            <div
              key={p.name}
              onMouseEnter={() => setHoverName(p.name)}
              onMouseLeave={() => setHoverName(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                borderRadius: theme.radiusSm,
                background: hoverName === p.name ? theme.surfaceHover : 'transparent',
                transition: theme.transition,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: theme.textFaint, fontFamily: theme.monoFamily }}>
                  {p.config.model} · {p.config.suites.length} 套件 · {p.config.workers} workers
                </div>
              </div>
              <button
                onClick={() => onApply(p.config)}
                style={{
                  padding: '4px 10px', background: 'transparent',
                  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                  color: theme.primary, fontSize: 11, cursor: 'pointer',
                }}
              >
                加载
              </button>
              <button
                onClick={() => handleDelete(p.name)}
                style={{
                  padding: '4px 8px', background: 'transparent',
                  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                  color: theme.danger, fontSize: 11, cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
