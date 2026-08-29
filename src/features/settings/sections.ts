/**
 * What lives in Settings, and — just as importantly — what therefore stops
 * living in the sidebar.
 *
 * ── Why the rail is overridden at all ──────────────────────────────────────
 *
 * The navigation tree is server-driven: `GET /portal/context` decides which
 * modules a person holds and groups them into sections, and the rail renders
 * exactly what it is given. That is the right default and nothing here
 * changes it for the general case.
 *
 * But three of those modules are not places anyone works — they are the
 * institution's shape. Structure, Sessions, Periods and Year groups are set up
 * once and revisited when something changes; the rail is for the screens
 * somebody opens daily. Leaving them there put configuration entries above
 * Programmes and Subjects in the Academics list, which is where the registrar
 * actually goes.
 *
 * Year groups deliberately did NOT move. It looked like configuration next to
 * Structure and Sessions, but it is edited alongside the things that hang off
 * it — classes, programmes, progression — and those all live in Academics. A
 * ladder you reach for while placing a cohort belongs beside the cohort.
 *
 * So the rail hides them and Settings adopts them. The API is unchanged — the
 * modules still resolve, the permissions still gate, and every route behind
 * them still re-checks server-side. This is a presentation decision about
 * where a link lives, which is the one thing the navigation tree deliberately
 * leaves to the client (`NavigationResource` carries no colours and no
 * component names for exactly this reason).
 *
 * ── One list, two consumers ────────────────────────────────────────────────
 *
 * `SETTINGS_OWNED_MODULES` is read by the rail to hide, and the groups below
 * are read by Settings to show. They are the same data so the two cannot drift
 * into a module that appears in neither place — which is the failure that
 * would be hardest to notice.
 */

import type { TerminologyKey } from '@/shared/types/tenant.types'

export interface SettingsSection {
  /** The `/settings/{key}` segment. */
  key: string
  /** Fixed label, or a terminology key resolved against the institution's own
   *  vocabulary — a school's "Year groups" is a university's "Stages". */
  label: string | { term: TerminologyKey }
  /** The module id the API knows this by, when there is one. Used to hide the
   *  rail item and to gate the section on the module being enabled. */
  moduleId?: string
  /** Permission required to see the section at all. */
  permission?: string
  description: string
}

export interface SettingsGroup {
  key: string
  label: string
  sections: SettingsSection[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: 'institution',
    label: 'Institution',
    sections: [
      {
        key: 'institution',
        label: 'Profile',
        description: 'The name, and the defaults every date and amount is formatted through.',
      },
      {
        key: 'branding',
        label: 'Branding',
        description: 'How the institution presents itself.',
      },
      {
        key: 'plan',
        label: 'Plan',
        permission: 'multi_tenancy.view',
        description: 'What is switched on for this institution.',
      },
    ],
  },
  {
    key: 'academic',
    label: 'Academic',
    sections: [
      {
        key: 'structure',
        label: 'Structure',
        moduleId: 'institution_structure',
        permission: 'institution_structure.view',
        description:
          'How this institution is arranged, and the vocabulary the rest of the product speaks because of it.',
      },
      {
        key: 'sessions',
        label: { term: 'sessions' },
        moduleId: 'academic_sessions',
        permission: 'academic_sessions.view',
        description: 'The academic years this institution runs, and which one is current.',
      },
      {
        key: 'periods',
        label: { term: 'periods' },
        moduleId: 'academic_periods',
        permission: 'academic_periods.view',
        description: 'How each year is divided. Every register and gradebook is scoped to one.',
      },
    ],
  },
]

/** Flat lookup for the router and the section renderer. */
export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap(
  (group) => group.sections,
)

export const DEFAULT_SETTINGS_SECTION = 'institution'

/**
 * Module ids the rail must not draw, because Settings owns them.
 *
 * Read by `shared/layout/Sidebar`. Anything added to a group above with a
 * `moduleId` disappears from the rail automatically — there is no second list
 * to keep in step.
 */
export const SETTINGS_OWNED_MODULES: ReadonlySet<string> = new Set(
  SETTINGS_SECTIONS.map((section) => section.moduleId).filter(
    (id): id is string => id !== undefined,
  ),
)

/**
 * Where a module's old top-level route now lives.
 *
 * The rail no longer links these, but the module scaffold cross-links to them,
 * a dashboard tile may, and somebody has them bookmarked — so the old paths
 * redirect here rather than 404.
 */
export const MOVED_ROUTES: Record<string, string> = {
  'institution-structure': '/settings/structure',
  'academic-sessions': '/settings/sessions',
  'academic-periods': '/settings/periods',
}
