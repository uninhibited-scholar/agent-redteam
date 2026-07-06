/**
 * ShortcutHelp — grouped, searchable keyboard shortcut reference for the help panel.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

export interface Shortcut {
  group: string
  keys: string
  description: string
}

interface ShortcutHelpProps {
  shortcuts: Shortcut[]
  searchable?: boolean
}

function Kbd({ text }: { text: string }) {
  const parts = text.split('+').map(p => p.trim())
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {parts.map((part, idx) => (
        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <kbd style={{
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, padding: '2px 6px',
            fontFamily: theme.monoFamily, fontSize: 11, color: theme.text,
          }}>
            {part}
          </kbd>
          {idx < parts.length - 1 && <span style={{ color: theme.textFaint, fontSize: 11 }}>+</span>}
        </span>
      ))}
    </span>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: theme.primary + '30', color: theme.primary }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}

export function ShortcutHelp({ shortcuts, searchable = true }: ShortcutHelpProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? shortcuts.filter(s =>
          s.description.toLowerCase().includes(q) ||
          s.keys.toLowerCase().includes(q) ||
          s.group.toLowerCase().includes(q)
        )
      : shortcuts

    const map = new Map<string, Shortcut[]>()
    for (const s of filtered) {
      const list = map.get(s.group) ?? []
      list.push(s)
      map.set(s.group, list)
    }
    return Array.from(map.entries())
  }, [shortcuts, query])

  return (
    <Panel title="快捷键">
      {searchable && (
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索快捷键..."
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 14,
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.text,
            fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
      )}

      {shortcuts.length === 0 && (
        <div style={{ fontSize: 12, color: theme.textFaint, textAlign: 'center', padding: '20px 0' }}>
          暂无快捷键
        </div>
      )}

      {shortcuts.length > 0 && groups.length === 0 && (
        <div style={{ fontSize: 12, color: theme.textFaint, textAlign: 'center', padding: '20px 0' }}>
          未找到匹配的快捷键
        </div>
      )}

      {groups.map(([group, items]) => (
        <div key={group} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: theme.textFaint,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
          }}>
            {group}
          </div>
          {items.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ fontSize: 12.5, color: theme.textDim }}>
                <Highlight text={s.description} query={query} />
              </span>
              <Kbd text={s.keys} />
            </div>
          ))}
        </div>
      ))}
    </Panel>
  )
}
