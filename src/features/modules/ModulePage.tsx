import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import {
  CaretRight,
  Gear,
  SquaresFour,
  Student,
  UserCircle,
  WarningCircle,
} from '@phosphor-icons/react'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { ModuleIcon } from '@/shared/icons/moduleIcons'
import { PageStack } from '@/shared/layout/AppShell'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  EntityIcon,
  MetaDot,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import type { Module } from '@/shared/types/auth.types'
import type { NavigationItem } from '@/shared/types/navigation.types'
import { moduleCatalogEntry, moduleIdFromSegment } from './moduleCatalog'
import { LinkButton, type BuiltRoute } from './LinkButton'
import { NotFoundPage } from './NotFoundPage'

/**
 * Every module that does not have a screen of its own yet.
 *
 * ── Why this page exists ───────────────────────────────────────────────────
 *
 * The rail is server-driven and lists sixty-four modules for an institution
 * owner. A handful of them are built against the API; the rest land here
 * through the catch-all `/$module`. That makes this, today, what most of the
 * product looks like — so it is written to be worth reading rather than
 * apologised for.
 *
 * ── The one rule it follows ────────────────────────────────────────────────
 *
 * Say only what is true and say exactly which thing is true. There are three
 * different reasons a module segment can fail to open a screen, and they need
 * three different answers: the module is yours and unbuilt, the module exists
 * and is not yours, or there is no such module. Collapsing them into one
 * "coming soon" tells the reader nothing and, for the middle case, is a lie.
 *
 * ── Why it is drawn this quietly ───────────────────────────────────────────
 *
 * It is a Sprig screen that happens to be empty, not an error page: title, icon
 * tile and meta row, then one hairlined panel of 13px muted prose. No banner,
 * no oversized glyph, no coloured status pill — the module's state is a dot and
 * plain ink in the meta row, the same as every status in the product.
 *
 * Nothing here is invented. The title, section, enabled state and capability
 * list come from `GET /portal/context`; the one-line description and the route
 * inventory come from `moduleCatalog.ts`, which is compiled from the backend's
 * own registry and route table. A module neither knows about renders without
 * those lines rather than with plausible ones.
 */
export function ModulePage() {
  const params = useParams({ strict: false })
  const segment = typeof params.module === 'string' ? params.module : ''
  const { access, isLoading } = useTenant()

  /* The navigation tree is the only authority on what this person may open.
   * `route` is already the kebab-cased segment the router matched. */
  const held = useMemo(() => {
    for (const section of access?.navigation.sections ?? []) {
      for (const item of section.children) {
        if (item.route === segment) return { item, section }
      }
    }
    return null
  }, [access, segment])

  const moduleId = held?.item.module_id ?? moduleIdFromSegment(segment)
  const record = access?.modules.find((module) => module.id === moduleId) ?? null

  if (!access) {
    return isLoading ? <ModuleSkeleton /> : <ContextUnavailable />
  }

  if (held) {
    return <UnbuiltModule item={held.item} section={held.section} record={record} />
  }

  /* Known to the institution, absent from this person's tree — a real answer,
   * and a different one from "no such address". */
  if (record) {
    return <NotHeld record={record} />
  }

  return <NotFoundPage />
}

/* ── Local pieces, drawn the way Sprig draws them ─────────────────────────── */

/** The reading column. Sprig's settings content sits in a column of roughly
 *  two-thirds the canvas; a paragraph run across 1400px is the fastest way to
 *  stop looking like this product. */
const COLUMN = 'flex w-full max-w-3xl flex-col gap-5'

/** A state, as the product renders every state: a coloured dot and plain ink.
 *  Never a filled pill — see `StatusBadge`, which this matches by hand because
 *  "enabled" is a module's switch rather than an API status string. */
function DotFact({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', on ? 'bg-success-500' : 'bg-gray-400')}
        aria-hidden
      />
      {children}
    </span>
  )
}

/** A heading inside a panel: semibold, dark, the same size as the text under
 *  it, with the description line in grey. Not an uppercase overline. */
function PanelSection({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-gray-600">{description}</p>}
      {children}
    </section>
  )
}

/* ── The common case: a module this person holds, with no screen yet ──────── */

