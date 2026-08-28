import { get } from '@/shared/api/client'
import type { ReportDatasetSpec } from './reports.types'

/**
 * How to ask for each parameter a dataset accepts.
 *
 * ── Why this map exists in the client ──────────────────────────────────────
 *
 * `GET /admin/reports/datasets` names each dataset's parameters by KEY only —
 * `academic_session_id`, `below_percentage`, `status`. That is the right thing
 * for the API to publish: which control a key deserves is presentation, and
 * one catalogue has to serve this app and anything else that reads it.
 *
 * So the client decides. A key ending `_id` is a choice from a catalogue and
 * gets a select; a threshold gets a number; a status gets its own enum. A key
 * this map does not know still renders — as a plain text input — because a
 * dataset the API adds tomorrow must not produce a form with a missing field.
 */

export type ParameterControl = 'select' | 'catalog' | 'number' | 'text'

export interface ParameterSpec {
  key: string
  label: string
  control: ParameterControl
  /** `catalog` only — the endpoint whose rows become the options. */
  catalog?: CatalogName
  /** `select` only. */
  options?: { value: string; label: string }[]
  /** `number` only. */
  min?: number
  max?: number
  hint?: string
  /** Hidden when the institution does not have the thing — a school has no
   *  campuses, and offering an empty picker is worse than offering nothing. */
  requiresInstitution?: 'campuses' | 'organizational_units'
}

export type CatalogName =
  | 'academic-sessions'
  | 'academic-periods'
  | 'academic-levels'
  | 'learning-groups'
  | 'programs'
  | 'campuses'
  | 'organizational-units'

const SPECS: Record<string, Omit<ParameterSpec, 'key'>> = {
  status: {
    label: 'Status',
    control: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'graduated', label: 'Graduated' },
      { value: 'transferred', label: 'Transferred' },
      { value: 'withdrawn', label: 'Withdrawn' },
    ],
  },
  employment_status: {
    label: 'Employment status',
    control: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'suspended', label: 'Suspended' },
      { value: 'terminated', label: 'Terminated' },
    ],
  },
  academic_session_id: { label: 'Session', control: 'catalog', catalog: 'academic-sessions' },
  academic_period_id: { label: 'Period', control: 'catalog', catalog: 'academic-periods' },
  academic_level_id: { label: 'Level', control: 'catalog', catalog: 'academic-levels' },
  learning_group_id: { label: 'Class', control: 'catalog', catalog: 'learning-groups' },
  program_id: { label: 'Programme', control: 'catalog', catalog: 'programs' },
  campus_id: {
    label: 'Campus',
    control: 'catalog',
    catalog: 'campuses',
    requiresInstitution: 'campuses',
  },
  organizational_unit_id: {
    label: 'Department',
    control: 'catalog',
    catalog: 'organizational-units',
    requiresInstitution: 'organizational_units',
  },
  below_percentage: {
    label: 'Attendance below',
    control: 'number',
    min: 0,
    max: 100,
    hint: 'Only learners under this percentage. Leave blank for everyone.',
  },
  min_days_overdue: {
    label: 'Overdue by at least',
    control: 'number',
    min: 0,
    hint: 'In days. Leave blank for every unpaid invoice.',
  },
}

/**
 * The parameters one dataset accepts, in the order the API lists them, each
 * resolved to a control.
 *
 * The invoice datasets reuse the key `status` for a different enum than the
 * roster does, so the dataset is consulted before the shared map.
 */
export function parametersFor(dataset: ReportDatasetSpec): ParameterSpec[] {
  return dataset.parameters.map((key) => {
    if (key === 'status' && dataset.id === 'invoice_aging') {
      return {
        key,
        label: 'Invoice status',
        control: 'select' as const,
        options: [
          { value: 'issued', label: 'Issued' },
          { value: 'partial', label: 'Part paid' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'paid', label: 'Paid' },
        ],
      }
    }

    const spec = SPECS[key]
    return spec
      ? { key, ...spec }
      : { key, label: humanizeKey(key), control: 'text' as const }
  })
}

/** `academic_session_id` → `Academic session`. Only reached for a key this
 *  file has not been taught, so it is a fallback, not the normal path. */
function humanizeKey(key: string): string {
  const words = key.replace(/_id$/, '').replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/* ── Catalogues ────────────────────────────────────────────────────────────*/

export interface CatalogRow {
  id: string
  name: string
  code?: string | null
  is_current?: boolean
}

export const catalogKeys = {
  one: (name: CatalogName) => ['reports', 'catalog', name] as const,
}

export const catalogApi = {
  fetch: (name: CatalogName) => get<CatalogRow[]>(`/admin/catalog/${name}`),
}

/** The label a catalogue row shows in a picker: its name, with the code beside
 *  it when there is one, and the current session marked. */
export function catalogLabel(row: CatalogRow): string {
  const code = row.code ? ` (${row.code})` : ''
  return `${row.name}${code}${row.is_current ? ' — current' : ''}`
}

/**
 * Strip a parameter object down to what is worth sending.
 *
 * Empty strings are how a cleared select and an untouched number input both
 * present themselves, and sending `status: ""` is not the same request as
 * omitting it — the API would filter on an empty status and return nothing.
 */
export function pruneParameters(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value === null || value === undefined) continue
    out[key] = value
  }
  return out
}
