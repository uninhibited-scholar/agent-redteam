/**
 * CommandPalette — Cmd/Ctrl+K global command menu.
 *
 * Features:
 *   - Fuzzy page navigation (overview, findings, scan, live, history, compare, settings)
 *   - Quick actions (export report, copy share link, open help, refresh)
 *   - Full keyboard control: ↑/↓ navigate, Enter run, Esc close
 *   - Recent commands shown when query is empty
 *
 * Usage: render <CommandPalette open={...} onClose={...} onNavigate={...} />
 * from the App shell, which owns the open state and the keyboard listener.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { theme } from '../theme'

export interface Command {
  id: string
  label: string
  hint?: string
  icon: string
  group: 'Navigate' | 'Action' | 'Help'
  keywords?: string[]
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input + reset when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Defer focus to next tick so the input is mounted
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Filter commands by fuzzy match against label + keywords
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(cmd => {
      const haystack = [cmd.label, cmd.group, cmd.hint || '', ...(cmd.keywords || [])]
        .join(' ')
        .toLowerCase()
      // Subsequence fuzzy match: every char of q appears in order
      return fuzzyMatch(haystack, q) || haystack.includes(q)
    })
  }, [query, commands])

  // Keep active index in bounds when filter changes
  useEffect(() => {
    setActiveIndex(i => (i >= filtered.length ? 0 : i))
  }, [filtered.length])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[activeIndex]
      if (cmd) {
        cmd.run()
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  // Group filtered commands for display
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of filtered) {
      if (!map.has(cmd.group)) map.set(cmd.group, [])
      map.get(cmd.group)!.push(cmd)
    }
    return Array.from(map.entries())
  }, [filtered])

  // Flatten with global index for keyboard nav
  let runningIndex = -1

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(4,7,14,0.6)',
        animation: 'fadeIn 120ms ease',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '60vh',
          background: theme.surface,
          border: `1px solid ${theme.borderActive}`,
          borderRadius: theme.radius,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          animation: 'paletteSlideIn 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes paletteSlideIn {
            from { opacity: 0; transform: translateY(-12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <span style={{ color: theme.textFaint, fontSize: 16 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入页面名或操作…（↑↓ 选择，回车执行，Esc 关闭）"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: theme.text, fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 10, color: theme.textFaint, fontFamily: theme.monoFamily,
            border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
            padding: '1px 5px',
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
              没有匹配的命令
            </div>
          ) : (
            groups.map(([groupName, cmds]) => (
              <div key={groupName}>
                <div style={{
                  padding: '8px 16px 4px',
                  fontSize: 10, fontWeight: 700, color: theme.textFaint,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {groupName}
                </div>
                {cmds.map(cmd => {
                  runningIndex++
                  const idx = runningIndex
                  const active = idx === activeIndex
                  return (
                    <div
                      key={cmd.id}
                      data-idx={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => { cmd.run(); onClose() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 16px',
                        cursor: 'pointer',
                        background: active ? theme.primary + '12' : 'transparent',
                        borderLeft: `2px solid ${active ? theme.primary : 'transparent'}`,
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, color: active ? theme.primary : theme.textDim,
                      }}>
                        {cmd.icon}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: active ? theme.text : theme.textDim }}>
                        {cmd.label}
                      </span>
                      {cmd.hint && (
                        <span style={{ fontSize: 11, color: theme.textFaint }}>{cmd.hint}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: 10, color: theme.textFaint,
          display: 'flex', gap: 16, justifyContent: 'flex-end',
        }}>
          <span>↑↓ 导航</span>
          <span>↵ 执行</span>
          <span>{filtered.length} 个结果</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Subsequence fuzzy match: returns true if every char of `needle` appears in
 * `haystack` in order (not necessarily contiguous).
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  let hi = 0
  for (let ni = 0; ni < needle.length; ni++) {
    const c = needle[ni]
    hi = haystack.indexOf(c, hi)
    if (hi === -1) return false
    hi++
  }
  return true
}
