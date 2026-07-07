/**
 * AccessibilityPanel — global a11y settings: reduced motion, font scale,
 * high contrast, color-blind friendly palettes. Persisted to localStorage
 * and applied by the parent (this panel never touches global CSS directly).
 */
import { theme } from '../theme'
import { Panel } from './ui'

export interface A11ySettings {
  /** 减少动画（禁用 pulse/transition） */
  reduceMotion: boolean
  /** 字号缩放 0.85 | 1.0 | 1.15 | 1.3 */
  fontScale: number
  /** 高对比模式（增强边框/文字对比度） */
  highContrast: boolean
  /** 色盲友好调色板 */
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
}

interface AccessibilityPanelProps {
  /** 当前设置（受控） */
  settings: A11ySettings
  /** 设置变化回调 */
  onChange: (settings: A11ySettings) => void
}

const STORAGE_KEY = 'agent-redteam:a11y'
const FONT_SCALES = [0.85, 1.0, 1.15, 1.3]
const FONT_LABELS: Record<number, string> = { 0.85: 'S', 1: 'M', 1.15: 'L', 1.3: 'XL' }

export const DEFAULT_A11Y: A11ySettings = {
  reduceMotion: false,
  fontScale: 1.0,
  highContrast: false,
  colorBlindMode: 'none',
}

function clampFontScale(v: number): number {
  return FONT_SCALES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), FONT_SCALES[0]!)
}

export function loadA11y(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_A11Y
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_A11Y,
      ...parsed,
      fontScale: clampFontScale(Number(parsed.fontScale) || DEFAULT_A11Y.fontScale),
    }
  } catch {
    return DEFAULT_A11Y
  }
}

export function saveA11y(settings: A11ySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage unavailable (private mode) — caller keeps in-memory state
  }
}

/** Color-blind palette mapping: given the mode, returns substitute status colors. */
export function colorBlindPalette(mode: A11ySettings['colorBlindMode']): {
  success: string
  danger: string
  warning: string
  primary: string
} {
  switch (mode) {
    case 'protanopia':
      return { success: '#00BFA5', danger: '#FF6E40', warning: '#FFEB3B', primary: theme.primary }
    case 'deuteranopia':
      return { success: '#2979FF', danger: '#FF5252', warning: '#FFF176', primary: theme.primary }
    case 'tritanopia':
      return { success: '#00E5A0', danger: '#FF80AB', warning: '#FF8A80', primary: theme.primary }
    default:
      return { success: theme.success, danger: theme.danger, warning: theme.warning, primary: theme.primary }
  }
}

function Toggle({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="switch"
      aria-checked={checked}
      style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
        background: checked ? theme.primary : theme.border,
        transition: theme.transition, position: 'relative', flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: theme.bg,
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        transition: theme.transition,
      }} />
    </div>
  )
}

function OptionRow({ label, hint, children, control }: {
  label: string
  hint: string
  children?: React.ReactNode
  control: React.ReactNode
}) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{label}</div>
          <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>{hint}</div>
        </div>
        {control}
      </div>
      {children}
    </div>
  )
}

const COLOR_BLIND_OPTIONS: { mode: A11ySettings['colorBlindMode']; label: string }[] = [
  { mode: 'none', label: '正常' },
  { mode: 'protanopia', label: '红色盲' },
  { mode: 'deuteranopia', label: '绿色盲' },
  { mode: 'tritanopia', label: '蓝色盲' },
]