function UnbuiltModule({
  item,
  section,
  record,
}: {
  item: NavigationItem
  section: NavigationItem
  record: Module | null
}) {
  const { tenant } = useTenant()
  const moduleId = item.module_id ?? item.key
  const entry = moduleCatalogEntry(moduleId)
  const capabilities = readCapabilities(record)
  const source = readSource(record)

  return (
    <PageStack>
      <PageHeader
        icon={
          <EntityIcon tone="neutral">
            <ModuleIcon name={item.icon ?? moduleId} size={16} />
          </EntityIcon>
        }
        title={item.label}
        meta={
          <>
            <span>{section.label}</span>
            <MetaDot />
            <span className="font-mono text-2xs text-gray-500">{moduleId}</span>
            {record && (
              <>
                <MetaDot />
                <DotFact on={record.enabled}>{record.enabled ? 'Enabled' : 'Off'}</DotFact>
              </>
            )}
            {source && (
              <>
                <MetaDot />
                <span>{sourceLabel(source)}</span>
              </>
            )}
          </>
        }
      />

      <div className={COLUMN}>
        <Card>
          <CardHeader
            title="This screen is not built yet"
            subtitle={
              entry && entry.endpoints > 0
                ? `${item.label} is switched on for ${tenant.name} and the API already serves it. This app does not read it yet.`
                : `${item.label} is switched on for ${tenant.name}. This app has no screen for it yet.`
            }
          />
          <CardBody className="space-y-4">
            {/* The registry's own sentence about this module. It used to sit
                under the title, which made the header three stacked lines
                where Sprig's is two — a title and a row of facts. Nothing is
                lost by moving it: the card exists to say what the module is
                and what is behind it, so the sentence leads it. */}
            {entry && <p className="text-sm text-gray-600">{entry.summary}</p>}

            <p className="text-sm text-gray-600">
              Nothing is hidden from you and nothing is broken. A few screens in this app are built
              against the API; every other item in the rail resolves here, and reports what the
              module is and what already exists behind it.
            </p>

            <ApiSurface moduleId={moduleId} entry={entry} />

            <Capabilities capabilities={capabilities} />
          </CardBody>
        </Card>

        <BuiltScreens />
      </div>
    </PageStack>
  )
}

/**
 * The endpoints that already exist for this module.
 *
 * Counted from the API's route table by the `EnsureModuleEnabled:<id>`
 * middleware, so every path named here is real and really gated on this
 * module. A count of zero is reported as precisely that — no route is
 * ADDRESSED to this id — and not as "the capability is missing", because for
 * several modules the work is served under a neighbour in the same domain.
 */
