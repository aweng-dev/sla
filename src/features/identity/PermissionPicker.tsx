import { useMemo, useState } from 'react'
import { CaretRight, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { Badge, Checkbox, SearchInput, Tooltip } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import type { PermissionCatalogue } from './identity.api'
import type { PermissionGroup } from './identity.types'

/**
 * Choosing from 234 permissions without it being unusable.
 *
 * ── Why grouped and collapsed, not a flat list ─────────────────────────────
 *
 * 234 checkboxes is not a form, it is a wall. The API already groups them by
 * module and tags each with a domain, so the picker inherits that shape: one
 * collapsible row per module, showing how many of its permissions are on, and
 * a whole-module toggle — because "give the bursar Finance" is the actual
 * intent nine times in ten, and ticking six boxes to express it invites
 * mistakes.
 *
 * Search filters across module names AND permission keys, and auto-opens what
 * it matched, so `results.publication` is findable by somebody who only knows
 * the key from an error message.
 *
 * ── Privileged permissions are marked, never hidden ────────────────────────
 *
 * The API flags some as consequential. Hiding them would make the dangerous
 * grant the invisible one; the point is that granting it is a decision, so it
 * carries a marker and the module row says how many it holds.
 */
export function PermissionPicker({
  catalogue,
  selected,
  onChange,
  disabled,
  readOnly,
}: {
  catalogue: PermissionCatalogue
  selected: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
  /** Renders the same shape without controls — used for a system role. */
  readOnly?: boolean
}) {
  const [term, setTerm] = useState('')
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())

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

  /* A search result the reader cannot see is not a result. */
  const isOpen = (module: string) => query !== '' || openModules.has(module)

  function toggleModule(module: string) {
    setOpenModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
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
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SearchInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search permissions"
          aria-label="Search permissions"
          className="w-64"
        />
        <p className="shrink-0 text-xs text-gray-600 tabular">
          {selected.size} of {catalogue.total} selected
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-6 text-sm text-gray-600">
          <MagnifyingGlass size={15} />
          Nothing matches “{term}”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          {byDomain.map(([domain, domainGroups], domainIndex) => (
            <div key={domain}>
              <p
                className={cn(
                  'bg-table-head px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.04em] text-gray-600',
                  domainIndex > 0 && 'border-t border-gray-200',
                )}
              >
                {humanize(domain)}
              </p>

              {domainGroups.map((group) => {
                const keys = group.permissions.map((p) => p.key)
                const on = keys.filter((k) => selected.has(k))
                const all = on.length === keys.length && keys.length > 0
                const some = on.length > 0 && !all
                const privileged = group.permissions.filter((p) => p.privileged).length
                const open = isOpen(group.module)

                return (
                  <div key={group.module} className="border-t border-gray-200">
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
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <CaretRight
                          size={10}
                          weight="bold"
                          className={cn(
                            'shrink-0 text-gray-500 transition-transform duration-150',
                            open && 'rotate-90',
                          )}
                        />
                        <span className="truncate text-sm text-gray-900">{group.name}</span>
                        {privileged > 0 && (
                          <Tooltip
                            side="top"
                            content={`${privileged} privileged permission${privileged === 1 ? '' : 's'}`}
                          >
                            <Warning size={12} className="shrink-0 text-brand-600" />
                          </Tooltip>
                        )}
                      </button>
                      <span className="shrink-0 text-2xs tabular text-gray-600">
                        {on.length}/{keys.length}
                      </span>
                    </div>

                    {open && (
                      <ul className="border-t border-gray-100 bg-gray-50/60 px-3 py-1.5">
                        {group.permissions.map((permission) => (
                          <li key={permission.key}>
                            <label
                              className={cn(
                                'flex items-center gap-2.5 py-1',
                                !readOnly && 'cursor-pointer',
                              )}
                            >
                              {!readOnly ? (
                                <Checkbox
                                  checked={selected.has(permission.key)}
                                  disabled={disabled}
                                  onChange={(e) => setMany([permission.key], e.target.checked)}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    selected.has(permission.key) ? 'bg-success-500' : 'bg-gray-300',
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
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