export function AccessibilityPanel({ settings, onChange }: AccessibilityPanelProps) {
  const hc = settings.highContrast
  const borderColor = hc ? theme.text : theme.border
  const palette = colorBlindPalette(settings.colorBlindMode)

  function patch(partial: Partial<A11ySettings>) {
    const next = { ...settings, ...partial }
    onChange(next)
    saveA11y(next)
  }

  return (
    <Panel title="可访问性设置">
      <div style={{ border: hc ? `2px solid ${borderColor}` : 'none', borderRadius: theme.radius }}>
        {/* Reduced motion */}
        <OptionRow
          label="减少动画"
          hint="禁用脉冲、淡入淡出等动画效果"
          control={<Toggle checked={settings.reduceMotion} onClick={() => patch({ reduceMotion: !settings.reduceMotion })} />}
        >
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: theme.primary,
              animation: settings.reduceMotion ? 'none' : 'pulse 1.5s ease infinite',
            }} />
            <span style={{ fontSize: 11, color: theme.textFaint }}>
              {settings.reduceMotion ? '静止预览' : '脉冲预览'}
            </span>
          </div>
        </OptionRow>

        {/* Font scale */}
        <OptionRow
          label="字号缩放"
          hint="调整界面文字大小"
          control={
            <div style={{ display: 'flex', gap: 4 }}>
              {FONT_SCALES.map(scale => {
                const active = settings.fontScale === scale
                return (
                  <button
                    key={scale}
                    onClick={() => patch({ fontScale: scale })}
                    style={{
                      padding: '5px 10px', fontSize: 11, fontWeight: 700,
                      background: active ? theme.primary + '18' : theme.bg,
                      border: `1px solid ${active ? theme.primary : borderColor}`,
                      borderRadius: theme.radiusSm,
                      color: active ? theme.primary : theme.textDim,
                      cursor: 'pointer', transition: theme.transition,
                    }}
                  >
                    {FONT_LABELS[scale]}
                  </button>
                )
              })}
            </div>
          }
        >
          <div style={{ marginTop: 10, fontSize: `${13 * settings.fontScale}px`, color: theme.text }}>
            示例文字预览 Sample text preview
          </div>
        </OptionRow>

        {/* High contrast */}
        <OptionRow
          label="高对比模式"
          hint="增强边框和文字对比度"
          control={<Toggle checked={settings.highContrast} onClick={() => patch({ highContrast: !hc })} />}
        />

        {/* Color-blind palette */}
        <OptionRow
          label="色盲友好调色板"
          hint="为色觉障碍用户调整状态色"
          control={null}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
            {COLOR_BLIND_OPTIONS.map(opt => {
              const active = settings.colorBlindMode === opt.mode
              const p = colorBlindPalette(opt.mode)
              return (
                <div
                  key={opt.mode}
                  onClick={() => patch({ colorBlindMode: opt.mode })}
                  style={{
                    padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                    background: active ? theme.primary + '12' : theme.bg,
                    border: `1px solid ${active ? theme.primary : borderColor}`,
                    borderRadius: theme.radiusSm, transition: theme.transition,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                    {[p.success, p.warning, p.danger].map((c, i) => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: active ? theme.primary : theme.textDim }}>{opt.label}</span>
                </div>
              )
            })}
          </div>
        </OptionRow>

        {/* Preview */}
        <div style={{ marginTop: 16, padding: 14, background: theme.surface, borderRadius: theme.radius, border: `1px solid ${borderColor}` }}>
          <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 10 }}>综合预览</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{
              fontSize: `${28 * settings.fontScale}px`, fontWeight: 700,
              color: palette.primary, fontFamily: theme.monoFamily,
            }}>
              84.6
            </span>
            <span style={{
              fontSize: `${11 * settings.fontScale}px`, fontWeight: 700, color: palette.success,
              padding: '3px 8px', borderRadius: 10,
              border: `${hc ? 2 : 1}px solid ${palette.success}`,
            }}>
              PASS
            </span>
            <div style={{ flex: 1, height: 8, background: theme.bg, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: '68%', height: '100%', background: palette.success,
                transition: settings.reduceMotion ? 'none' : theme.transition,
              }} />
            </div>
          </div>
        </div>

        {/* Reset */}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            onClick={() => patch(DEFAULT_A11Y)}
            style={{
              background: 'none', border: 'none', color: theme.danger,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            恢复默认设置
          </button>
        </div>
      </div>
    </Panel>
  )
}
