import { useQuery } from '@tanstack/react-query'
import { academicsCatalog } from '../academics.api'
import { academicsKeys } from '../academics.keys'
import { Select, type SelectOption } from '@/shared/ui'
import type { CatalogItem } from '../academics.types'

/**
 * The dropdowns every form on this surface picks a related record from.
 *
 * ── Why they are hooks rather than components with a `value` prop ──────────
 *
 * Because the caller needs the OPTIONS as well as the control: a form that
 * defaults a session to the current one has to know which one that is before
 * it renders, and a filter bar has to know whether there is more than one
 * option before deciding to show itself. Returning the list lets both happen;
 * a black-box `<SessionPicker>` would hide it.
 *
 * ── Cached hard, on purpose ────────────────────────────────────────────────
 *
 * A programme list does not change while somebody fills in a form, and these
 * are read by nearly every screen in the section. Ten minutes of staleness
 * removes almost every request; a write that genuinely changes a catalogue
 * invalidates `academicsKeys.catalog.all` through `ACADEMIC_FANOUT`.
 */

const CATALOG_STALE = 10 * 60_000

function useCatalog(key: readonly unknown[], fn: () => Promise<CatalogItem[]>, enabled = true) {
  const query = useQuery({
    queryKey: key,
    queryFn: fn,
    staleTime: CATALOG_STALE,
    enabled,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    /** Ready for `<Select options>`. `code` is appended when it exists because
     *  two classes can share a name across programmes and the code is what
     *  tells them apart on a register. */
    options: (query.data ?? []).map<SelectOption>((item) => ({
      value: item.id,
      label: item.code ? `${item.name} · ${item.code}` : item.name,
    })),
  }
}

export const useSessionCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.sessions, academicsCatalog.sessions, enabled)

export const usePeriodCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.periods, academicsCatalog.periods, enabled)

export const useLevelCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.levels, academicsCatalog.levels, enabled)

export const useProgramCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.programs, academicsCatalog.programs, enabled)

export const useCourseCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.courses, academicsCatalog.courses, enabled)

export const useGroupCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.groups, academicsCatalog.groups, enabled)

/** Course offerings, for the screens that attach something to one — an
 *  assignment, a forum, a timetable slot. */
export const useOfferingCatalog = (enabled = true) =>
  useCatalog(academicsKeys.catalog.offerings, academicsCatalog.offerings, enabled)

/**
 * Organizational units and campuses exist only for institutions arranged that
 * way. A school answers 404 RESOURCE_NOT_FOUND — "This institution keeps no
 * organizational chart" — which is a statement about the institution TYPE, not
 * a failure. Callers pass `institution.supports_organizational_units` /
 * `supports_campuses` so the request is never made for one that has none.
 */
export const useUnitCatalog = (supported: boolean) =>
  useCatalog(academicsKeys.catalog.units, academicsCatalog.units, supported)

export const useCampusCatalog = (supported: boolean) =>
  useCatalog(academicsKeys.catalog.campuses, academicsCatalog.campuses, supported)

/**
 * A `<Select>` with a "no filter" row at the top. Filters need an explicit way
 * back to unfiltered, and a native select cannot be cleared otherwise.
 *
 * The width goes on a WRAPPER, not on the select. `Select` renders its control
 * inside a `relative flex w-full` box that positions the caret against its own
 * right edge — so a width class passed through to the `<select>` shrinks the
 * control while the box stays full-width, which strands the caret at the far
 * side of the toolbar and pushes the next filter onto its own line.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  allLabel: string
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={className ?? 'w-48'}>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || options.length === 0}
        options={[{ value: '', label: allLabel }, ...options]}
      />
    </div>
  )
}
