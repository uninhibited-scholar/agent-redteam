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
  type: 'sample_result' | 'suite_done' | 'scan_done' | 'scan_started'
  data: SampleResult | SuiteResult | ScanReport | { suites: string[] }
}
