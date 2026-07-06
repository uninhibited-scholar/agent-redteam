/** Shared types for the Agent Redteam Dashboard. */

export interface SampleResult {
  suite: string
  sample_id: string
  category: string
  difficulty: string
  question: string
  expected: string
  response: string
  verdict: 'pass' | 'fail' | 'error' | 'skip'
  severity: string
  owasp: string
  tags: string[]
  error: string
}

export interface SuiteResult {
  name: string
  total: number
  passed: number
  failed: number
  errors: number
  skipped: number
  score: number
  owasp?: string
}

export interface ScanReport {
  target_model: string
  started_at: string
  finished_at: string
  overall_score: number
  total_samples: number
  total_passed: number
  total_failed: number
  suites: SuiteResult[]
  samples?: SampleResult[]
}

/** WebSocket message from the backend during a live scan */
export interface TelemetryEvent {
  type: 'sample_result' | 'suite_done' | 'scan_done' | 'scan_started' | 'scan_failed'
  data: SampleResult | SuiteResult | ScanReport | { suites: string[] } | { error: string }
}

/** A single scan record from /api/history */
export interface HistoryItem {
  run_id: string
  target_model: string
  overall_score: number
  total_samples: number
  total_passed: number
  total_failed: number
  created_at: string
}

/** Per-suite delta row in a comparison result */
export interface SuiteComparison {
  suite: string
  score_a: number
  score_b: number
  delta: number
  trend: string
}

/** Result of /api/compare */
export interface CompareResult {
  model_a: string
  model_b: string
  score_a: number
  score_b: number
  score_delta: number
  suites: SuiteComparison[]
}

/** A suite available to run (from /api/scan/config) */
export interface SuiteOption {
  name: string
  owasp: string
  count: number
  description: string
}

/** Externally-safe scan config — NEVER contains the api_key */
export interface ScanConfigStatus {
  key_configured: boolean
  default_model: string
  default_base_url: string
  config_path: string
  scanning: boolean
  scan_error: string | null
  suites: SuiteOption[]
}

/** Body of POST /api/scan/start */
export interface ScanStartRequest {
  model: string
  base_url?: string
  target: 'openai' | 'claude' | 'local'
  suites: string[]
  workers: number
  max_tokens: number
  endpoint?: string
}

// ===== /api/samples — paginated drill-down =====

export interface SampleFilters {
  suite?: string | null
  verdict?: 'pass' | 'fail' | 'error' | null
  severity?: 'low' | 'medium' | 'high' | 'critical' | null
  difficulty?: string | null
  search?: string | null
  sort_by?: 'suite' | 'sample_id' | 'verdict' | 'severity' | 'category' | 'difficulty' | null
  sort_dir?: 'asc' | 'desc'
}

export interface SamplesResponse {
  items: SampleResult[]
  page: number
  page_size: number
  total: number
  total_pages: number
  facets: {
    suite: Record<string, number>
    verdict: Record<string, number>
    severity: Record<string, number>
    difficulty: Record<string, number>
  }
  report: {
    target_model: string
    started_at: string
    finished_at: string
    overall_score: number | null
    total_samples: number
    total_passed: number | null
    total_failed: number | null
  }
  filters: SampleFilters
}

// ===== /api/risk-matrix =====

export interface RiskMatrixResponse {
  suites: string[]
  severities: string[]
  matrix: Record<string, Record<string, number>>
  totals: Record<string, { fail: number; pass: number; error: number }>
  report: { target_model: string; started_at: string; finished_at: string }
}

// ===== /api/timeline =====

export interface TimelinePoint {
  index: number
  suite: string
  sample_id: string
  category: string
  verdict: string
  severity: string
}

export interface TimelineResponse {
  points: TimelinePoint[]
  count: number
  report: { target_model: string; started_at: string; finished_at: string }
}

// ===== /api/settings =====

export interface AppSettings {
  default_model: string
  default_base_url: string
  workers: number
  max_tokens: number
  fail_below: number
  theme: 'dark' | 'light'
}
