/**
 * SeverityDistribution — horizontal stacked bar showing how a scan's samples
 * split across severity levels, and the pass/fail ratio within each level.
 * Lets an analyst see at a glance where failures concentrate.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface SeverityDistributionProps {
  samples: SampleResult[]
  /** 标题，默认"严重性分布" */
  title?: string
}

const LEVELS = ['critical', 'high', 'medium', 'low'] as const
type Level = typeof LEVELS[number]

const LEVEL_LABEL: Record<Level, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface LevelStat {
  level: Level
  total: number
  pass: number
  fail: number
}

export function SeverityDistribution({ samples, title = '严重性分布' }: SeverityDistributionProps) {
  const [hovered, setHovered] = useState<Level | null>(null)

  const stats = useMemo<LevelStat[]>(() => {
    return LEVELS.map(level => {
      const inLevel = samples.filter(s => s.severity.toLowerCase() === level)
      return {
        level,
        total: inLevel.length,
        pass: inLevel.filter(s => s.verdict === 'pass').length,
        fail: inLevel.filter(s => s.verdict === 'fail').length,
      }
    })
  }, [samples])

  const total = samples.length
  const totalFailed = samples.filter(s => s.verdict === 'fail').length

  if (total === 0) {
    return (
      <Panel title={title}>
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无样本数据
        </div>
      </Panel>
    )
  }

  let leadLevel = stats[0]
  let leadRate = -1
  for (const s of stats) {
    const rate = s.total > 0 ? s.fail / s.total : 0
    if (s.fail > 0 && rate > leadRate) {
      leadRate = rate
      leadLevel = s
    }
  }
  const criticalStat = stats[0]
  const useCriticalInsight = criticalStat.fail > 0 && leadLevel.level === 'critical'
  const mostFailLevel = stats.reduce((a, b) => (b.fail > a.fail ? b : a), stats[0])

  return (
    <Panel title={title} subtitle={`共 ${total} 个样本 · ${totalFailed} 个失败`}>
      <div style={{ display: 'flex', height: 28, borderRadius: theme.radiusSm, overflow: 'hidden', gap: 1 }}>
        {stats.filter(s => s.total > 0).map(s => {
          const color = theme.severity[s.level]
          const isHovered = hovered === s.level
          return (
            <div
              key={s.level}
              onMouseEnter={() => setHovered(s.level)}
              onMouseLeave={() => setHovered(null)}
              title={`${LEVEL_LABEL[s.level]}: ${s.total} 个（pass ${s.pass} / fail ${s.fail}）`}
              style={{
                flex: s.total,
                display: 'flex',
                position: 'relative',
                transform: isHovered ? 'translateY(-2px)' : 'none',
                transition: theme.transition,
                cursor: 'default',
              }}
            >
              {s.pass > 0 && (
                <div style={{
                  flex: s.pass, background: color + '4D',
                  border: isHovered ? `1px solid ${color}` : 'none',
                }} />
              )}
              {s.fail > 0 && (
                <div style={{
                  flex: s.fail, background: color,
                  border: isHovered ? `1px solid ${color}` : 'none',
                }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
        {stats.map(s => {
          const color = theme.severity[s.level]
          const failRatio = s.total > 0 ? s.fail / s.total : 0
          const highlightRow = s.level === 'critical' && s.fail > 0
          return (
            <div
              key={s.level}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: theme.radiusSm,
                background: highlightRow ? theme.danger + '08' : 'transparent',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: theme.text, width: 64 }}>{LEVEL_LABEL[s.level]}</span>
              <span style={{ fontSize: 11, color: theme.textFaint, width: 34 }}>{s.total} 个</span>
              <span style={{ fontSize: 11, color: theme.success, width: 56 }}>pass {s.pass}</span>
              <span style={{ fontSize: 11, color: theme.danger, width: 50 }}>fail {s.fail}</span>
              <div style={{ flex: 1, height: 4, background: theme.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${failRatio * 100}%`, height: '100%', background: theme.danger }} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: theme.textDim }}>
        {useCriticalInsight
          ? `最危险：critical 级别失败率 ${Math.round(leadRate * 100)}%`
          : mostFailLevel.fail > 0
            ? `失败最多的级别：${LEVEL_LABEL[mostFailLevel.level]}（${mostFailLevel.fail} 个）`
            : '本次扫描无失败样本'}
      </div>
    </Panel>
  )
}
