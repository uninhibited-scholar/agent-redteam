/**
 * SampleTimeline — vertical timeline of a live scan: suites in order,
 * with pass/fail dots per sample, hover shows detail.
 */
import { useState, useMemo } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'

interface Props {
  samples: SampleResult[]
  activeSuite?: string | null
}

export function SampleTimeline({ samples, activeSuite }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, SampleResult[]>()
    for (const s of samples) {
      if (!map.has(s.suite)) {
        map.set(s.suite, [])
        order.push(s.suite)
      }
      map.get(s.suite)!.push(s)
    }
    return order.map(suite => ({ suite, items: map.get(suite)! }))
  }, [samples])

  if (groups.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
        暂无遥测数据
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      <div style={{
        position: 'absolute', left: 6, top: 8, bottom: 8, width: 2,
        background: theme.border,
      }} />

      {groups.map(({ suite, items }) => {
        const passed = items.filter(i => i.verdict === 'pass').length
        const isActive = activeSuite === suite
        return (
          <div key={suite} style={{ marginBottom: 20, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: -20, top: 2,
              width: 12, height: 12, borderRadius: '50%',
              background: isActive ? theme.primary : theme.surfaceActive,
              border: `2px solid ${isActive ? theme.primary : theme.border}`,
              boxShadow: isActive ? `0 0 0 4px ${theme.primary}25` : 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                {suite.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 11, color: theme.textFaint }}>
                {passed}/{items.length} passed
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {items.map(item => {
                const key = item.sample_id
                const isHovered = hovered === key
                const passedItem = item.verdict === 'pass'
                return (
                  <div
                    key={key}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ position: 'relative' }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: passedItem ? theme.success : theme.danger,
                      cursor: 'default',
                      transform: isHovered ? 'scale(1.6)' : 'scale(1)',
                      transition: theme.transition,
                    }} />
                    {isHovered && (
                      <div style={{
                        position: 'absolute', bottom: '140%', left: '50%',
                        transform: 'translateX(-50%)',
                        background: theme.surface, border: `1px solid ${theme.borderActive}`,
                        borderRadius: theme.radiusSm, padding: '6px 10px',
                        fontSize: 11, whiteSpace: 'nowrap', zIndex: 10,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        animation: 'fadeIn 120ms ease',
                      }}>
                        <div style={{ color: theme.text, fontFamily: theme.monoFamily }}>{item.sample_id}</div>
                        <div style={{ color: passedItem ? theme.success : theme.danger, fontWeight: 600 }}>
                          {item.verdict.toUpperCase()}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
