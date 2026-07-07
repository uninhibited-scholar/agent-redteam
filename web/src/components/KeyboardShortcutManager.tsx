/**
 * KeyboardShortcutManager — lists every keybinding and lets users rebind
 * the editable ones. Bindings persist to localStorage; conflicts between
 * a newly captured combo and an existing binding are surfaced for the
 * user to resolve (override or cancel).
 */
import { useEffect, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

interface KeyBinding {
  action: string
  label: string
  keys: string
  group: string
  readonly?: boolean
}

interface KeyboardShortcutManagerProps {
  defaults: KeyBinding[]
  onChange?: (bindings: KeyBinding[]) => void
}

const STORAGE_KEY = 'agent-redteam:keybindings'

/** Parses a raw keydown event into a canonical 'meta+shift+k' style string. */
export function parseKeyEvent(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; key: string }): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('meta')
  else if (e.ctrlKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')

  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  else if (key === 'escape') key = 'esc'

  if (!['meta', 'control', 'shift', 'alt'].includes(e.key.toLowerCase())) {
    parts.push(key)
  }
  return parts.join('+')
}

const DISPLAY_MAP: Record<string, string> = {
  meta: '⌘', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', space: 'Space', esc: 'Esc',
}

/** Formats a canonical key string ('meta+k') into display form ('⌘+K'). */
export function formatKeysForDisplay(keys: string): string {
  return keys
    .split('+')
    .map(part => DISPLAY_MAP[part] || part.toUpperCase())
    .join('+')
}

/** Returns the binding that already owns `newKeys`, if any (excluding `excludeAction`). */
export function detectConflict(newKeys: string, bindings: KeyBinding[], excludeAction?: string): KeyBinding | null {
  return bindings.find(b => b.keys === newKeys && b.action !== excludeAction) || null
}

export function loadBindings(defaults: KeyBinding[]): KeyBinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const saved: Record<string, string> = JSON.parse(raw)
    return defaults.map(b => (saved[b.action] !== undefined ? { ...b, keys: saved[b.action] } : b))
  } catch {
    return defaults
  }
}

export function saveBindings(bindings: KeyBinding[]): void {
  try {
    const map: Record<string, string> = {}
    for (const b of bindings) map[b.action] = b.keys
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable (private mode) — keep in-memory only
  }
}

function KbdCombo({ keys }: { keys: string }) {
  if (!keys) {
    return <span style={{ fontSize: 11, color: theme.textFaint }}>未绑定</span>
  }
  const parts = keys.split('+')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && <span style={{ fontSize: 10, color: theme.textFaint }}>+</span>}
          <kbd style={{
            fontFamily: theme.monoFamily, fontSize: 11, color: theme.text,
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: 4, padding: '2px 6px',
          }}>
            {DISPLAY_MAP[p] || p.toUpperCase()}
          </kbd>
        </span>
      ))}
    </span>
  )
}

export function KeyboardShortcutManager({ defaults, onChange }: KeyboardShortcutManagerProps) {
  const [bindings, setBindings] = useState<KeyBinding[]>(() => loadBindings(defaults))
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ action: string; keys: string; withAction: string } | null>(null)

  useEffect(() => {
    if (!recording) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const isPureModifier = ['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)
      if (isPureModifier) return

      const combo = parseKeyEvent(e)
      const existing = detectConflict(combo, bindings, recording!)
      if (existing) {
        setConflict({ action: recording!, keys: combo, withAction: existing.action })
        setRecording(null)
        return
      }
      applyBinding(recording!, combo)
      setRecording(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [recording, bindings])

  function applyBinding(action: string, keys: string) {
    setBindings(prev => {
      const next = prev.map(b => (b.action === action ? { ...b, keys } : b))
      saveBindings(next)
      onChange?.(next)
      return next
    })
  }

  function resolveConflict(override: boolean) {
    if (!conflict) return
    if (override) {
      setBindings(prev => {
        const next = prev.map(b => {
          if (b.action === conflict.action) return { ...b, keys: conflict.keys }
          if (b.action === conflict.withAction) return { ...b, keys: '' }
          return b
        })
        saveBindings(next)
        onChange?.(next)
        return next
      })
    }
    setConflict(null)
  }

  function resetDefaults() {
    setBindings(defaults)
    saveBindings(defaults)
    onChange?.(defaults)
  }

  const q = query.trim().toLowerCase()
  const filtered = bindings.filter(b =>
    !q || b.action.toLowerCase().includes(q) || b.label.toLowerCase().includes(q),
  )

  const groups = new Map<string, KeyBinding[]>()
  for (const b of filtered) {
    const list = groups.get(b.group) || []
    list.push(b)
    groups.set(b.group, list)
  }

  return (
    <Panel title="快捷键设置">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索动作..."
          style={{
            flex: 1, padding: '8px 12px', background: theme.bg,
            border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
            color: theme.text, fontSize: 12, outline: 'none',
          }}
        />
        <button onClick={resetDefaults} style={btnStyle}>恢复默认</button>
      </div>

      {conflict && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: theme.radius,
          background: theme.danger + '12', border: `1px solid ${theme.danger}`,
        }}>
          <div style={{ fontSize: 12, color: theme.text, marginBottom: 8 }}>
            <KbdCombo keys={conflict.keys} /> 已被 <strong>{conflict.withAction}</strong> 占用，是否覆盖？
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => resolveConflict(true)} style={{ ...btnStyle, color: theme.danger, borderColor: theme.danger }}>
              覆盖
            </button>
            <button onClick={() => resolveConflict(false)} style={btnStyle}>取消</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {[...groups.entries()].map(([group, items]) => (
          <div key={group}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: theme.textFaint,
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
            }}>
              {group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(b => {
                const isRecording = recording === b.action
                const isCustom = !b.readonly && b.keys !== defaults.find(d => d.action === b.action)?.keys
                return (
                  <div
                    key={b.action}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: theme.radiusSm,
                      background: isRecording ? theme.primary + '10' : 'transparent',
                      transition: theme.transition,
                    }}
                  >
                    <span style={{ fontSize: 12, color: theme.text, flex: 1 }}>{b.label}</span>
                    {isCustom && <MonoTag tone="primary">自定义</MonoTag>}
                    <div style={{ width: 110, textAlign: 'right' }}>
                      {isRecording ? (
                        <span style={{ fontSize: 11, color: theme.primary, animation: 'pulse 1s ease infinite' }}>
                          录制中…
                        </span>
                      ) : (
                        <KbdCombo keys={b.keys} />
                      )}
                    </div>
                    {b.readonly ? (
                      <span style={{ fontSize: 10, color: theme.textFaint }}>系统级</span>
                    ) : (
                      <button
                        onClick={() => setRecording(b.action)}
                        disabled={recording !== null}
                        style={{ ...btnStyle, padding: '4px 10px', fontSize: 10 }}
                      >
                        重新绑定
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            未找到匹配的快捷键
          </div>
        )}
      </div>
    </Panel>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '7px 14px',
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.textDim,
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer', transition: theme.transition,
  whiteSpace: 'nowrap',
}
