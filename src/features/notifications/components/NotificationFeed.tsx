import { Link } from '@tanstack/react-router'
import {
  Bell,
  BellSlash,
  ChatsCircle,
  ClipboardText,
  Exam,
  Megaphone,
  Receipt,
  type Icon,
} from '@phosphor-icons/react'
import { Button, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatDayHeading, formatTime, humanize } from '@/shared/lib/format'
import { CATEGORY_LABELS, type NotificationRow } from '../notifications.api'

/**
 * One person's inbox, laid out as Sprig's Activity feed.
 *
 * ── The anatomy, taken from Sprig's Home / Activity page ───────────────────
 *
 * Rows carry NO divider between them. Sprig's activity list is a flat run of
 * one-line rows on white, grouped under a centred rule that names the day —
 * hairline, "Today", hairline — and the rule is the only horizontal line in the
 * whole list. Fifty rows separated by fifty hairlines is a table pretending to
 * be a feed; the day rule divides it where the division means something, and
 * the rows themselves are held together by rhythm instead.
 *
 * Each row is ONE line, as Sprig's is: a small square icon tile, then the
 * sentence, then the time hard right. Sprig writes that sentence as grey lead-in
 * plus a bold entity ("Alex Smith launched **Feature Discovery**"); an inbox is
 * scanned by its titles rather than its verbs, so the emphasis is flipped — the
 * title carries the weight and the body trails after it in grey, both inside one
 * truncating line so a long body can never push the time off the row.
 *
 * ── Why the day rule earns the time back ───────────────────────────────────
 *
 * "2 hours ago" against "3 days ago" against "last month" is a ragged column
 * you have to read word by word. Once the divider has stated the date, the row
 * only owes you the time inside it — so the right edge becomes a tidy tabular
 * 14:32 column that the eye can skip down, and nothing repeats the date fifty
 * times.
 *
 * ── The dot is still the only mark of unread ───────────────────────────────
 *
 * Unread is a dot and a heavier title, and that is all. An accent tile and an
 * accent "Unread" caption beside it were three signals for one fact, and the
 * colour stopped meaning anything by the third row.
 *
 * ── Where a row goes when you click it ─────────────────────────────────────
 *
 * `action_url` is an API path (`/portal/announcements/{id}`) and is deliberately
 * never navigated to — routing the browser at the JSON endpoint would sign the
 * reader out of the SPA into a 401 page. The destination is derived from
 * `context_type` instead, which is a morph alias the API enforces, and only for
 * the aliases this app actually has a screen for. Everything else marks itself
 * read and stays put, which is honest: a link that lands on a scaffold is worse
 * than no link.
 */

const CATEGORY_ICONS: Record<string, Icon> = {
  results: Exam,
  attendance: ClipboardText,
  finance: Receipt,
  announcements: Megaphone,
  messages: ChatsCircle,
}

function categoryIcon(category: string): Icon {
  return CATEGORY_ICONS[category] ?? Bell
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category)
}

/** Long bodies are cut here rather than clamped in CSS alone, so the row keeps
 *  its height whether or not the browser honours the clamp. */
function excerpt(body: string, limit = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat
}

interface DayGroup {
  key: string
  heading: string
  rows: NotificationRow[]
}

/** A local calendar day. Deliberately built from the local parts rather than
 *  the ISO prefix: a stamp at 23:40 +01:00 is a different UTC day from the one
 *  the reader spent it in, and the divider has to agree with their clock. */
