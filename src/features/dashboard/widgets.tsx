import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { Card, CardBody, CardHeader, EmptyState, ErrorState, MetaDot, Skeleton } from '@/shared/ui'
import { ModuleIcon } from '@/shared/icons/moduleIcons'
import { cn } from '@/shared/lib/cn'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import type { NavigationItem } from '@/shared/types/navigation.types'
import type { TimetableSlot, TimetableView } from './dashboard.types'
import { firstName, greeting, slotTime, todayInTimeZone } from './dashboard.lib'

/* ── Identity ────────────────────────────────────────────────────────────── */

/** "Good afternoon, Coralie". The hour is read in the institution's timezone,
 *  not the browser's — a bursar checking the evening's takings from another
 *  country should still be greeted with their school's evening. */
export function useGreetingTitle(): string {
  const { account, tenant } = useTenant()
  return `${greeting(tenant.default_timezone)}, ${firstName(account?.name)}`
}

/** Today, as the institution reckons it. Stable for the whole day, so it is
 *  safe to put straight into a query key. */
export function useInstitutionToday(): string {
  const { tenant } = useTenant()
  return todayInTimeZone(tenant.default_timezone)
}

/**
 * Where the institution is in its year.
 *
 * Every figure on this screen is implicitly "this session, this period", and a
 * dashboard that does not say which one invites a reader to compare a term's
 * numbers against last term's without noticing.
 */
export function CalendarMeta() {
  const { branding, access } = useTenant()
  const t = useTerminology()
  const calendar = access?.calendar

  return (
    <>
      <span>{branding.institution_name}</span>
      {calendar?.session && (
        <>
          <MetaDot />
          <span>
            {t('session')} {calendar.session.name}
          </span>
        </>
      )}
      {calendar?.period && (
        <>
          <MetaDot />
          <span>{calendar.period.name}</span>
        </>
      )}
    </>
  )
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

/** The row of figures every one of the four dashboards opens with. Four across
 *  on a desktop, two on a tablet, one on a phone. */
export function TileRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
}

/** Two panels side by side, stacking below `lg`. */
export function PanelRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', className)}>{children}</div>
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

/**
 * A quiet line inside a card.
 *
 * Used where a panel has loaded successfully and has nothing to show. It is
 * deliberately not `EmptyState`: that draws an icon and a call to action and
 * belongs to a whole screen, whereas a flat month of collections is a fact
 * about the data and should read as one rather than as a failure.
 */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="px-1 py-6 text-center text-xs text-gray-600">{children}</p>
}

/**
 * A label above a figure, for a row of them across a card.
 *
 * `Figure` justifies its label and value to opposite edges, which is right in a
 * stacked list and wrong in a four-column row — there the gap grows with the
 * column and the label stops reading as belonging to the number beside it.
 */
export function MiniStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-gray-600">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 tabular">{value}</p>
    </div>
  )
}

/** A label and a figure on one line — the shape a fee breakdown wants. */
export function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: ReactNode
  value: ReactNode
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-600">{label}</span>
      <span
        className={cn(
          'shrink-0 tabular',
          emphasis ? 'text-sm font-semibold text-gray-900' : 'text-sm text-gray-900',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * A tile's figure and footnote, given whether the request behind it failed.
 *
 * `loading` goes false on failure as well as on success, so a tile written as
 * `formatNumber(data?.length ?? 0)` reports a failed request as a confident
 * zero: "Excuses to review — 0, nothing waiting on you" is a claim about
 * somebody's workload that a 500 gives nobody the standing to make. A figure
 * that did not load is a dash and says so; the panel below it carries the
 * retry, so the tile does not need one.
 */
export function tileFigure({
  isError,
  value,
  hint,
}: {
  isError: boolean
  value: ReactNode
  hint?: ReactNode
}): { value: ReactNode; hint: ReactNode } {
  if (isError) return { value: '—', hint: 'could not be loaded' }
  return { value, hint }
}

/**
 * A skeleton that may sit inside a paragraph.
 *
 * `Skeleton` renders a `<div>`, which React refuses to nest in the `<p>` a
 * `StatTile` label is drawn in. Same treatment, inline element.
 */
export function InlineSkeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block animate-pulse rounded bg-gray-100 align-middle', className)}
      aria-hidden
    />
  )
}

/** A card body's worth of skeleton, sized like the rows that are coming. */
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-200">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

/**
 * One card's four states, in the order they happen.
 *
 * Every panel on this screen needs the same branch, and writing it eleven
 * times is how one of them ends up rendering an error as an empty state.
 */
export function PanelState({
  isPending,
  error,
  isEmpty,
  onRetry,
  empty,
  skeleton,
  children,
}: {
  isPending: boolean
  error: unknown
  isEmpty: boolean
  onRetry?: () => void
  empty: ReactNode
  skeleton?: ReactNode
  children: ReactNode
}) {
  if (isPending) return <>{skeleton ?? <RowsSkeleton />}</>
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}

