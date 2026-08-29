import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretRight, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { Badge, Checkbox, SearchInput, Tooltip } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import type { PermissionCatalogue } from './identity.api'
import type { PermissionGroup } from './identity.types'
import { coverageOf } from './coverage'
import { CoverageBar, CoverageLegend, CoverageMap } from './CoverageMap'

/**
 * Choosing from 234 permissions without it being a wall.
 *
 * The map at the top is the role's fingerprint — one cell per module, fill
 * for how much of it is on. Clicking a cell opens that module. Search still
 * filters keys and names, because an error message quotes `results.publication`
 * and the reader should be able to paste it.
 *
 * Privileged permissions are marked, never hidden: the dangerous grant must
 * be the visible one.
 */
export function PermissionPicker({
  catalogue,
  selected,
  onChange,
  disabled,
  readOnly,
  focusModule,
  showMap = true,
}: {
  catalogue: PermissionCatalogue
  selected: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
  /** Renders the same shape without controls — used for a system role. */
  readOnly?: boolean
  /** Open and scroll this module into view — the coverage map drives it. */
  focusModule?: string | null
  /** The fingerprint map. Hidden when the parent already draws one. */
  showMap?: boolean
}) {
  const [term, setTerm] = useState('')
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const query = term.trim().toLowerCase()

  const groups = useMemo(() => {
    if (query === '') return catalogue.groups
    return catalogue.groups
      .map((group) => {
        const moduleMatches =
          group.name.toLowerCase().includes(query) || group.module.includes(query)
        const permissions = moduleMatches
          ? group.permissions
          : group.permissions.filter(
              (p) => p.key.toLowerCase().includes(query) || p.name.toLowerCase().includes(query),
            )
        return permissions.length > 0 ? { ...group, permissions } : null
      })
      .filter((g): g is PermissionGroup => g !== null)
  }, [catalogue.groups, query])

  const domains = useMemo(() => coverageOf(catalogue.groups, selected), [catalogue.groups, selected])
  const visibleCoverage = useMemo(() => coverageOf(groups, selected), [groups, selected])

  const isOpen = (module: string) => query !== '' || openModules.has(module)

  function openModule(module: string) {
    setOpenModules((prev) => new Set(prev).add(module))
    setActive(module)
  }

  useEffect(() => {
    if (!focusModule) return
    openModule(focusModule)
    const node = listRef.current?.querySelector(`[data-module="${CSS.escape(focusModule)}"]`)
    node?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [focusModule])

  function toggleModule(module: string) {
    setOpenModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
    setActive(module)
  }

  function setMany(keys: string[], on: boolean) {
    const next = new Set(selected)
    for (const key of keys) {
      if (on) next.add(key)
      else next.delete(key)
    }
    onChange(next)
  }

  const byDomain = useMemo(() => {
    const map = new Map<string, PermissionGroup[]>()
    for (const group of groups) {
      const list = map.get(group.domain) ?? []
      list.push(group)
      map.set(group.domain, list)
    }
    return [...map.entries()]
  }, [groups])

  return (
    <div className="flex flex-col gap-4">
      {showMap && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-900">Fingerprint</p>
            <CoverageLegend />
          </div>
          <CoverageMap
            domains={domains}
            density="module"
            size="sm"
            activeKey={active}
            onSelect={(key) => {
              setTerm('')
              openModule(key)
              requestAnimationFrame(() => {
                const node = listRef.current?.querySelector(`[data-module="${CSS.escape(key)}"]`)
                node?.scrollIntoView({
                  block: 'nearest',
                  behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                })
              })
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <SearchInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search permissions"
          aria-label="Search permissions"
          className="w-64"
        />
        <p className="shrink-0 text-sm tabular text-gray-600">
          <span className="font-semibold text-gray-900">{selected.size}</span> of {catalogue.total}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-6 text-sm text-gray-600">
          <MagnifyingGlass size={16} weight="bold" />
          Nothing matches “{term}”.
        </div>
      ) : (
        <div ref={listRef} className="overflow-hidden rounded-lg border border-gray-200">
          {byDomain.map(([domain, domainGroups], domainIndex) => {
            const domainCover = visibleCoverage.find((d) => d.domain === domain)
            return (
              <div key={domain}>
                <p
                  className={cn(
                    'flex items-center justify-between bg-table-head px-3 py-2 text-sm font-semibold text-gray-900',
                    domainIndex > 0 && 'border-t border-gray-200',
                  )}
                >
                  <span>{humanize(domain)}</span>
                  {domainCover && (
                    <span className="text-2xs font-medium tabular text-gray-600">
                      {domainCover.held}/{domainCover.total}
                    </span>
                  )}
                </p>

                {domainGroups.map((group) => {
                  const keys = group.permissions.map((p) => p.key)
                  const on = keys.filter((k) => selected.has(k))
                  const all = on.length === keys.length && keys.length > 0
                  const some = on.length > 0 && !all
                  const privileged = group.permissions.filter((p) => p.privileged).length
                  const open = isOpen(group.module)
                  const moduleCover = domainCover?.modules.find((m) => m.module === group.module)

                  return (
                    <div
                      key={group.module}
                      data-module={group.module}
                      className={cn(
                        'border-t border-gray-200',
                        active === group.module && 'bg-accent-50/40',
                      )}
                    >
                      <div className="flex items-center gap-2.5 px-3 py-2">
                        {!readOnly && (
                          <Checkbox
                            checked={all}
                            indeterminate={some}
                            disabled={disabled}
                            aria-label={`All ${group.name} permissions`}
                            onChange={() => setMany(keys, !all)}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => toggleModule(group.module)}
                          aria-expanded={open}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <CaretRight
                            size={12}
                            weight="bold"
                            className={cn(
                              'shrink-0 text-gray-500 transition-transform duration-150',
                              open && 'rotate-90',
                            )}
                          />
                          <span className="truncate text-sm font-medium text-gray-900">
                            {group.name}
                          </span>
                          {privileged > 0 && (
                            <Tooltip
                              side="top"
                              content={`${privileged} privileged permission${privileged === 1 ? '' : 's'}`}
                            >
                              <Warning size={14} weight="fill" className="shrink-0 text-brand-600" />
                            </Tooltip>
                          )}
                        </button>
                        {moduleCover && <CoverageBar module={moduleCover} />}
                        <span className="w-10 shrink-0 text-right text-2xs tabular text-gray-600">
                          {on.length}/{keys.length}
                        </span>
                      </div>

                      {open && (
                        <ul className="border-t border-gray-100 bg-gray-50/60 px-3 py-1.5">
                          {group.permissions.map((permission) => {
                            const granted = selected.has(permission.key)
                            return (
                              <li key={permission.key}>
                                <label
                                  className={cn(
                                    'flex items-center gap-2.5 py-1.5',
                                    !readOnly && 'cursor-pointer',
                                  )}
                                >
                                  {!readOnly ? (
                                    <Checkbox
                                      checked={granted}
                                      disabled={disabled}
                                      onChange={(e) =>
                                        setMany([permission.key], e.target.checked)
                                      }
                                    />
                                  ) : (
                                    <span
                                      className={cn(
                                        'h-2 w-2 shrink-0 rounded-sm',
                                        granted
                                          ? permission.privileged
                                            ? 'bg-brand-400'
                                            : 'bg-gray-900'
                                          : 'bg-gray-200',
                                      )}
                                      aria-hidden
                                    />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                                    {permission.name}
                                  </span>
                                  {permission.privileged && (
                                    <Badge tone="warning">Privileged</Badge>
                                  )}
                                  <code className="shrink-0 text-2xs text-gray-500">
                                    {permission.key}
                                  </code>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
