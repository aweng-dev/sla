import { useState } from 'react'
import { Buildings, CalendarBlank, Palette, ToggleRight } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Badge, PageHeader, Tabs, panelId, type TabItem } from '@/shared/ui'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { BrandingTab } from './tabs/BrandingTab'
import { CalendarTab } from './tabs/CalendarTab'
import { FeaturesTab } from './tabs/FeaturesTab'
import { InstitutionTab } from './tabs/InstitutionTab'

/**
 * The institution's settings — and only what the API actually answers.
 *
 * ── There is no `/admin/settings` ──────────────────────────────────────────
 *
 * Probing it returns `ENDPOINT_NOT_FOUND`. Settings are not one resource: the
 * record is `/admin/institution`, the plan is `/admin/features`, the academic
 * year is `/admin/academic-sessions`. This screen gathers them into one place,
 * which is what a settings screen is for; the API deliberately keeps them
 * apart, because folding four lifecycles into one PUT makes an endpoint that
 * half-succeeds.
 *
 * ── Permissions decide what is drawn, not what is allowed ──────────────────
 *
 * `multi_tenancy.view` opens the institution record and the plan;
 * `multi_tenancy.manage` opens the writes on it; the calendar is its own pair
 * under `academic_sessions.*` and `academic_periods.*`. A reader holding none
 * of them still sees the same facts — the tenant profile and the current
 * Session and Period reach every signed-in person through `GET /portal/context`
 * — so the screen degrades to read-only rather than to a permissions error.
 *
 * The Plan tab is the exception and is not drawn at all without
 * `multi_tenancy.view`: its endpoint is the only source for those facts, so
 * there is nothing honest to put in it.
 */

/** Stable rather than a `useId()` fallback, so the ids a tab points at are the
 *  same string a test or a screen reader saw a render ago. There is only ever
 *  one settings tablist on the page. */
const TABS_ID = 'settings-tabs'

export function SettingsPage() {
  const t = useTerminology()
  const perms = usePermissions()

  const canViewInstitution = perms.has('multi_tenancy.view')
  const canManageInstitution = perms.has('multi_tenancy.manage')
  const canManageCalendar = perms.hasAny('academic_sessions.manage', 'academic_periods.manage')

  const tabs: TabItem[] = [
    { key: 'institution', label: 'Institution', icon: <Buildings size={14} /> },
    { key: 'branding', label: 'Branding', icon: <Palette size={14} /> },
    { key: 'calendar', label: t('sessions'), icon: <CalendarBlank size={14} /> },
    ...(canViewInstitution
      ? [{ key: 'features', label: 'Plan', icon: <ToggleRight size={14} /> }]
      : []),
  ]

  const [tab, setTab] = useState('institution')

  return (
    /* Sprig's Settings is a measured column, not the full canvas: a settings
     * sub-nav takes the left third of its content area and the cards fill what
     * is left — roughly 900px at this window. This app navigates settings with
     * tabs rather than a second rail, so the width has to be asked for. A form
     * field stretched to 1100px is the wrong shape for a name. */
    <PageStack className="max-w-[60rem]">
      <PageHeader
        title="Settings"
        description="The institution's record, how it presents itself, and the year it is running."
        meta={
          !canManageInstitution && !canManageCalendar ? (
            <Badge tone="outline">Read-only for your access</Badge>
          ) : undefined
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} baseId={TABS_ID} />

      {/* The panel half of the tablist contract: `Tabs` points every tab at
          `panelId(TABS_ID, key)`, so exactly one element has to carry that id
          and name the tab it belongs to. Only the active tab's body is
          mounted, so the id moves with the selection rather than four panels
          existing with three of them hidden. */}
      <div
        role="tabpanel"
        id={panelId(TABS_ID, tab)}
        aria-labelledby={`${TABS_ID}-tab-${tab}`}
      >
        {tab === 'institution' && <InstitutionTab />}
        {tab === 'branding' && <BrandingTab />}
        {tab === 'calendar' && <CalendarTab />}
        {tab === 'features' && canViewInstitution && <FeaturesTab />}
      </div>
    </PageStack>
  )
}
