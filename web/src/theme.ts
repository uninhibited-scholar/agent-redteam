/**
 * Agent Redteam Dashboard — Theme System
 *
 * The theme object's values are CSS custom property references (var(--xxx)).
 * Defaults are defined on :root in globalStyles below. Custom themes are
 * applied by overriding these CSS variables on document.documentElement —
 * no React re-render needed, all 71+ components pick up the new colors
 * automatically because they read `theme.bg` → `var(--redteam-bg)`.
 *
 * To apply a custom theme at runtime:
 *   applyThemeOverride({ bg: '#000', primary: '#0F0', ... })
 * This sets document.documentElement.style.setProperty('--redteam-bg', '#000').
 */

// Each value is a CSS var reference so runtime overrides propagate everywhere.
export const theme = {
  // Backgrounds
  bg: 'var(--redteam-bg)',
  surface: 'var(--redteam-surface)',
  surfaceHover: 'var(--redteam-surface-hover)',
  surfaceActive: 'var(--redteam-surface-active)',

  // Text
  text: 'var(--redteam-text)',
  textDim: 'var(--redteam-text-dim)',
  textFaint: 'var(--redteam-text-faint)',

  // Accents
  primary: 'var(--redteam-primary)',
  primaryDim: 'var(--redteam-primary-dim)',

  // Status colors
  success: 'var(--redteam-success)',
  warning: 'var(--redteam-warning)',
  danger: 'var(--redteam-danger)',
  info: 'var(--redteam-info)',

  // Borders
  border: 'var(--redteam-border)',
  borderActive: 'var(--redteam-border-active)',

  // Typography
  fontFamily: 'var(--redteam-font-family)',
  monoFamily: 'var(--redteam-mono-family)',

  // Severity colors
  severity: {
    critical: 'var(--redteam-severity-critical)',
    high: 'var(--redteam-severity-high)',
    medium: 'var(--redteam-severity-medium)',
    low: 'var(--redteam-severity-low)',
  },

  // Suite colors (consistent identity per suite)
  suites: {
    injection: 'var(--redteam-severity-critical)',
    tool_abuse: 'var(--redteam-severity-high)',
    over_refusal: 'var(--redteam-info)',
    info_leak: 'var(--redteam-suite-info-leak)',
  },

  // Spacing
  radius: 'var(--redteam-radius)',
  radiusSm: 'var(--redteam-radius-sm)',
  transition: 'var(--redteam-transition)',
}

export type Theme = typeof theme

/** Default color values — used for :root and as fallbacks. */
export const THEME_DEFAULTS = {
  bg: '#0A0E1A',
  surface: '#141B2D',
  surfaceHover: '#1B2438',
  surfaceActive: '#222D45',
  text: '#E0E6ED',
  textDim: '#8B98AC',
  textFaint: '#5A6A85',
  primary: '#00E5FF',
  primaryDim: '#00B8D4',
  success: '#00E676',
  warning: '#FFB300',
  danger: '#FF1744',
  info: '#448AFF',
  border: '#1E2A42',
  borderActive: '#2A3B5C',
  fontFamily: "'Inter', -apple-system, sans-serif",
  monoFamily: "'JetBrains Mono', 'SF Mono', monospace",
  severityCritical: '#FF1744',
  severityHigh: '#FF6E40',
  severityMedium: '#FFB300',
  severityLow: '#69F0AE',
  suiteInfoLeak: '#AA00FF',
  radius: '8px',
  radiusSm: '4px',
  transition: '180ms ease',
}

/** Map CustomTheme keys → CSS variable names. */
const CSS_VAR_MAP: Record<string, string> = {
  bg: '--redteam-bg',
  surface: '--redteam-surface',
  primary: '--redteam-primary',
  success: '--redteam-success',
  warning: '--redteam-warning',
  danger: '--redteam-danger',
  text: '--redteam-text',
  textDim: '--redteam-text-dim',
  border: '--redteam-border',
  radius: '--redteam-radius',
  fontFamily: '--redteam-font-family',
  monoFamily: '--redteam-mono-family',
}

/**
 * Apply a custom theme by writing CSS variables on documentElement.
 * Call this on app mount (reading from localStorage) and whenever the
 * user changes theme in ThemeCustomizer.
 */
export function applyThemeOverride(overrides: Partial<typeof THEME_DEFAULTS>): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(overrides)) {
    const cssVar = CSS_VAR_MAP[key]
    if (cssVar && typeof value === 'string') {
      root.style.setProperty(cssVar, value)
    }
  }
}

/** Reset all theme overrides back to defaults. */
export function resetTheme(): void {
  const root = document.documentElement
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    root.style.removeProperty(cssVar)
  }
}

export const globalStyles = `
  :root {
    --redteam-bg: ${THEME_DEFAULTS.bg};
    --redteam-surface: ${THEME_DEFAULTS.surface};
    --redteam-surface-hover: ${THEME_DEFAULTS.surfaceHover};
    --redteam-surface-active: ${THEME_DEFAULTS.surfaceActive};
    --redteam-text: ${THEME_DEFAULTS.text};
    --redteam-text-dim: ${THEME_DEFAULTS.textDim};
    --redteam-text-faint: ${THEME_DEFAULTS.textFaint};
    --redteam-primary: ${THEME_DEFAULTS.primary};
    --redteam-primary-dim: ${THEME_DEFAULTS.primaryDim};
    --redteam-success: ${THEME_DEFAULTS.success};
    --redteam-warning: ${THEME_DEFAULTS.warning};
    --redteam-danger: ${THEME_DEFAULTS.danger};
    --redteam-info: ${THEME_DEFAULTS.info};
    --redteam-border: ${THEME_DEFAULTS.border};
    --redteam-border-active: ${THEME_DEFAULTS.borderActive};
    --redteam-font-family: ${THEME_DEFAULTS.fontFamily};
    --redteam-mono-family: ${THEME_DEFAULTS.monoFamily};
    --redteam-severity-critical: ${THEME_DEFAULTS.severityCritical};
    --redteam-severity-high: ${THEME_DEFAULTS.severityHigh};
    --redteam-severity-medium: ${THEME_DEFAULTS.severityMedium};
    --redteam-severity-low: ${THEME_DEFAULTS.severityLow};
    --redteam-suite-info-leak: ${THEME_DEFAULTS.suiteInfoLeak};
    --redteam-radius: ${THEME_DEFAULTS.radius};
    --redteam-radius-sm: ${THEME_DEFAULTS.radiusSm};
    --redteam-transition: ${THEME_DEFAULTS.transition};
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--redteam-bg);
    color: var(--redteam-text);
    font-family: var(--redteam-font-family);
    -webkit-font-smoothing: antialiased;
  }

  code, pre, .mono {
    font-family: var(--redteam-mono-family);
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--redteam-border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--redteam-border-active); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Accessibility: reduce-motion class disables animations */
  .reduce-motion * {
    animation: none !important;
    transition: none !important;
  }

  /* Responsive */
  @media (max-width: 768px) {
    #root { font-size: 13px; }
  }

  @media (max-width: 480px) {
    #root { font-size: 12px; }
  }
`
