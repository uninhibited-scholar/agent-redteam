/** ScanWizard — 3-step guided scan setup (model → suites → confirm), lowering cognitive load vs. the full form. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

export interface WizardConfig {
  model: string
  target: 'openai' | 'claude' | 'zai' | 'local' | 'ollama' | 'deepseek' | 'azure' | 'qwen'
  suites: Set<string>
  workers: number
  limit: number
}

interface ScanWizardProps {
  config: WizardConfig
  onConfigChange: (config: WizardConfig) => void
  onStart: () => void
  modelPresets?: Array<{ label: string; model: string; target: WizardConfig['target'] }>
  availableSuites: Array<{ name: string; owasp: string; count: number; description: string }>
}

const CORE_SUITES = ['injection', 'tool_abuse', 'info_leak']
const SECONDS_PER_SAMPLE = 0.3
const TARGETS: WizardConfig['target'][] = ['openai', 'claude', 'zai', 'ollama', 'deepseek', 'azure', 'qwen', 'local']

export function estimateScan(
  suites: Array<{ name: string; count: number }>,
  limit: number,
): { totalSamples: number; estimatedSeconds: number } {
  const totalSamples = suites.reduce((sum, s) => sum + Math.min(s.count, limit), 0)
  return { totalSamples, estimatedSeconds: totalSamples * SECONDS_PER_SAMPLE }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `约 ${Math.ceil(seconds)} 秒`
  return `约 ${Math.ceil(seconds / 60)} 分钟`
}

const STEP_LABELS = ['模型', '套件', '确认']

function StepDot({ index, current }: { index: number; current: number }) {
  const done = index < current
  const active = index === current
  const color = done ? theme.success : active ? theme.primary : theme.border
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
        background: done || active ? color : 'transparent',
        border: `2px solid ${color}`,
        color: done || active ? theme.bg : theme.textFaint,
        animation: active ? 'pulse 1.5s ease infinite' : 'none',
        transition: theme.transition,
      }}>
        {done ? '✓' : index + 1}
      </div>
      <span style={{ fontSize: 11, color: active ? theme.text : theme.textFaint }}>{STEP_LABELS[index]}</span>
    </div>
  )
}

export function ScanWizard({ config, onConfigChange, onStart, modelPresets, availableSuites }: ScanWizardProps) {
  const [step, setStep] = useState(0)

  function patch(partial: Partial<WizardConfig>) {
    onConfigChange({ ...config, ...partial })
  }

  function toggleSuite(name: string) {
    const next = new Set(config.suites)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    patch({ suites: next })
  }

  function applyQuickScan() {
    const names = new Set(CORE_SUITES.filter(n => availableSuites.some(s => s.name === n)))
    patch({ suites: names })
  }

  const selectedSuites = availableSuites.filter(s => config.suites.has(s.name))
  const estimate = estimateScan(selectedSuites, config.limit)

  return (
    <Panel title="扫描向导">
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '0 20px' }}>
        {STEP_LABELS.map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
            <StepDot index={i} current={step} />
            {i < 2 && (
              <div style={{ flex: 1, height: 2, margin: '0 8px 18px', background: i < step ? theme.success : theme.border, transition: theme.transition }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: model */}
      {step === 0 && (
        <div>
          {modelPresets && modelPresets.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              {modelPresets.map(p => {
                const active = config.model === p.model && config.target === p.target
                return (
                  <button
                    key={p.label}
                    onClick={() => patch({ model: p.model, target: p.target })}
                    style={{
                      minWidth: 140, padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                      background: active ? theme.primary + '18' : theme.bg,
                      border: `1px solid ${active ? theme.primary : theme.border}`,
                      borderRadius: theme.radius, transition: theme.transition,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{p.label}</div>
                    <div style={{ fontSize: 11, fontFamily: theme.monoFamily, color: theme.textFaint, marginTop: 2 }}>{p.model}</div>
                    <div style={{ fontSize: 10, color: theme.primary, marginTop: 4, textTransform: 'uppercase' }}>{p.target}</div>
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>自定义</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={config.model}
              onChange={e => patch({ model: e.target.value })}
              placeholder="模型名称，如 gpt-5"
              style={{
                flex: 1, minWidth: 200, padding: '8px 12px', background: theme.bg,
                border: `1px solid ${theme.border}`, borderRadius: theme.radius,
                color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {TARGETS.map(t => {
                const active = config.target === t
                return (
                  <button
                    key={t}
                    onClick={() => patch({ target: t })}
                    style={{
                      padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                      background: active ? theme.primary + '18' : theme.bg,
                      border: `1px solid ${active ? theme.primary : theme.border}`,
                      borderRadius: theme.radius,
                      color: active ? theme.primary : theme.textDim,
                      transition: theme.transition,
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={() => setStep(1)}
              disabled={!config.model.trim()}
              style={primaryButtonStyle(!config.model.trim())}
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: suites */}
      {step === 1 && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={applyQuickScan} style={quickButtonStyle}>快速扫描（核心 3 套件）</button>
          </div>

          {availableSuites.length === 0 ? (
            <div style={{ fontSize: 12, color: theme.textFaint, padding: 20, textAlign: 'center' }}>暂无可用套件</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {availableSuites.map(s => {
                const checked = config.suites.has(s.name)
                return (
                  <div
                    key={s.name}
                    onClick={() => toggleSuite(s.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', cursor: 'pointer',
                      background: checked ? theme.primary + '10' : theme.bg,
                      border: `1px solid ${checked ? theme.primary : theme.border}`,
                      borderRadius: theme.radius, transition: theme.transition,
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `1px solid ${checked ? theme.primary : theme.border}`,
                      background: checked ? theme.primary : 'transparent',
                      color: theme.bg, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked ? '✓' : ''}
                    </span>
                    <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.primary }}>{s.owasp}</span>
                    <span style={{ fontSize: 13, color: theme.text, minWidth: 100 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: theme.textFaint, flex: 1 }}>{s.description}</span>
                    <span style={{ fontSize: 11, color: theme.textDim }}>{s.count} 条</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: theme.textDim }}>
              每套件上限
              <input
                type="number" min={1} value={config.limit}
                onChange={e => patch({ limit: Number(e.target.value) })}
                style={{ marginLeft: 8, width: 70, padding: '6px 8px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius, color: theme.text, fontSize: 12 }}
              />
            </label>
            <label style={{ fontSize: 12, color: theme.textDim }}>
              并发
              <input
                type="number" min={1} value={config.workers}
                onChange={e => patch({ workers: Number(e.target.value) })}
                style={{ marginLeft: 8, width: 60, padding: '6px 8px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius, color: theme.text, fontSize: 12 }}
              />
            </label>
          </div>

          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 16 }}>
            预估 <b style={{ color: theme.text }}>{estimate.totalSamples}</b> 个样本 · {formatDuration(estimate.estimatedSeconds)}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(0)} style={secondaryButtonStyle}>← 上一步</button>
            <button
              onClick={() => setStep(2)}
              disabled={config.suites.size === 0}
              style={primaryButtonStyle(config.suites.size === 0)}
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: confirm */}
      {step === 2 && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius, marginBottom: 16 }}>
            <SummaryRow label="模型" value={config.model || '（未设置）'} />
            <SummaryRow label="目标" value={config.target} />
            <SummaryRow label="套件" value={selectedSuites.length ? selectedSuites.map(s => s.name).join(', ') : '（未选择）'} />
            <SummaryRow label="并发 / 上限" value={`${config.workers} workers · ${config.limit} / suite`} />
            <SummaryRow label="预估" value={`${estimate.totalSamples} 个样本 · ${formatDuration(estimate.estimatedSeconds)}`} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={secondaryButtonStyle}>← 上一步</button>
            <button
              onClick={onStart}
              disabled={!config.model.trim() || config.suites.size === 0}
              style={{ ...primaryButtonStyle(!config.model.trim() || config.suites.size === 0), padding: '10px 24px', fontSize: 14 }}
            >
              启动扫描
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${theme.border}`, fontSize: 11, color: theme.textFaint, textAlign: 'center' }}>
        经验丰富？直接使用下方完整表单
      </div>
    </Panel>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: theme.textFaint }}>{label}</span>
      <span style={{ color: theme.text, fontFamily: theme.monoFamily }}>{value}</span>
    </div>
  )
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    background: theme.primary + '18', border: `1px solid ${theme.primary}`,
    borderRadius: theme.radius, color: theme.primary,
    opacity: disabled ? 0.4 : 1, transition: theme.transition,
  }
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 18px', fontSize: 13, cursor: 'pointer',
  background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radius, color: theme.textDim, transition: theme.transition,
}

const quickButtonStyle: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
  background: theme.bg, border: `1px solid ${theme.borderActive}`,
  borderRadius: theme.radius, color: theme.text, transition: theme.transition,
}
