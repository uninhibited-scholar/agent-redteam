/**
 * RemediationChecklist — tracks progress on hardening recommendations.
 * Users check off remediation steps as they land fixes; progress persists
 * to localStorage per-model, closing the "find issue → fix → verify" loop.
 */
import { useState, useEffect } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge } from './ui'

interface RemediationStep {
  suite: string
  title: string
  steps: string[]
  riskScore: number
}

interface RemediationChecklistProps {
  items: RemediationStep[]
  /** 模型标签，用于 localStorage key 隔离（不同模型独立跟踪） */
  modelLabel: string
}

type Progress = Record<string, Record<number, boolean>>

const KEY_PREFIX = 'agent-redteam:remediation-progress'

function storageKey(modelLabel: string): string {
  return `${KEY_PREFIX}:${modelLabel}`
}

export function loadProgress(modelLabel: string): Progress {
  try {
    const raw = localStorage.getItem(storageKey(modelLabel))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveProgress(modelLabel: string, progress: Progress): void {
  try {
    localStorage.setItem(storageKey(modelLabel), JSON.stringify(progress))
  } catch {
    // localStorage unavailable (private mode) — silently keep in-memory only
  }
}

export function resetProgress(modelLabel: string): void {
  try {
    localStorage.removeItem(storageKey(modelLabel))
  } catch {
    // no-op
  }
}

function riskToSeverity(riskScore: number): string {
  if (riskScore >= 80) return 'critical'
  if (riskScore >= 60) return 'high'
  if (riskScore >= 40) return 'medium'
  return 'low'
}

function countDone(steps: string[], suiteProgress: Record<number, boolean> | undefined): number {
  if (!suiteProgress) return 0
  return steps.reduce((n, _, i) => n + (suiteProgress[i] ? 1 : 0), 0)
}

export function RemediationChecklist({ items, modelLabel }: RemediationChecklistProps) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress(modelLabel))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setProgress(loadProgress(modelLabel))
  }, [modelLabel])

  useEffect(() => {
    saveProgress(modelLabel, progress)
  }, [modelLabel, progress])

  const visible = items.filter(i => i.steps.length > 0)
  const sorted = [...visible].sort((a, b) => b.riskScore - a.riskScore)

  const totalSteps = visible.reduce((n, i) => n + i.steps.length, 0)
  const doneSteps = visible.reduce((n, i) => n + countDone(i.steps, progress[i.suite]), 0)
  const pct = totalSteps > 0 ? doneSteps / totalSteps : 0

  function toggleStep(suite: string, stepIndex: number) {
    setProgress(prev => {
      const suiteProgress = { ...(prev[suite] || {}) }
      suiteProgress[stepIndex] = !suiteProgress[stepIndex]
      return { ...prev, [suite]: suiteProgress }
    })
  }

  function toggleExpand(suite: string) {
    setExpanded(prev => ({ ...prev, [suite]: !prev[suite] }))
  }

  function expandAll() {
    setExpanded(Object.fromEntries(sorted.map(i => [i.suite, true])))
  }

  function collapseAll() {
    setExpanded({})
  }

  function handleReset() {
    if (!window.confirm('确定要重置所有修复进度吗？此操作无法撤销。')) return
    resetProgress(modelLabel)
    setProgress({})
  }

  return (
    <Panel
      title="修复进度"
      subtitle={`共 ${totalSteps} 个步骤 · ${doneSteps} 个完成 · ${Math.round(pct * 100)}%`}
    >
      {visible.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          暂无修复建议
        </div>
      ) : (
        <>
          {/* Progress header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, background: theme.bg, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: pct === 1 ? theme.success : theme.primary,
                  transition: theme.transition,
                }} />
              </div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6 }}>
                {pct === 1 ? '全部修复 ✓' : pct > 0 ? `${doneSteps} / ${totalSteps} 个步骤已完成` : '待开始'}
              </div>
            </div>
            <div style={{
              fontSize: 28, fontWeight: 700, fontFamily: theme.monoFamily,
              color: pct === 1 ? theme.success : theme.primary,
            }}>
              {Math.round(pct * 100)}%
            </div>
          </div>

          {/* Suite groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {sorted.map(item => {
              const suiteProgress = progress[item.suite]
              const done = countDone(item.steps, suiteProgress)
              const allDone = done === item.steps.length
              const isOpen = !!expanded[item.suite]

              return (
                <div key={item.suite} style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: theme.radius,
                  background: allDone ? theme.success + '0C' : theme.surface,
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => toggleExpand(item.suite)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 11, color: theme.textFaint, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, flex: 1 }}>
                      {allDone && '✓ '}{item.title}
                    </span>
                    <SeverityBadge severity={riskToSeverity(item.riskScore)} />
                    <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily }}>
                      {done}/{item.steps.length}
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 14px 12px 34px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {item.steps.map((step, i) => {
                        const checked = !!suiteProgress?.[i]
                        return (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStep(item.suite, i)}
                              style={{ accentColor: theme.success, cursor: 'pointer' }}
                            />
                            <span style={{
                              fontSize: 12,
                              color: checked ? theme.success : theme.text,
                              textDecoration: checked ? 'line-through' : 'none',
                            }}>
                              {step}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={expandAll} style={footerBtnStyle}>全部展开</button>
            <button onClick={collapseAll} style={footerBtnStyle}>全部收起</button>
            <button
              onClick={handleReset}
              style={{ ...footerBtnStyle, color: theme.danger, borderColor: theme.danger + '60', marginLeft: 'auto' }}
            >
              重置进度
            </button>
          </div>
        </>
      )}
    </Panel>
  )
}

const footerBtnStyle: React.CSSProperties = {
  padding: '7px 14px',
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.textDim,
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer', transition: theme.transition,
  whiteSpace: 'nowrap',
}
