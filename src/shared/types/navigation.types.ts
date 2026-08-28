import type { PortalKey } from './auth.types'

/**
 * One user's navigation for one portal, built server-side.
 *
 * The sidebar is NOT a hard-coded list in this app. The API resolves which
 * modules a person holds, groups them into sections, and returns this tree —
 * so an institution that switches off Transport loses the Transport item
 * without a frontend deploy, and a teacher and a bursar get different rails
 * from the same build.
 *
 * Rendering an item is not granting it. Every route behind every item re-runs
 * its own check server-side; an item missing here is hidden, not forbidden.
 */
export interface NavigationItem {
  /** The module id — `students`, `fee_management`. Stable, and what the icon
   *  map is keyed on. */
  key: string
  label: string
  /** A path segment relative to the portal root, already kebab-cased by the
   *  API: `students`, `academic-sessions`, `fee-management`. Null on a section
   *  header, which is a grouping and not a destination. */
  route: string | null
  /** The module id again, in snake_case. Presentation-free by design — this
   *  app maps it to a Phosphor icon in `shared/icons/moduleIcons.ts`. */
  icon: string | null
  module_id: string | null
  badge: string | null
  children: NavigationItem[]
}

export interface NavigationTree {
  portal: PortalKey
  /** Where this user lands after sign-in — the first real item of the first
   *  section, so somebody with no dashboard module still opens on something. */
  default_route: string | null
  sections: NavigationItem[]
  /** The handful of things this user does most, drawn from the modules they
   *  actually hold rather than a fixed list. */
  quick_actions: NavigationItem[]
}