function ApiSurface({
  moduleId,
  entry,
}: {
  moduleId: string
  entry: ReturnType<typeof moduleCatalogEntry>
}) {
  if (!entry) {
    return (
      <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
        The module registry does not define <Mono>{moduleId}</Mono>, so there is nothing reliable to
        say about what it serves.
      </p>
    )
  }

  if (entry.endpoints === 0) {
    return (
      <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
        No route in the API is gated on <Mono>{moduleId}</Mono> yet. The module resolves and its
        permissions exist, but nothing is addressed to it directly — some of what it covers may be
        served under a neighbouring module in the same domain.
      </p>
    )
  }

  return (
    <PanelSection
      className="border-t border-gray-200 pt-4"
      title={`${entry.endpoints} ${entry.endpoints === 1 ? 'endpoint already exists' : 'endpoints already exist'}`}
      description={
        <>
          Each is gated on <Mono>{moduleId}</Mono> server-side. Building this screen is a matter of
          reading them.
        </>
      }
    >
      <ul className="mt-2.5 border-t border-gray-200">
        {entry.paths.map((path) => (
          <li
            key={path}
            className="border-b border-gray-200 py-1.5 font-mono text-xs text-gray-700"
          >
            <span className="text-gray-500">/rest/v1</span>
            {path}
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}

/**
 * What the module covers, as a list rather than as a wall of filled chips.
 *
 * A capability is not a status and not a chip — twenty grey pills read as
 * decoration and hide the two lines under them that actually differ. Sprig
 * writes this kind of inventory as a plain bulleted list, so this does.
 */
function Capabilities({
  capabilities,
}: {
  capabilities: { granted: string[]; denied: string[]; requiresApproval: string[] }
}) {
  const { granted, denied, requiresApproval } = capabilities

  if (granted.length === 0 && denied.length === 0 && requiresApproval.length === 0) {
    return null
  }

  return (
    <PanelSection
      className="border-t border-gray-200 pt-4"
      title="What the module covers"
      description="Resolved for this institution by GET /portal/context."
    >
      {granted.length > 0 && <CapabilityList capabilities={granted} />}

      {requiresApproval.length > 0 && (
        <CapabilityGroup label="Needs approval before use" capabilities={requiresApproval} />
      )}

      {denied.length > 0 && (
        <CapabilityGroup label="Switched off for this institution" capabilities={denied} />
      )}
    </PanelSection>
  )
}

function CapabilityList({ capabilities }: { capabilities: string[] }) {
  return (
    <ul className="mt-2 columns-2 gap-8 text-xs text-gray-700">
      {capabilities.map((capability) => (
        <li key={capability} className="mb-1 break-inside-avoid">
          {humanize(capability)}
        </li>
      ))}
    </ul>
  )
}

function CapabilityGroup({ label, capabilities }: { label: string; capabilities: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-900">{label}</p>
      <CapabilityList capabilities={capabilities} />
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-gray-900">{children}</span>
}

interface Destination {
  to: BuiltRoute
  label: string
  description: string
  icon: ReactNode
}

/**
 * Where to go instead.
 *
 * The two module screens are drawn from the navigation tree rather than
 * hard-coded, so a person who does not hold Students is never offered it —
 * an unbuilt screen that then recommends a forbidden one has helped nobody.
 * Account and settings are chrome rather than modules and everybody signed in
 * reaches them, so they are always listed.
 */
function BuiltScreens() {
  const { access } = useTenant()
  const t = useTerminology()

  const byModule = (moduleId: string): NavigationItem | null => {
    for (const section of access?.navigation.sections ?? []) {
      for (const item of section.children) {
        if (item.module_id === moduleId && item.route) return item
      }
    }
    return null
  }

  const dashboard = byModule('dashboard')
  const students = byModule('students')

  const destinations: Destination[] = []

  if (dashboard) {
    destinations.push({
      to: '/dashboard',
      label: dashboard.label,
      description: "This institution's figures for today and this month.",
      icon: <SquaresFour size={14} />,
    })
  }

  if (students) {
    destinations.push({
      to: '/students',
      label: students.label,
      description: `Every ${t('learner').toLowerCase()} on the roll, searchable and filterable.`,
      icon: <Student size={14} />,
    })
  }

  destinations.push(
    {
      to: '/account',
      label: 'Your account',
      description: 'Your name, contact details and photo.',
      icon: <UserCircle size={14} />,
    },
    {
      to: '/settings',
      label: 'Settings',
      description: 'Institution profile, branding and preferences.',
      icon: <Gear size={14} />,
    },
  )

  return (
    <Card>
      <CardHeader
        title="Screens that are built"
        subtitle="Drawn from your own navigation, so nothing here is a dead end."
      />
      <ul className="divide-y divide-gray-200">
        {destinations.map((destination) => (
          <li key={destination.to}>
            <Link
              to={destination.to}
              className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                {destination.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {destination.label}
                </span>
                <span className="block truncate text-xs text-gray-600">
                  {destination.description}
                </span>
              </span>
              <CaretRight size={13} className="shrink-0 text-gray-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ── The module exists here, but not for this person ──────────────────────── */

function NotHeld({ record }: { record: Module }) {
  const { tenant } = useTenant()
  const entry = moduleCatalogEntry(record.id)
  const domain = typeof record.domain === 'string' ? record.domain : null

  return (
    <PageStack>
      <PageHeader
        icon={
          <EntityIcon tone="neutral">
            <ModuleIcon name={record.id} size={16} />
          </EntityIcon>
        }
        title={record.name}
        meta={
          <>
            {domain && (
              <>
                <span>{humanize(domain)}</span>
                <MetaDot />
              </>
            )}
            <span className="font-mono text-2xs text-gray-500">{record.id}</span>
            <MetaDot />
            <DotFact on={false}>Not available to you</DotFact>
          </>
        }
      />

      <div className={COLUMN}>
        <Card>
          <CardHeader
            title="You do not have access to this module"
            subtitle={accessReason(record, tenant.name)}
          />
          <CardBody className="space-y-3">
            {/* Same move as the unbuilt screen: the registry's sentence comes
                out of the header, which is now a title and a row of facts, and
                leads the card instead. A reader told they cannot reach
                something is owed a line saying what it was. */}
            {entry && <p className="text-sm text-gray-600">{entry.summary}</p>}

            <p className="text-sm text-gray-600">
              This is not only a hidden menu item. The API refuses every request to{' '}
              <Mono>{record.id}</Mono> for this account, so there would be nothing behind the screen
              even if it were drawn. An administrator at {tenant.name} can change that.
            </p>
            <div className="pt-0.5">
              <LinkButton to="/dashboard" icon={<SquaresFour size={14} />}>
                Back to the dashboard
              </LinkButton>
            </div>
          </CardBody>
        </Card>
      </div>
    </PageStack>
  )
}

/**
 * Why, in one sentence.
 *
 * `source` is the API's own record of WHICH layer of the resolution chain
 * decided the module's fate. It is stamped onto every resolved module for
 * exactly this purpose, and repeating it turns "why can I not see this" into
 * an answer instead of a support ticket.
 */
function accessReason(record: Module, tenantName: string): string {
  switch (readSource(record)) {
    case 'denied':
      return `${tenantName} has ${record.name} switched off.`
    case 'tenant_override':
      return `${tenantName} has overridden the default and switched ${record.name} off.`
    case 'entitlement':
      return `${record.name} is not part of ${tenantName}'s subscription.`
    case 'user_permission':
      return `${tenantName} runs ${record.name}, but your access profile does not reach it.`
    case 'institution_default':
      return record.enabled
        ? `${record.name} is switched on for ${tenantName} but is not part of your navigation.`
        : `${record.name} is not switched on for ${tenantName}.`
    default:
      return `${record.name} is not part of your navigation at ${tenantName}.`
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'institution_default':
      return 'Institution default'
    case 'entitlement':
      return 'Subscription entitlement'
    case 'tenant_override':
      return 'Institution override'
    case 'user_permission':
      return 'User permission'
    case 'denied':
      return 'Denied'
    default:
      return humanize(source)
  }
}

/* ── Reading the parts of a module record the shared type leaves open ─────── */

/**
 * `Module` carries an index signature because the API's record is wider than
 * the client once needed. `capabilities` and `source` are two of the extra
 * fields — confirmed against `GET /portal/modules` — and they arrive typed as
 * `unknown`, so they are narrowed by inspection rather than by a cast. A cast
 * would compile against a response shape nobody had checked.
 */
function readCapabilities(record: Module | null): {
  granted: string[]
  denied: string[]
  requiresApproval: string[]
} {
  const empty = { granted: [], denied: [], requiresApproval: [] }
  if (!record || typeof record.capabilities !== 'object' || record.capabilities === null) {
    return empty
  }

  const bag = record.capabilities as Record<string, unknown>
  return {
    granted: stringList(bag.granted),
    denied: stringList(bag.denied),
    requiresApproval: stringList(bag.requires_approval),
  }
}

function readSource(record: Module | null): string | null {
  return record && typeof record.source === 'string' ? record.source : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/* ── The other two states ─────────────────────────────────────────────────── */

/** Sized like the page it precedes, so nothing jumps when the context lands. */
function ModuleSkeleton() {
  return (
    <PageStack>
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        {/* Two bars, because the header is now two lines: the title and the
            row of facts under it. A third bar here would leave the page
            settling by a line every time the context landed. */}
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>

      <div className={COLUMN}>
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Skeleton className="h-20 w-full" />
          </CardBody>
        </Card>
      </div>
    </PageStack>
  )
}

/**
 * The tenant resolved but `GET /portal/context` did not.
 *
 * Everything on this screen is read from that one response, so there is no
 * partial version of it to show. Says which request is missing rather than
 * "something went wrong", because the reader can act on the first and not the
 * second.
 */
function ContextUnavailable() {
  return (
    <EmptyState
      icon={<WarningCircle size={20} />}
      title="Your access could not be loaded"
      description="This screen resolves modules from GET /portal/context, and that request has not returned."
      action={<Button onClick={() => window.location.reload()}>Reload</Button>}
    />
  )
}
