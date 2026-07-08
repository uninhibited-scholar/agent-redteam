/**
 * AttackTimeline3D — renders a scan's samples as a perspective "corridor"
 * of glowing nodes using CSS 3D transforms only (perspective + rotateY),
 * no three.js. pass = green node, fail = red node; hover for detail.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface AttackTimeline3DProps {
  samples: SampleResult[]
}

function nodeColor(verdict: SampleResult['verdict']): string {
  if (verdict === 'pass') return theme.success
  if (verdict === 'fail') return theme.danger
  if (verdict === 'error') return theme.warning
  return theme.textFaint
}

const NODE_SPACING = 46
const LANE_SPREAD = 60
const CORRIDOR_DEPTH = -900

export function AttackTimeline3D({ samples }: AttackTimeline3DProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (samples.length === 0) {
    return (
      <Panel title="3D 攻击时间轴" subtitle="0 个样本">
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无样本数据
        </div>
      </Panel>
    )
  }

  const failed = samples.filter(s => s.verdict === 'fail').length

  return (
    <Panel title="3D 攻击时间轴" subtitle={`${samples.length} 个样本 · ${failed} 个失败`}>
      <div
        style={{
          height: 320,
          perspective: '900px',
          overflow: 'hidden',
          position: 'relative',
          background: `radial-gradient(ellipse at 50% 50%, ${theme.surface} 0%, ${theme.bg} 100%)`,
          borderRadius: theme.radius,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transformStyle: 'preserve-3d',
            transform: 'rotateX(6deg) rotateY(-4deg)',
          }}
        >
          {samples.map((s, i) => {
            const z = CORRIDOR_DEPTH + i * NODE_SPACING
            const lane = i % 2 === 0 ? -LANE_SPREAD : LANE_SPREAD
            const color = nodeColor(s.verdict)
            const isHovered = hovered === i
            return (
              <div
                key={s.sample_id + i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'absolute',
                  transform: `translate3d(${lane}px, 0px, ${z}px)`,
                  transformStyle: 'preserve-3d',
                }}
              >
                <div
                  style={{
                    width: isHovered ? 16 : 10,
                    height: isHovered ? 16 : 10,
                    borderRadius: '50%',
                    marginLeft: isHovered ? -8 : -5,
                    marginTop: isHovered ? -8 : -5,
                    background: color,
                    boxShadow: `0 0 ${isHovered ? 18 : 8}px ${color}`,
                    transition: 'width 120ms ease, height 120ms ease, box-shadow 120ms ease',
                    cursor: 'pointer',
                  }}
                />
                {isHovered && (
                  <div style={{
                    position: 'absolute',
                    left: 14,
                    top: -14,
                    transform: `translateZ(${-z}px) scale(${900 / (900 - z)})`,
                    transformOrigin: 'left center',
                    background: theme.bg,
                    border: `1px solid ${theme.borderActive}`,
                    borderRadius: theme.radiusSm,
                    padding: '5px 9px',
                    fontSize: 10,
                    color: theme.text,
                    fontFamily: theme.monoFamily,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}>
                    <div style={{ color: theme.textFaint }}>{s.suite} · {s.sample_id}</div>
                    <div style={{ color }}>{s.verdict.toUpperCase()} · {s.severity}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{
          position: 'absolute', bottom: 10, left: 14,
          fontSize: 10, color: theme.textFaint, fontFamily: theme.monoFamily,
        }}>
          ← 攻击起点
        </div>
        <div style={{
          position: 'absolute', bottom: 10, right: 14,
          fontSize: 10, color: theme.textFaint, fontFamily: theme.monoFamily,
        }}>
          扫描终点 →
        </div>
      </div>
    </Panel>
  )
}
