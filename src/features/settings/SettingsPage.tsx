import { Link, useParams } from '@tanstack/react-router'
import { cn } from '@/shared/lib/cn'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useModules, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { Badge, EmptyState, PageHeader } from '@/shared/ui'
import { InstitutionTab } from './tabs/InstitutionTab'
import { BrandingTab } from './tabs/BrandingTab'
import { FeaturesTab } from './tabs/FeaturesTab'
import { InstitutionStructurePage } from '@/features/academics/InstitutionStructurePage'
import { AcademicSessionsPage } from '@/features/academics/AcademicSessionsPage'
import { AcademicPeriodsPage } from '@/features/academics/AcademicPeriodsPage'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './sections'

/**
 * Settings, laid out the way Sprig lays its own out.
 *
 * ── Why a sub-nav and not tabs ─────────────────────────────────────────────
 *
 * Tabs worked at four sections. There are now seven across two groups, and a
 * row of seven underline tabs is a row nobody scans — Sprig hit the same wall
 * and answered it with a left column of grouped links: a bold heading per
 * group, quiet items beneath, and a light pill on the active one. It is the
 * same control the rail uses, one level down.
 *
 * ── The academic sections are the real screens ─────────────────────────────
 *
 * Structure, Sessions, Periods and Year groups are not simplified copies for
 * Settings — they are the same components the rail used to link to, rendered
 * with `embedded` so they drop their page title and inherit this one. There is
 * no second implementation to drift, and moving them cost no functionality:
 * creating a session, making one current, reordering the ladder all still work
 * exactly where they did.
 */
export function SettingsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const modules = useModules()
  const { tenant } = useTenant()

  const params = useParams({ strict: false }) as { section?: string }
  const requested = params.section ?? DEFAULT_SETTINGS_SECTION

  /** A section is offered only when its module is on AND its permission is
   *  held — the same two gates the rail applied before Settings adopted it. */
  function reachable(section: SettingsSection): boolean {
    if (section.moduleId && !modules.has(section.moduleId)) return false
    if (section.permission && !perms.has(section.permission)) return false
    return true
  }

  function labelFor(section: SettingsSection): string {
    return typeof section.label === 'string' ? section.label : t(section.label.term)
  }

  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter(reachable),
  })).filter((group) => group.sections.length > 0)

  const available = SETTINGS_SECTIONS.filter(reachable)
  const active =
    available.find((section) => section.key === requested) ?? available[0] ?? null

  return (
    <PageStack>
      <PageHeader
        title="Settings"
        description={`How ${tenant.name} is set up.`}
        actions={tenant.status !== 'active' ? <Badge tone="warning">{tenant.status}</Badge> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Settings" className="lg:sticky lg:top-0 lg:self-start">
          {groups.map((group, index) => (
            <div key={group.key} className={index === 0 ? '' : 'pt-5'}>
              <p className="px-2.5 pb-1.5 text-sm font-bold leading-5 text-gray-900">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.sections.map((section) => {
                  const current = section.key === active?.key
                  return (
                    <li key={section.key}>
                      <Link
                        to="/settings/$section"
                        params={{ section: section.key }}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'flex h-8 items-center rounded-md px-2.5 text-[0.8125rem] leading-5 transition-colors',
                          current
                            ? 'bg-rail-active font-semibold text-gray-900'
                            : 'font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                        )}
                      >
                        {labelFor(section)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          {active === null ? (
            <EmptyState
              title="Nothing to configure"
              description="You do not have access to any settings for this institution."
            />
          ) : (
            <section aria-label={labelFor(active)} className="flex flex-col gap-4">
              <div>
                <h2 className="text-md font-semibold text-gray-900">{labelFor(active)}</h2>
                <p className="mt-0.5 text-sm text-gray-600">{active.description}</p>
              </div>
              <SectionBody section={active.key} />
            </section>
          )}
        </div>
      </div>
    </PageStack>
  )
}

/** The academic sections are the rail's own screens, rendered without their
 *  page title. Nothing is reimplemented here. */
function SectionBody({ section }: { section: string }) {
  switch (section) {
    case 'institution':
      return <InstitutionTab />
    case 'branding':
      return <BrandingTab />
    case 'plan':
      return <FeaturesTab />
    case 'structure':
      return <InstitutionStructurePage embedded />
    case 'sessions':
      return <AcademicSessionsPage embedded />
    case 'periods':
      return <AcademicPeriodsPage embedded />
    default:
      return null
  }
}
