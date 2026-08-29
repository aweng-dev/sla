import type { PermissionGroup } from './identity.types'

/**
 * How much of the catalogue a set of permission keys actually covers.
 *
 * The screens paint this rather than a count, because "34 permissions" does
 * not say whether a role is a bursar or a form tutor — the shape of the
 * coverage does. Domain and module are the two zooms the UI uses.
 */

export interface ModuleCoverage {
  module: string
  name: string
  domain: string
  total: number
  held: number
  privilegedTotal: number
  privilegedHeld: number
}

export interface DomainCoverage {
  domain: string
  total: number
  held: number
  privilegedHeld: number
  modules: ModuleCoverage[]
}

export function coverageOf(
  groups: PermissionGroup[],
  selected: Iterable<string>,
): DomainCoverage[] {
  const held = selected instanceof Set ? selected : new Set(selected)
  const domains = new Map<string, DomainCoverage>()

  for (const group of groups) {
    let heldCount = 0
    let privilegedTotal = 0
    let privilegedHeld = 0
    for (const entry of group.permissions) {
      const on = held.has(entry.key)
      if (on) heldCount += 1
      if (entry.privileged) {
        privilegedTotal += 1
        if (on) privilegedHeld += 1
      }
    }

    const module: ModuleCoverage = {
      module: group.module,
      name: group.name,
      domain: group.domain,
      total: group.permissions.length,
      held: heldCount,
      privilegedTotal,
      privilegedHeld,
    }

    const existing = domains.get(group.domain)
    if (existing) {
      existing.total += module.total
      existing.held += module.held
      existing.privilegedHeld += module.privilegedHeld
      existing.modules.push(module)
    } else {
      domains.set(group.domain, {
        domain: group.domain,
        total: module.total,
        held: module.held,
        privilegedHeld: module.privilegedHeld,
        modules: [module],
      })
    }
  }

  return [...domains.values()]
}

export function ratio(held: number, total: number): number {
  if (total <= 0) return 0
  return held / total
}
