/**
 * The reporting subsystem, transcribed from live responses.
 *
 * Four moving parts, and they are genuinely different things:
 *
 *   DATASET     what can be reported on. A fixed catalogue the API publishes,
 *               naming the columns it can emit and the parameters it accepts.
 *   DEFINITION  a saved question — a dataset plus chosen columns, parameters
 *               and a visibility. Reusable, shareable.
 *   RUN         one execution of a definition. Asynchronous: it is queued,
 *               becomes running, then succeeds or fails, and leaves a file
 *               that expires.
 *   SCHEDULE    a standing instruction to run a definition and email it.
 *
 * An EXPORT is the shortcut past all of that: a dataset and some filters, run
 * once, with nothing saved.
 */

export type ReportDatasetId =
  | 'student_roster'
  | 'staff_roster'
  | 'attendance_summary'
  | 'invoice_aging'

export type ReportFormat = 'csv' | 'json'
export type ReportVisibility = 'private' | 'shared'
export type ReportRunStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type ReportCadence = 'daily' | 'weekly' | 'monthly'
export type ExportStatus = 'queued' | 'running' | 'succeeded' | 'failed'

/** What the API is willing to report on. `columns` is the full set it can
 *  emit; `parameters` names the filters it accepts, by key only — the control
 *  each one deserves is the client's decision. */
export interface ReportDatasetSpec {
  id: ReportDatasetId
  label: string
  description: string
  /** The module that owns these records. A reader without it cannot run the
   *  dataset, whatever their report permissions say. */
  module: string
  columns: string[]
  parameters: string[]
}

export interface ReportDefinition {
  id: string
  name: string
  description: string | null
  dataset: ReportDatasetId
  dataset_label: string
  parameters: Record<string, unknown>
  /** What the author chose. Empty means "all of them". */
  columns: string[]
  /** What will actually be emitted — the author's choice, or the dataset's
   *  full set when they chose none. Render THIS, not `columns`. */
  effective_columns: string[]
  visibility: ReportVisibility
  is_mine: boolean
  last_run_at: string | null
  created_at: string
}

export interface ReportRun {
  id: string
  report_definition_id: string
  /** Set when a schedule produced this run rather than a person. */
  report_schedule_id: string | null
  trigger: 'manual' | 'scheduled' | string
  status: ReportRunStatus
  format: ReportFormat
  parameters: Record<string, unknown>
  columns: string[]
  row_count: number | null
  byte_size: number | null
  duration_ms: number | null
  error_message: string | null
  /** The only honest gate on offering a download. A succeeded run whose file
   *  has expired answers false. */
  is_downloadable: boolean
  started_at: string | null
  completed_at: string | null
  expires_at: string | null
  created_at: string
}

export interface ReportSchedule {
  id: string
  report_definition_id: string
  cadence: ReportCadence
  /** 0–6, Sunday first. Only meaningful for a weekly cadence. */
  day_of_week: number | null
  /** 1–28 — never 29–31, so a monthly schedule cannot skip February. */
  day_of_month: number | null
  time_of_day: string
  timezone: string
  format: ReportFormat
  recipients: string[]
  is_active: boolean
  run_as_user_id: string
  next_run_at: string | null
  last_run_at: string | null
}

export interface ExportRequest {
  id: string
  dataset: ReportDatasetId
  dataset_label: string
  format: ReportFormat
  filters: Record<string, unknown>
  columns: string[]
  status: ExportStatus
  status_label: string
  row_count: number | null
  byte_size: number | null
  error_message: string | null
  is_downloadable: boolean
  expires_at: string | null
  created_at: string
}

/* ── Analytics ─────────────────────────────────────────────────────────────*/

export type MetricGranularity = 'daily' | 'weekly' | 'monthly'

export interface MetricOption {
  id: string
  label: string
}

export interface DashboardSummary {
  metrics: MetricOption[]
  today: { metric: string; label: string; value: number }[]
  month: { metric: string; label: string; value: number }[]
  period: { today: string; month: string }
  locale: string
  timezone: string
}

export interface MetricSeries {
  metric: MetricOption
  granularity: MetricGranularity
  range: { from: string; to: string }
  points: { label: string; value: number }[]
  is_currency: boolean
  currency: string | null
  locale: string
}

export interface StudentStatistics {
  total: number
  on_roll: number
  by_status: Record<string, number>
  by_gender: Record<string, number>
}

export interface FinanceSummary {
  currency: string
  granularity: string
  from: string
  to: string
  totals: {
    payment_count: number
    charged_minor: number
    bursaries_minor: number
    write_offs_minor: number
    collected_minor: number
  }
  periods: {
    period: string
    payment_count: number
    charged_minor: number
    bursaries_minor: number
    write_offs_minor: number
    collected_minor: number
  }[]
}

/* ── Payloads ──────────────────────────────────────────────────────────────*/

export interface CreateReportPayload {
  name: string
  description?: string | null
  dataset: ReportDatasetId
  parameters?: Record<string, unknown>
  columns?: string[]
  visibility?: ReportVisibility
}

export interface RunReportPayload {
  format?: ReportFormat
  /** Overrides the definition's saved parameters for this run only. */
  parameters?: Record<string, unknown>
}

export interface CreateSchedulePayload {
  cadence: ReportCadence
  day_of_week?: number | null
  day_of_month?: number | null
  time_of_day?: string
  timezone?: string
  format?: ReportFormat
  recipients: string[]
}

export interface CreateExportPayload {
  dataset: ReportDatasetId
  format?: ReportFormat
  filters?: Record<string, unknown>
  columns?: string[]
}
