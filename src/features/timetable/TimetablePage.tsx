import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarBlank, CaretLeft, CaretRight, MapPin, Prohibit } from '@phosphor-icons/react'
import { Badge, Button, Card, EmptyState, ErrorState, Segmented, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import {
  DAY_NAMES,
  slotTime,
  timetableApi,
  timetableKeys,
  weekStart,
  type ScheduledSlot,
} from './timetable.api'

/**
 * The week.
 *
 * ── One screen for everybody, because the endpoint is one endpoint ─────────
 *
 * `/portal/timetable` resolves whose week to return from who is asking: a
 * teacher gets their teaching week, a student their own, a guardian their
 * child's. There is no surface switch here the way there is on Results or
 * Fees, because there is nothing to switch between — the server has already
 * decided, and `subject_type` says which answer it gave.
 *
 * A teacher who is also a parent gets their own teaching week by default and
 * their child's by asking. Ordered the other way round, a teaching parent could
 * not see their own timetable at all.
 *
 * ── A cancelled lesson is shown, not hidden ────────────────────────────────
 *
 * `is_cancelled` already accounts for an exception on the day asked about. A
 * class turning up to an empty room is what hiding it causes, so a cancelled
 * lesson keeps its place in the grid, struck through, with the reason on it.
 *
 * ── The day view is not a smaller week ─────────────────────────────────────
 *
 * On a phone a seven-column grid is unreadable at any font size that fits.
 * Below `lg` this shows one day at a time with the days as a strip — which is
 * also what somebody standing in a corridor actually wants.
 */
export function TimetablePage() {
  const t = useTerminology()

  return (
    <ModuleGate
      module="timetable"
      title="Timetable"
      description={`Where to be, and when.`}
      offTitle="This institution does not publish a timetable"
      offDescription="The timetable module is switched off here. An administrator can enable it from the institution's modules."
    >
      <Week terminology={t} />
    </ModuleGate>
  )
}

function Week({ terminology }: { terminology: (key: 'learner' | 'teacher') => string }) {
  const viewer = useViewer()

  /* The Monday of the week being looked at. Exceptions resolve against the
   * date, so this is a real parameter and not a client-side filter. */
  const [monday, setMonday] = useState(() => weekStart(new Date()))
  const [day, setDay] = useState(() => ((new Date().getDay() + 6) % 7) + 1)

  const params = useMemo(() => ({ on: monday }), [monday])

  const week = useQuery({
    queryKey: timetableKeys.mine(params),
    queryFn: () => timetableApi.mine(params),
  })

  function shift(weeks: number) {
    const base = new Date(`${monday}T00:00:00`)
    base.setDate(base.getDate() + weeks * 7)
    setMonday(weekStart(base))
  }

  if (week.isError) {
    return (
      <Card>
        <ErrorState error={week.error} onRetry={() => week.refetch()} />
      </Card>
    )
  }

  const view = week.data
  const slots = view?.slots ?? []

  /* Only the days that actually carry lessons. A school that never teaches on
   * Saturday should not be shown an empty Saturday column every week. */
  const days = useMemo(() => {
    const used = new Set(slots.map((slot) => slot.day_of_week))
    const taught = [1, 2, 3, 4, 5, 6, 7].filter((number) => used.has(number))

    return taught.length > 0 ? taught : [1, 2, 3, 4, 5]
  }, [slots])

  const byDay = useMemo(() => {
    const grouped = new Map<number, ScheduledSlot[]>()

    for (const slot of slots) {
      const list = grouped.get(slot.day_of_week) ?? []
      list.push(slot)
      grouped.set(slot.day_of_week, list)
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => slotTime(a.starts_at).localeCompare(slotTime(b.starts_at)))
    }

    return grouped
  }, [slots])

  return (
    <div className="flex flex-col gap-4">
      {/* ── Which week ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="icon" aria-label="Previous week" onClick={() => shift(-1)}>
            <CaretLeft size={15} />
          </Button>
          <Button size="icon" aria-label="Next week" onClick={() => shift(1)}>
            <CaretRight size={15} />
          </Button>
          <span className="ml-1 text-sm font-medium text-gray-900">
            Week of {formatDate(monday)}
          </span>
          {monday !== weekStart(new Date()) && (
            <Button size="sm" variant="ghost" onClick={() => setMonday(weekStart(new Date()))}>
              This week
            </Button>
          )}
        </div>

        {/* Whose week the server decided to answer with. Worth saying: a
          * teaching parent gets their own, and would otherwise wonder why they
          * are not looking at their child's. */}
        {view && view.subject_type !== 'none' && (
          <Badge tone="neutral">
            {view.subject_type === 'staff'
              ? `Your teaching week`
              : view.subject_type === 'student'
                ? viewer.isGuardian && !viewer.isStudent
                  ? `Your ${terminology('learner').toLowerCase()}'s week`
                  : 'Your week'
                : 'Class week'}
          </Badge>
        )}
      </div>

      {week.isLoading ? (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarBlank size={20} />}
            title="Nothing scheduled this week"
            description={
              view?.subject_type === 'none'
                ? 'This account has no timetable of its own yet — no student record, no staff record and no child linked to it.'
                : 'Try another week, or check back once the timetable for this term is published.'
            }
          />
        </Card>
      ) : (
        <>
          {/* ── The week, on a screen with room for it ──────────────── */}
          <div className="hidden lg:block">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            >
              {days.map((number) => (
                <div key={number} className="flex min-w-0 flex-col gap-2">
                  <p className="px-1 text-xs font-semibold text-gray-900">
                    {DAY_NAMES[number - 1]}
                  </p>
                  {(byDay.get(number) ?? []).map((slot) => (
                    <SlotCard key={slot.slot_id} slot={slot} />
                  ))}
                  {(byDay.get(number) ?? []).length === 0 && (
                    <p className="px-1 text-2xs text-gray-500">Nothing</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── One day at a time, on a phone ───────────────────────── */}
          <div className="flex flex-col gap-3 lg:hidden">
            <Segmented
              label="Which day"
              value={String(day)}
              onChange={(value) => setDay(Number(value))}
              options={days.map((number) => ({
                value: String(number),
                label: DAY_NAMES[number - 1].slice(0, 3),
                count: (byDay.get(number) ?? []).length,
              }))}
            />

            <div className="flex flex-col gap-2">
              {(byDay.get(day) ?? []).map((slot) => (
                <SlotCard key={slot.slot_id} slot={slot} />
              ))}
              {(byDay.get(day) ?? []).length === 0 && (
                <Card>
                  <p className="px-4 py-6 text-center text-xs text-gray-500">
                    Nothing on {DAY_NAMES[day - 1]}.
                  </p>
                </Card>
              )}
            </div>
          </div>

          <p className="text-2xs text-gray-500">
            {formatNumber(slots.length)} {slots.length === 1 ? 'lesson' : 'lessons'} this week
            {view?.timetable_name && ` · ${view.timetable_name}`}
          </p>
        </>
      )}
    </div>
  )
}

function SlotCard({ slot }: { slot: ScheduledSlot }) {
  return (
    <Card
      className={cn(
        'px-3 py-2.5',
        /* Kept in place and marked, never removed — see the file note. */
        slot.is_cancelled && 'border-dashed bg-gray-50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs text-gray-600 tabular">
          {slotTime(slot.starts_at)}–{slotTime(slot.ends_at)}
        </span>
        {slot.is_cancelled && (
          <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-danger-600">
            <Prohibit size={11} weight="bold" />
            Cancelled
          </span>
        )}
      </div>

      <p
        className={cn(
          'mt-0.5 truncate text-sm font-medium text-gray-900',
          slot.is_cancelled && 'line-through decoration-gray-400',
        )}
      >
        {/* A name where the server loaded one; never an id dressed up as a
          * label — see the note on ScheduledSlot. */}
        {slot.course_title ?? slot.group_name ?? 'Lesson'}
      </p>

      <p className="mt-0.5 truncate text-2xs text-gray-600">
        {[slot.teacher_name, slot.group_name === slot.course_title ? null : slot.group_name]
          .filter(Boolean)
          .join(' · ') || ' '}
      </p>

      {slot.room_name && (
        <p className="mt-1 inline-flex items-center gap-1 text-2xs text-gray-600">
          <MapPin size={11} />
          {slot.room_name}
        </p>
      )}

      {slot.is_cancelled && slot.exception_reason && (
        <p className="mt-1 text-2xs text-gray-600">{slot.exception_reason}</p>
      )}
    </Card>
  )
}
