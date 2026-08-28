import { del, get, getPage, http, post, put } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import type {
  CreateExportPayload,
  CreateReportPayload,
  CreateSchedulePayload,
  DashboardSummary,
  ExportRequest,
  FinanceSummary,
  MetricGranularity,
  MetricSeries,
  ReportDatasetSpec,
  ReportDefinition,
  ReportRun,
  ReportSchedule,
  RunReportPayload,
  StudentStatistics,
} from './reports.types'

export const reportKeys = {
  all: ['reports'] as const,
  datasets: () => ['reports', 'datasets'] as const,
  list: (params?: unknown) => ['reports', 'list', params] as const,
  detail: (id: string) => ['reports', 'detail', id] as const,
  runs: (id: string, params?: unknown) => ['reports', 'runs', id, params] as const,
  run: (runId: string) => ['reports', 'run', runId] as const,
  runRows: (runId: string) => ['reports', 'run-rows', runId] as const,
  schedules: (id: string) => ['reports', 'schedules', id] as const,
  exports: (params?: unknown) => ['reports', 'exports', params] as const,
  analytics: {
    summary: () => ['reports', 'analytics', 'summary'] as const,
    series: (metric: string, params: unknown) =>
      ['reports', 'analytics', 'series', metric, params] as const,
    students: () => ['reports', 'analytics', 'students'] as const,
    finance: (params: unknown) => ['reports', 'analytics', 'finance', params] as const,
  },
} as const

export interface MetricSeriesQuery {
  granularity?: MetricGranularity
  from?: string
  to?: string
}

export const reportsApi = {
  /** The catalogue of what can be reported on. Effectively static — it is a
   *  server-side enum — so it is cached hard by the hook that reads it. */
  datasets: () => get<ReportDatasetSpec[]>('/admin/reports/datasets'),

  list: (params?: Record<string, unknown>): Promise<Paginated<ReportDefinition>> =>
    getPage<ReportDefinition>('/admin/reports', { params }),

  detail: (id: string) => get<ReportDefinition>(`/admin/reports/${id}`),

  create: (payload: CreateReportPayload) => post<ReportDefinition>('/admin/reports', payload),

  update: (id: string, payload: Partial<CreateReportPayload>) =>
    put<ReportDefinition>(`/admin/reports/${id}`, payload),

  remove: (id: string) => del(`/admin/reports/${id}`),

  /**
   * Runs of ONE definition, and only the caller's own.
   *
   * The API narrows this in the query — `compiled_for_user_id` — because a run
   * is compiled against the runner's own scopes. Two people running the same
   * shared definition can legitimately get different rows, so showing somebody
   * else's run would show them rows they may not be entitled to.
   */
  runs: (id: string, params?: Record<string, unknown>): Promise<Paginated<ReportRun>> =>
    getPage<ReportRun>(`/admin/reports/${id}/runs`, { params }),

  /** Answers 202 — the work is queued, not done. Poll `run` until it settles. */
  run: (id: string, payload: RunReportPayload) =>
    post<ReportRun>(`/admin/reports/${id}/runs`, payload),

  runStatus: (runId: string) => get<ReportRun>(`/admin/report-runs/${runId}`),

  schedules: (id: string) => get<ReportSchedule[]>(`/admin/reports/${id}/schedules`),

  createSchedule: (id: string, payload: CreateSchedulePayload) =>
    post<ReportSchedule>(`/admin/reports/${id}/schedules`, payload),

  removeSchedule: (scheduleId: string) => del(`/admin/report-schedules/${scheduleId}`),

  exports: (params?: Record<string, unknown>): Promise<Paginated<ExportRequest>> =>
    getPage<ExportRequest>('/admin/exports', { params }),

  createExport: (payload: CreateExportPayload) => post<ExportRequest>('/admin/exports', payload),

  exportStatus: (id: string) => get<ExportRequest>(`/admin/exports/${id}`),

  /* ── Analytics ─────────────────────────────────────────────────────────*/

  summary: () => get<DashboardSummary>('/admin/dashboard/summary'),

  series: (metric: string, params: MetricSeriesQuery) =>
    get<MetricSeries>(`/admin/dashboard/metrics/${metric}`, { params }),

  studentStatistics: () => get<StudentStatistics>('/admin/students/statistics'),

  financeSummary: (params: { from?: string; to?: string; granularity?: string }) =>
    get<FinanceSummary>('/admin/finance/summary', { params }),
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reading a result
 *
 * The download endpoints stream the file itself rather than an enveloped
 * payload — `StandardizeApiResponse` excludes streamed responses by type, so a
 * CSV export is a CSV and not a CSV wrapped in JSON. Two consequences:
 *
 *   • They need the bearer token like anything else, so they cannot be an
 *     `<a href>`. Both helpers below go through the authenticated client.
 *   • `get()` would try to read `.data.data` off a string. They use `http`
 *     directly.
 * ──────────────────────────────────────────────────────────────────────────*/

/** One row of a JSON run — the dataset's columns, values already stringified
 *  or numeric by the server. */
export type ReportRow = Record<string, string | number | null>

/**
 * The rows of a JSON run, for previewing in the app.
 *
 * This is why offering `json` as a run format matters: a CSV can only be
 * downloaded and opened elsewhere, but a JSON run can be read on the screen
 * that asked for it. The response is a bare array — no envelope.
 */
export async function fetchRunRows(runId: string): Promise<ReportRow[]> {
  const response = await http.get<ReportRow[] | string>(
    `/admin/report-runs/${runId}/download`,
    { responseType: 'json' },
  )
  const body = response.data
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as ReportRow[]
    } catch {
      return []
    }
  }
  return Array.isArray(body) ? body : []
}

/**
 * Pull a run or export down as a file and hand it to the browser.
 *
 * The object URL is revoked on the next tick rather than immediately: Safari
 * has not started the download when `click()` returns, and revoking too early
 * cancels it.
 */
export async function downloadArtifact(url: string, filename: string): Promise<void> {
  const response = await http.get<Blob>(url, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(response.data)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

export const downloadRun = (run: ReportRun, reportName: string) =>
  downloadArtifact(
    `/admin/report-runs/${run.id}/download`,
    `${slug(reportName)}-${run.id.slice(0, 8)}.${run.format}`,
  )

export const downloadExport = (record: ExportRequest) =>
  downloadArtifact(
    `/admin/exports/${record.id}/download`,
    `${slug(record.dataset_label)}-${record.id.slice(0, 8)}.${record.format}`,
  )

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  )
}

/** A run or export that has not settled. Used to decide whether to keep
 *  polling — the work is queued server-side and nothing pushes. */
export function isPending(status: string): boolean {
  return status === 'queued' || status === 'running'
}