function dayKey(value: string | null): string {
  if (!value) return 'undated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'undated'
  return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`
}

/**
 * Consecutive runs, not a map keyed by day.
 *
 * The feed arrives newest-first, so runs and buckets agree — but if the order
 * ever changed, runs would show the same date twice while a map would silently
 * reorder the reader's inbox. Repeating a heading is a visible oddity; moving
 * somebody's notifications is not.
 */
function groupByDay(rows: NotificationRow[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const row of rows) {
    const key = dayKey(row.created_at)
    const last = groups[groups.length - 1]

    if (last && last.key === key) last.rows.push(row)
    else groups.push({ key, heading: formatDayHeading(row.created_at), rows: [row] })
  }

  return groups
}

export function NotificationFeed({
  rows,
  loading,
  error,
  onRetry,
  onMarkRead,
  onOpenAnnouncements,
  unreadOnly,
  onClearFilters,
  filtered,
  onOpenPreferences,
  learnersLabel,
}: {
  rows: NotificationRow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  onMarkRead: (row: NotificationRow) => void
  onOpenAnnouncements: () => void
  onOpenPreferences: () => void
  unreadOnly: boolean
  /** Whether any filter is narrowing the list — the difference between "you
   *  have no notifications" and "none match this filter". */
  filtered: boolean
  onClearFilters: () => void
  learnersLabel: string
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />

  if (loading) return <FeedSkeleton />

  if (rows.length === 0) {
    /*
     * Two different nothings. A filter that matched nothing is offered its own
     * way out; an inbox that has never received anything is told what would
     * arrive here and given one thing to do, because "No data" leaves a new
     * administrator with no idea whether the feature is broken or simply quiet.
     */
    if (filtered) {
      return (
        <EmptyState
          icon={<BellSlash size={20} />}
          title={unreadOnly ? 'Nothing unread' : 'Nothing matches this filter'}
          description={
            unreadOnly
              ? 'Everything sent to you has been read.'
              : 'No notification in this category has been sent to you.'
          }
          action={<Button onClick={onClearFilters}>Show everything</Button>}
        />
      )
    }

    return (
      <EmptyState
        icon={<Bell size={20} />}
        title="Nothing has been sent to you yet"
        description={`This fills up on its own — ${learnersLabel.toLowerCase()} results, attendance, fees, messages and announcements you were in the audience for.`}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button variant="primary" onClick={onOpenAnnouncements}>
              Read announcements
            </Button>
            <p className="text-xs text-gray-600">
              Or{' '}
              <button
                type="button"
                onClick={onOpenPreferences}
                className="text-accent-500 underline-offset-2 hover:underline"
              >
                choose what you are told about
              </button>
              .
            </p>
          </div>
        }
      />
    )
  }

  return (
    <div className="px-2 pb-2">
      {groupByDay(rows).map((group, index) => (
        <div key={group.key}>
          <DayRule label={group.heading} first={index === 0} />

          <ul>
            {group.rows.map((row) => (
              <li key={row.id}>
                <NotificationLine
                  row={row}
                  onMarkRead={onMarkRead}
                  onOpenAnnouncements={onOpenAnnouncements}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Hairline, day, hairline — the one horizontal line the list draws. */
function DayRule({ label, first }: { label: string; first?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-2 pb-1.5', first ? 'pt-2.5' : 'pt-5')}>
      <span className="h-px flex-1 bg-gray-200" aria-hidden />
      <span className="shrink-0 text-2xs text-gray-500">{label}</span>
      <span className="h-px flex-1 bg-gray-200" aria-hidden />
    </div>
  )
}

function NotificationLine({
  row,
  onMarkRead,
  onOpenAnnouncements,
}: {
  row: NotificationRow
  onMarkRead: (row: NotificationRow) => void
  onOpenAnnouncements: () => void
}) {
  const interactive = cn(
    'block w-full rounded-md px-2 py-1.5 text-left transition-colors',
    'hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
  )

  function acknowledge() {
    if (!row.is_read) onMarkRead(row)
  }

  /* A learner record is the one context this app has a real detail screen for. */
  if (row.context_type === 'student_profile' && row.context_id) {
    return (
      <Link
        to="/students/$studentId"
        params={{ studentId: row.context_id }}
        onClick={acknowledge}
        className={interactive}
      >
        <LineBody row={row} />
      </Link>
    )
  }

  if (row.context_type === 'announcement') {
    return (
      <button
        type="button"
        onClick={() => {
          acknowledge()
          onOpenAnnouncements()
        }}
        className={interactive}
      >
        <LineBody row={row} />
      </button>
    )
  }

  if (!row.is_read) {
    return (
      <button type="button" onClick={acknowledge} className={interactive}>
        <LineBody row={row} />
      </button>
    )
  }

  return (
    <div className="px-2 py-1.5">
      <LineBody row={row} />
    </div>
  )
}

function LineBody({ row }: { row: NotificationRow }) {
  const CategoryIcon = categoryIcon(row.category)

  return (
    <span className="flex items-center gap-2.5">
      {/* The column is always drawn, so a read row lines up with an unread one. */}
      <span className="flex w-1.5 shrink-0 justify-center" aria-hidden>
        {!row.is_read && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
      </span>

      {/* The tile IS the category now that the row is one line, so the label it
       *  replaces is kept for anybody who cannot see the glyph. */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
        <CategoryIcon size={14} aria-hidden />
        <span className="sr-only">{categoryLabel(row.category)}</span>
      </span>

      <span className="min-w-0 flex-1 truncate text-xs">
        <span className={cn(row.is_read ? 'text-gray-800' : 'font-semibold text-gray-900')}>
          {row.title}
        </span>
        {row.body && (
          <>
            <span className="px-1 text-gray-400" aria-hidden>
              ·
            </span>
            <span className="text-gray-600">{excerpt(row.body)}</span>
          </>
        )}
      </span>

      <time
        dateTime={row.created_at ?? undefined}
        className="shrink-0 whitespace-nowrap text-2xs text-gray-500 tabular"
      >
        {formatTime(row.created_at)}
      </time>
    </span>
  )
}

/** Shaped like the real list — one day rule, then rows — so nothing jumps when
 *  the feed lands. */
function FeedSkeleton() {
  return (
    <div className="px-2 pb-2" aria-hidden>
      <div className="flex items-center gap-3 px-2 pb-1.5 pt-2.5">
        <span className="h-px flex-1 bg-gray-200" />
        <Skeleton className="h-2.5 w-10" />
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {['w-2/3', 'w-1/2', 'w-4/5', 'w-3/5', 'w-2/5'].map((width, index) => (
        <div key={index} className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="w-1.5 shrink-0" />
          <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className={cn('h-3', width)} />
          </div>
          <Skeleton className="h-3 w-8 shrink-0" />
        </div>
      ))}
    </div>
  )
}
