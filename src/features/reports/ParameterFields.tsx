import { useQueries } from '@tanstack/react-query'
import { Field, Input, Select } from '@/shared/ui'
import { useTenant } from '@/features/tenant/TenantProvider'
import {
  catalogApi,
  catalogKeys,
  catalogLabel,
  parametersFor,
  type CatalogName,
  type ParameterSpec,
} from './reports.parameters'
import type { ReportDatasetSpec } from './reports.types'

/**
 * The filters one dataset accepts, rendered as a form.
 *
 * Built from the dataset the API published rather than hard-coded per report,
 * so a dataset that gains a parameter gains a field here with no edit. The
 * control each key deserves comes from `reports.parameters`.
 *
 * ── Two things it deliberately hides ───────────────────────────────────────
 *
 * A parameter whose catalogue is EMPTY, and a parameter the institution has no
 * concept of. A school has no campuses — `supports_campuses` is false and
 * `/admin/catalog/campuses` answers `[]` — and a campus picker with nothing in
 * it is not a neutral empty control, it is an invitation to wonder what is
 * broken. Both cases render nothing at all.
 */
export function ParameterFields({
  dataset,
  values,
  onChange,
  errors,
  disabled,
}: {
  dataset: ReportDatasetSpec
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  errors?: Record<string, string>
  disabled?: boolean
}) {
  const { access } = useTenant()
  const institution = access?.institution

  const specs = parametersFor(dataset).filter((spec) => {
    if (spec.requiresInstitution === 'campuses') return institution?.supports_campuses === true
    if (spec.requiresInstitution === 'organizational_units') {
      return institution?.supports_organizational_units === true
    }
    return true
  })

  /* One request per catalogue the visible fields need, de-duplicated: two
   * parameters pointing at the same catalogue share a cache entry. */
  const catalogs = [
    ...new Set(
      specs.filter((s) => s.control === 'catalog' && s.catalog).map((s) => s.catalog as CatalogName),
    ),
  ]

  const results = useQueries({
    queries: catalogs.map((name) => ({
      queryKey: catalogKeys.one(name),
      queryFn: () => catalogApi.fetch(name),
      staleTime: 10 * 60_000,
    })),
  })

  const rowsFor = (name: CatalogName) => results[catalogs.indexOf(name)]?.data ?? []
  const loadingFor = (name: CatalogName) => results[catalogs.indexOf(name)]?.isLoading ?? false

  if (specs.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        This dataset takes no filters — it reports on everything you can see.
      </p>
    )
  }

  return (
    <div className="grid gap-x-4 sm:grid-cols-2">
      {specs.map((spec) => {
        const empty = spec.control === 'catalog' && spec.catalog && rowsFor(spec.catalog).length === 0
        if (empty && !loadingFor(spec.catalog as CatalogName)) return null

        return (
          <ParameterField
            key={spec.key}
            spec={spec}
            value={values[spec.key]}
            error={errors?.[spec.key]}
            disabled={disabled}
            rows={spec.catalog ? rowsFor(spec.catalog) : []}
            loading={spec.catalog ? loadingFor(spec.catalog) : false}
            onChange={(v) => onChange(spec.key, v)}
          />
        )
      })}
    </div>
  )
}

function ParameterField({
  spec,
  value,
  error,
  disabled,
  rows,
  loading,
  onChange,
}: {
  spec: ParameterSpec
  value: unknown
  error?: string
  disabled?: boolean
  rows: { id: string; name: string; code?: string | null; is_current?: boolean }[]
  loading: boolean
  onChange: (value: unknown) => void
}) {
  const text = value === undefined || value === null ? '' : String(value)

  return (
    <Field label={spec.label} hint={spec.hint} error={error}>
      {(props) => {
        if (spec.control === 'catalog') {
          return (
            <Select
              {...props}
              disabled={disabled || loading}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              placeholder={loading ? 'Loading…' : 'Any'}
              options={[
                { value: '', label: 'Any' },
                ...rows.map((row) => ({ value: row.id, label: catalogLabel(row) })),
              ]}
            />
          )
        }

        if (spec.control === 'select') {
          return (
            <Select
              {...props}
              disabled={disabled}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              options={[{ value: '', label: 'Any' }, ...(spec.options ?? [])]}
            />
          )
        }

        if (spec.control === 'number') {
          return (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={spec.min}
              max={spec.max}
              disabled={disabled}
              value={text}
              placeholder="Any"
              onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            />
          )
        }

        return (
          <Input
            {...props}
            disabled={disabled}
            value={text}
            placeholder="Any"
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }}
    </Field>
  )
}

/** The column checklist. Choosing none means "all of them", which is what the
 *  API's `effective_columns` reports back, so the empty state is not an error. */
export function ColumnPicker({
  dataset,
  selected,
  onChange,
  disabled,
}: {
  dataset: ReportDatasetSpec
  selected: string[]
  onChange: (columns: string[]) => void
  disabled?: boolean
}) {
  const all = dataset.columns
  const isAll = selected.length === 0

  function toggle(column: string) {
    /* From "all" the first click means "only this one", not "all except this
     * one" — the checklist shows every box ticked, so unticking one has to
     * start an explicit selection rather than silently keeping the rest. */
    const base = isAll ? all : selected
    const next = base.includes(column) ? base.filter((c) => c !== column) : [...base, column]
    onChange(next.length === all.length ? [] : next)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-gray-600">
          {isAll ? `All ${all.length} columns` : `${selected.length} of ${all.length} columns`}
        </p>
        {!isAll && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-xs text-accent-500 hover:underline"
          >
            Select all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {all.map((column) => {
          const on = isAll || selected.includes(column)
          return (
            <button
              key={column}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(column)}
              className={
                on
                  ? 'rounded-md border border-gray-400 bg-gray-100 px-2 py-1 text-xs text-gray-900 transition-colors hover:bg-gray-200 disabled:opacity-50'
                  : 'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50'
              }
            >
              {columnLabel(column)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** `attendance_percentage` → `Attendance percentage`, `total_minor` →
 *  `Total`. The `_minor` suffix is an encoding detail of the wire format and
 *  means nothing to a bursar. */
export function columnLabel(column: string): string {
  const words = column.replace(/_minor$/, '').replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
