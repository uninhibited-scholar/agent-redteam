/**
 * ui — shared presentational primitives used across pages and components.
 *
 * These were previously inlined (and duplicated) inside SettingsPanel,
 * HelpOverlay, and pages. Centralizing them keeps the SOC visual language
 * consistent and lets us add interaction (tooltips, focus rings) in one place.
 */
import { useState, useRef, useId } from 'react'
import { theme } from '../theme'

// ===== Layout primitives =====

/** A titled vertical stack of fields.
 *  variant='card' (default) for form-style panels; 'subtle' for help/docs. */
export function Section({ title, subtitle, variant = 'card', children }: {
  title: string
  subtitle?: string
  variant?: 'card' | 'subtle'
  children: React.ReactNode
}) {
  const isSubtle = variant === 'subtle'
  return (
    <div style={{ marginBottom: isSubtle ? 20 : 0 }}>
      <h3 style={{
        fontSize: isSubtle ? 11 : 13,
        fontWeight: isSubtle ? 700 : 600,
        color: isSubtle ? theme.textFaint : theme.text,
        marginBottom: isSubtle ? 8 : (subtitle ? 2 : 12),
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {title}
      </h3>
      {subtitle && <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 12 }}>{subtitle}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isSubtle ? 0 : 14 }}>
        {children}
      </div>
    </div>
  )
}

/** A labeled form field with optional hint text. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: theme.textDim }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: theme.textFaint }}>{hint}</span>}
    </label>
  )
}

/** A bordered card container with optional title row. */
export function Panel({ title, subtitle, action, children, padding = 20 }: {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  /** Number → uniform px; string → raw CSS (e.g. "14px 20px" for asymmetric). */
  padding?: number | string
}) {
  return (
    <div style={{
      background: theme.surface,
      borderRadius: theme.radius,
      border: `1px solid ${theme.border}`,
      padding,
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: title ? 16 : 0 }}>
          <div>
            {title && (
              <h2 style={{
                fontSize: 13, fontWeight: 600, color: theme.primary,
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2,
              }}>
                {title}
              </h2>
            )}
            {subtitle && <span style={{ fontSize: 11, color: theme.textFaint }}>{subtitle}</span>}
          </div>
          {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/** A row of key/value pairs laid out label-left value-right (for help/refs). */
export function KbdRow({ k, d }: { k: string; d: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <code style={{
        fontFamily: theme.monoFamily, fontSize: 12, color: theme.primary,
        background: theme.bg, padding: '2px 8px', borderRadius: theme.radiusSm,
        border: `1px solid ${theme.border}`,
      }}>
        {k}
      </code>
      <span style={{ fontSize: 12, color: theme.textDim }}>{d}</span>
    </div>
  )
}

// ===== Form controls =====

/** Small secondary button (used next to inputs, e.g. "show"/"test"). */
export function SmallButton({ label, onClick, disabled, tone = 'default' }: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary'
}) {
  const isPrimary = tone === 'primary'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px', fontSize: 12, whiteSpace: 'nowrap',
        background: isPrimary ? theme.primary + '18' : theme.surface,
        border: `1px solid ${isPrimary ? theme.primary : theme.border}`,
        borderRadius: theme.radiusSm,
        color: isPrimary ? theme.primary : theme.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition,
      }}
    >
      {label}
    </button>
  )
}

/** Inline status text (success/error/info). */
export function StatusText({ tone = 'info', children }: {
  tone?: 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}) {
  const color = tone === 'success' ? theme.success
    : tone === 'error' ? theme.danger
    : tone === 'warning' ? theme.warning
    : theme.textDim
  return <span style={{ fontSize: 12, color }}>{children}</span>
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  color: theme.text,
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

/** Themed text input. */
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputBaseStyle, ...props.style }} />
}

/** Themed range slider with accent color. */
export function Slider({ value, onChange, min = 0, max = 100, label }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <span style={{ fontSize: 12, color: theme.textDim }}>{label}</span>}
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: theme.primary }}
      />
    </div>
  )
}

// ===== Tooltip — lightweight, no portal =====

/**
 * Tooltip — wraps children and shows a floating label on hover.
 * Positions itself above the trigger by default; flips below if near the top.
 * Uses a single shared measurement strategy (no react-popper dependency).
 */
export function Tooltip({ content, children, placement = 'top' }: {
  content: React.ReactNode
  children: React.ReactNode
  placement?: 'top' | 'bottom'
}) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const gap = 8

  function handleEnter() {
    setShow(true)
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const below = placement === 'bottom'
    // Prefer placing above; if not enough room at top and placement is 'top', flip
    const putBelow = below || (placement === 'top' && r.top < 60)
    setCoords({
      x: r.left + r.width / 2,
      y: putBelow ? r.bottom + gap : r.top - gap,
    })
  }

  if (!content) return <>{children}</>

  return (
    <span
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {show && (
        <span style={{
          position: 'fixed',
          left: coords.x, top: coords.y,
          transform: 'translate(-50%, -100%)',
          zIndex: 500,
          maxWidth: 240,
          padding: '5px 9px',
          background: theme.bg,
          border: `1px solid ${theme.borderActive}`,
          borderRadius: theme.radiusSm,
          color: theme.text,
          fontSize: 11,
          lineHeight: 1.5,
          fontFamily: theme.monoFamily,
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          animation: 'fadeIn 100ms ease',
        }}>
          {content}
        </span>
      )}
    </span>
  )
}

// ===== Badge / Tag =====

/** Severity badge (critical/high/medium/low). */
export function SeverityBadge({ severity }: { severity: string }) {
  const color = theme.severity[severity as keyof typeof theme.severity] || theme.textDim
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
      color, padding: '2px 7px', borderRadius: 10,
      background: color + '18', whiteSpace: 'nowrap',
    }}>
      {severity}
    </span>
  )
}

/** Monospace pill for OWASP codes / tags. */
export function MonoTag({ children, tone = 'primary' }: { children: React.ReactNode; tone?: 'primary' | 'dim' }) {
  const color = tone === 'primary' ? theme.primary : theme.textDim
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color, fontFamily: theme.monoFamily,
      border: `1px solid ${color}40`, padding: '1px 5px', borderRadius: 3,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// ===== Hooks =====

/** useId fallback for stable IDs (handy for label/input pairing). */
export function useFieldId(prefix: string) {
  const raw = useId()
  return `${prefix}-${raw}`
}
