/**
 * Agent Redteam Dashboard — Dark SOC Theme
 *
 * Design language:
 * - Near-black deep blue canvas (#0A0E1A)
 * - Electric cyan accent for primary actions
 * - Emerald / amber / crimson for pass / warn / fail
 * - 1px borders, no heavy shadows — precision, not heaviness
 * - Inter for UI, JetBrains Mono for identifiers/payloads
 */

export const theme = {
  // Backgrounds
  bg: '#0A0E1A',
  surface: '#141B2D',
  surfaceHover: '#1B2438',
  surfaceActive: '#222D45',

  // Text
  text: '#E0E6ED',
  textDim: '#8B98AC',
  textFaint: '#5A6A85',

  // Accents
  primary: '#00E5FF',       // Electric cyan
  primaryDim: '#00B8D4',

  // Status colors
  success: '#00E676',       // Emerald
  warning: '#FFB300',       // Amber
  danger: '#FF1744',        // Crimson
  info: '#448AFF',          // Blue

  // Borders
  border: '#1E2A42',
  borderActive: '#2A3B5C',

  // Typography
  fontFamily: "'Inter', -apple-system, sans-serif",
  monoFamily: "'JetBrains Mono', 'SF Mono', monospace",

  // Severity colors
  severity: {
    critical: '#FF1744',
    high: '#FF6E40',
    medium: '#FFB300',
    low: '#69F0AE',
  },

  // Suite colors (consistent identity per suite)
  suites: {
    injection: '#FF1744',
    tool_abuse: '#FF6E40',
    over_refusal: '#448AFF',
    info_leak: '#AA00FF',
  },

  // Spacing
  radius: '8px',
  radiusSm: '4px',
  transition: '180ms ease',
} as const

export type Theme = typeof theme

/** CSS-in-JS helper: converts theme to a styles object */
export const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: ${theme.bg};
    color: ${theme.text};
    font-family: ${theme.fontFamily};
    -webkit-font-smoothing: antialiased;
  }

  code, pre, .mono {
    font-family: ${theme.monoFamily};
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${theme.surface}; }
  ::-webkit-scrollbar-thumb { background: ${theme.borderActive}; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: ${theme.textFaint}; }

  a { color: ${theme.primary}; text-decoration: none; }
  a:hover { color: ${theme.primary}; text-decoration: underline; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
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