/* ── Navigation ──────────────────────────────────────────────────────────── */

/**
 * The module routes this app has built a real screen for.
 *
 * Everything else resolves through the catch-all `/$module`, which renders the
 * module's own scaffold rather than a 404 — the rail lists roughly sixty
 * modules and most do not have a bespoke screen yet.
 *
 * The split matters because addressing `/students` as `/$module` navigates
 * correctly but warns on every render: the router resolves the generated path
 * back to the static route and says so. Naming the template that will actually
 * match keeps the console clean and the intent explicit.
 */
const DEDICATED_ROUTES = {
  dashboard: '/dashboard',
  students: '/students',
  account: '/account',
  settings: '/settings',
  notifications: '/notifications',
  search: '/search',
  help: '/help',
} as const

/** A link to a module, addressed by the route segment the API gave us. */
export function ModuleLink({
  route,
  children,
  className,
}: {
  route: string
  children: ReactNode
  className?: string
}) {
  const dedicated = DEDICATED_ROUTES[route as keyof typeof DEDICATED_ROUTES]

  if (dedicated) {
    return (
      <Link to={dedicated} className={className}>
        {children}
      </Link>
    )
  }

  return (
    <Link to="/$module" params={{ module: route }} className={className}>
      {children}
    </Link>
  )
}

/**
 * The things this person does most.
 *
 * Built from `access.navigation.quick_actions`, which the API derives from the
 * modules they actually hold — so a bursar and a form tutor get different
 * tiles from the same component, and an institution that switches a module off
 * loses its tile without a deploy.
 */
export function QuickLinks({ items }: { items: NavigationItem[] }) {
  const actions = items.filter((item) => item.route !== null)
  if (actions.length === 0) return null

  return (
    <Card>
      <CardHeader title="Jump to" />
      {/* One line per destination, as Sprig lists its Resources — a bordered
          cell per link with a tinted glyph in it turns six shortcuts into six
          objects competing with the panels above them. */}
      <CardBody className="grid grid-cols-2 gap-x-4 gap-y-0.5 p-2 sm:grid-cols-3 xl:grid-cols-4">
        {actions.map((item) => (
          <ModuleLink
            key={item.key}
            route={item.route as string}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <ModuleIcon
              name={item.icon ?? item.key}
              size={15}
              className="shrink-0 text-gray-500"
            />
            <span className="truncate text-sm">{item.label}</span>
          </ModuleLink>
        ))}
      </CardBody>
    </Card>
  )
}

/** The "see everything" link a summary panel ends with. */
export function PanelLink({ route, label }: { route: string; label: string }) {
  return (
    <ModuleLink
      route={route}
      className="inline-flex items-center gap-1 text-xs font-medium text-accent-500 hover:text-accent-600 hover:underline"
    >
      {label}
      <ArrowRight size={12} />
    </ModuleLink>
  )
}

/* ── Timetable ───────────────────────────────────────────────────────────── */

/**
 * Today's lessons, for whoever the schedule is about.
 *
 * The same panel serves a teacher and a learner because the API resolves the
 * same shape for both — `subject_type` says which — and a day sheet that
 * looked different for each would be two components drifting apart.
 *
 * A cancelled slot is shown struck through rather than hidden: a lesson that
 * is not happening is information, and a reader who arrives at an empty room
 * was told nothing by its absence.
 */
export function TimetableToday({
  view,
  dateLabel,
  isPending,
  error,
  onRetry,
  emptyDescription,
}: {
  view: TimetableView | undefined
  dateLabel: string
  isPending: boolean
  error: unknown
  onRetry?: () => void
  emptyDescription: string
}) {
  const slots = view?.slots ?? []

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Today" subtitle={dateLabel} />
      <CardBody className="flex-1">
        <PanelState
          isPending={isPending}
          error={error}
          isEmpty={slots.length === 0}
          onRetry={onRetry}
          empty={
            <EmptyState
              className="py-8"
              title="Nothing scheduled today"
              description={emptyDescription}
            />
          }
        >
          <ol className="divide-y divide-gray-200">
            {slots.map((slot) => (
              <SlotRow key={slot.slot_id} slot={slot} />
            ))}
          </ol>
        </PanelState>
      </CardBody>
    </Card>
  )
}

function SlotRow({ slot }: { slot: TimetableSlot }) {
  return (
    <li className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      <span className="w-24 shrink-0 text-xs text-gray-600 tabular">
        {slotTime(slot.starts_at)} – {slotTime(slot.ends_at)}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm text-gray-900',
            slot.is_cancelled && 'text-gray-500 line-through',
          )}
        >
          {slot.course_title ?? 'Lesson'}
        </span>
        <span className="block truncate text-xs text-gray-600">
          {[slot.group_name, slot.teacher_name, slot.room_name].filter(Boolean).join(' · ') ||
            slot.exception_reason ||
            '—'}
        </span>
      </span>
    </li>
  )
}
