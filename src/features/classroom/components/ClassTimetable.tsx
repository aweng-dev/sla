import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarBlank,
  MapPin,
  Printer,
  Prohibit,
  User,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button, Card, EmptyState, ErrorState, Segmented, Skeleton, Tooltip } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatNumber } from '@/shared/lib/format'
import { useModules, useTerminology } from '@/features/tenant/TenantProvider'
import {
  DAY_NAMES,
  slotTime,
  timetableApi,
  timetableKeys,
  type ScheduledSlot,
  type TimetablePeriod,
} from '@/features/timetable/timetable.api'
import { classroomApi, classroomKeys } from '../classroom.api'

/**
 * The class's own week, drawn as the grid it is printed as.
 *
 * ── Why a grid and not a list per day ──────────────────────────────────────
 *
 * A timetable is read across as often as down. "Where am I at nine on
 * Thursday" and "when do we do maths" are the same lookup in a grid and two
 * different searches in five stacked lists. Every school timetable that has
 * ever been pinned to a wall is period-down, day-across, and the reason is
 * that a shared time axis is what makes a free period visible: an empty cell
 * is information, and a list simply has one fewer card.
 *
 * ── Where the rows come from ───────────────────────────────────────────────
 *
 * From the slots themselves — their distinct start times, in order. That is
 * the one derivation that always works, because this endpoint is under
 * `module:learning_groups` and not `module:timetable`: an institution that
 * never bought the builder still has slots, and must still get its grid.
 *
 * When the timetable module IS available the bell schedule is fetched and the
 * rows are named by it ("Period 3", "Lunch"), which also brings in the rows
 * where nothing is taught. That query is an enrichment and never an error —
 * if it fails or is forbidden, the grid falls back to bare times rather than
 * blanking.
 *
 * ── It is not gated on the timetable module ────────────────────────────────
 *
 * Same reason as the endpoint: this is the class answering "what am I taught,
 * and when", which is the question the subject list answers with a clock.
 *
 * ── Cancelled lessons stay ─────────────────────────────────────────────────
 *
 * The endpoint includes them and so does this. A class turning up to a room
 * nobody booked is what hiding them causes.
 */

/* ── Colour ─────────────────────────────────────────────────────────────────
 *
 * A timetable is scanned, not read, and the thing being scanned for is a
 * subject. So each subject gets a stable tint derived from its own id — the
 * same maths lesson is the same colour in every cell, every week, without the
 * API carrying a colour. Pairs come from Sprig's categorical set (never green,
 * never red: those two mean cancelled and clashing here). */
const TINTS = [
  'bg-accent-50 border-accent-200 text-accent-900',
  'bg-brand-50 border-brand-200 text-brand-900',
  'bg-teal-50 border-teal-200 text-teal-900',
  'bg-magenta-50 border-magenta-200 text-magenta-900',
  'bg-coral-50 border-coral-200 text-coral-900',
  'bg-gray-100 border-gray-300 text-gray-900',
] as const

function tintFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0

  return TINTS[Math.abs(hash) % TINTS.length]
}

/** What a cell is keyed and coloured by. Falls back through the ids the API
 *  may or may not have filled, so an unnamed lesson still keeps one colour. */
function subjectKey(slot: ScheduledSlot): string {
  return slot.course_offering_id ?? slot.course_title ?? slot.slot_id
}

/** "09:00" → minutes, so overlaps can be compared as numbers. */
function minutes(value: string): number {
  const [h, m] = slotTime(value).split(':')
  return Number(h) * 60 + Number(m)
}

interface Row {
  key: string
  /** "Period 3" or "Lunch" when the bell schedule is known, else null. */
  name: string | null
  starts_at: string
  ends_at: string
  is_teaching: boolean
}

export function ClassTimetable({ groupId, groupName }: { groupId: string; groupName?: string }) {
  const t = useTerminology()
  const { has } = useModules()
  const [dense, setDense] = useState<'comfortable' | 'compact'>('comfortable')

  const week = useQuery({
    queryKey: classroomKeys.timetable(groupId),
    queryFn: () => classroomApi.timetable(groupId),
  })

  const slots = useMemo(() => week.data ?? [], [week.data])

  /* Every slot on a class belongs to the same timetable in practice, but the
   * query is keyed on whichever one the slots actually name rather than on an
   * assumption. */
  const timetableId = slots[0]?.timetable_id ?? null

  const bells = useQuery({
    queryKey: timetableKeys.timetable(timetableId ?? ''),
    queryFn: () => timetableApi.timetable(timetableId as string),
    enabled: timetableId !== null && has('timetable'),
    /* An enrichment. A reader who cannot see the builder still gets the grid,
     * so a refused fetch must not retry noisily or surface as an error. */
    retry: false,
    staleTime: 5 * 60_000,
  })

  const periods: TimetablePeriod[] = useMemo(
    () => (bells.data?.periods ?? []).slice().sort((a, b) => a.sequence - b.sequence),
    [bells.data],
  )

  /* ── The two axes ──────────────────────────────────────────────────────── */

  const days = useMemo(() => {
    const used = new Set(slots.map((slot) => slot.day_of_week))
    /* Monday to Friday is the frame even when a day is empty — a free
     * Wednesday is a fact about the week, not a column to drop. The weekend
     * appears only if something is taught on it. */
    const weekend = [6, 7].filter((number) => used.has(number))

    return [1, 2, 3, 4, 5, ...weekend]
  }, [slots])

  /**
   * Rows and cells resolved together, because the assignment decides both.
   *
   * A slot that matches no row must never be dropped — a lesson vanishing off
   * a timetable is the one failure nobody catches, since the grid still looks
   * complete. So orphans mint their own row and the week grows a line rather
   * than losing a lesson.
   */
  const { rows, cells } = useMemo(() => {
    const base: Row[] = periods.map((period) => ({
      key: period.id,
      name: period.name,
      starts_at: period.starts_at,
      ends_at: period.ends_at,
      is_teaching: period.is_teaching,
    }))

    const rowFor = (slot: ScheduledSlot): Row | undefined => {
      if (slot.timetable_period_id !== null) {
        const named = base.find((row) => row.key === slot.timetable_period_id)
        if (named) return named
      }

      const start = minutes(slot.starts_at)

      return base.find((row) => start >= minutes(row.starts_at) && start < minutes(row.ends_at))
    }

    /* Anything the bell schedule does not account for — and, when there is no
     * bell schedule at all, every slot — becomes a row keyed on its own start
     * time. A double lesson therefore sits on the row it begins in and states
     * its own end, rather than inventing a row nothing else occupies. */
    const derived = new Map<string, Row>()

    for (const slot of slots) {
      if (rowFor(slot) !== undefined) continue

      const start = slotTime(slot.starts_at)
      const existing = derived.get(start)

      if (existing === undefined) {
        derived.set(start, {
          key: `t:${start}`,
          name: null,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          is_teaching: true,
        })
        continue
      }

      /* The row's band is the shortest lesson in it, so a double reads as
       * overrunning rather than every single reading as short. */
      if (minutes(slot.ends_at) < minutes(existing.ends_at)) existing.ends_at = slot.ends_at
    }

    const all = [...base, ...derived.values()].sort(
      (a, b) => minutes(a.starts_at) - minutes(b.starts_at),
    )

    const placed = new Map<string, ScheduledSlot[]>()

    for (const slot of slots) {
      const row = rowFor(slot) ?? derived.get(slotTime(slot.starts_at))
      if (row === undefined) continue

      const id = `${row.key}:${slot.day_of_week}`
      const list = placed.get(id) ?? []
      list.push(slot)
      placed.set(id, list)
    }

    for (const list of placed.values()) {
      list.sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at))
    }

    return { rows: all, cells: placed }
  }, [periods, slots])

  /* ── Clashes ───────────────────────────────────────────────────────────────
   *
   * A class cannot be in two rooms at once, so two live lessons that overlap
   * in time on the same day is a mistake somebody has to fix — and the only
   * place it is visible is the class's own week, because each lesson is
   * individually fine on the subject's. Computed here rather than asked for:
   * the conflicts endpoint is behind the timetable module, and a class whose
   * institution never bought the builder is exactly the one likeliest to have
   * had its week typed in by hand. Cancelled lessons never clash — a lesson
   * that is not happening cannot double-book anybody. */
  const clashing = useMemo(() => {
    const flagged = new Set<string>()

    for (const day of days) {
      const live = slots
        .filter((slot) => slot.day_of_week === day && !slot.is_cancelled)
        .sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at))

      for (let i = 1; i < live.length; i += 1) {
        const previous = live[i - 1]
        const current = live[i]

        if (minutes(current.starts_at) < minutes(previous.ends_at)) {
          flagged.add(previous.slot_id)
          flagged.add(current.slot_id)
        }
      }
    }

    return flagged
  }, [days, slots])

  /* ── The legend, which is also the week's shape ─────────────────────────── */

  const subjects = useMemo(() => {
    const counted = new Map<string, { title: string; count: number; key: string }>()

    for (const slot of slots) {
      if (slot.is_cancelled) continue

      const key = subjectKey(slot)
      const existing = counted.get(key)

      if (existing) existing.count += 1
      else counted.set(key, { key, title: slot.course_title ?? 'Lesson', count: 1 })
    }

    return [...counted.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
  }, [slots])

  const today = ((new Date().getDay() + 6) % 7) + 1
  const live = slots.filter((slot) => !slot.is_cancelled).length

  if (week.isError) {
    return (
      <Card>
        <ErrorState error={week.error} onRetry={() => week.refetch()} />
      </Card>
    )
  }

  if (week.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-64 w-full" />
      </Card>
    )
  }

  if (slots.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarBlank size={20} />}
          title="Nothing scheduled"
          description={`Lessons appear here once this ${t('group').toLowerCase()}'s ${t('courses').toLowerCase()} have slots on a published timetable.`}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The toolbar sits on the canvas, not in the card — Sprig keeps controls
          outside the surface they act on. It leaves the page when printed. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        <p className="text-2xs text-gray-600">
          {formatNumber(live)} {live === 1 ? 'lesson' : 'lessons'} a week
          {bells.data?.name ? ` · ${bells.data.name}` : ''}
        </p>

        {clashing.size > 0 && (
          <span className="inline-flex items-center gap-1 rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-2xs font-medium text-danger-700">
            <WarningCircle size={11} weight="fill" />
            {formatNumber(clashing.size)} clashing
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Segmented
            label="Grid density"
            value={dense}
            onChange={(value) => setDense(value as 'comfortable' | 'compact')}
            options={[
              { value: 'comfortable', label: 'Roomy' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
          <Button
            variant="secondary"
            icon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      {/* Only shown on paper. A timetable comes off the printer and goes on a
          wall, where nothing else says whose week it is. */}
      <div className="hidden print:block">
        <h2 className="text-base font-semibold text-gray-900">{groupName ?? 'Timetable'}</h2>
        <p className="text-2xs text-gray-600">
          {bells.data?.name ?? ''} {formatNumber(live)} lessons a week
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left print:min-w-0">
            <thead>
              <tr>
                {/* Sticky, so the time a cell belongs to survives scrolling
                    sideways — the same rule as the attendance sheet. */}
                <th className="sticky left-0 z-10 w-24 border-b border-gray-200 bg-white px-3 py-2 text-2xs font-medium text-gray-500">
                  Time
                </th>
                {days.map((number) => (
                  <th
                    key={number}
                    scope="col"
                    className={cn(
                      'border-b border-l border-gray-200 px-3 py-2 text-xs font-semibold',
                      number === today ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    )}
                  >
                    <span className="hidden lg:inline">{DAY_NAMES[number - 1]}</span>
                    <span className="lg:hidden">{DAY_NAMES[number - 1].slice(0, 3)}</span>
                    {number === today && (
                      <span className="ml-1.5 text-2xs font-medium text-gray-500 print:hidden">
                        today
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={cn(!row.is_teaching && 'bg-gray-50')}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-gray-200 bg-white px-3 py-1.5 align-top font-normal"
                  >
                    {row.name && (
                      <span className="block truncate text-2xs font-medium text-gray-900">
                        {row.name}
                      </span>
                    )}
                    <span className="block text-2xs text-gray-500 tabular">
                      {slotTime(row.starts_at)}–{slotTime(row.ends_at)}
                    </span>
                  </th>

                  {days.map((number) => {
                    const here = cells.get(`${row.key}:${number}`) ?? []

                    return (
                      <td
                        key={number}
                        className={cn(
                          'border-b border-l border-gray-200 align-top',
                          dense === 'compact' ? 'p-1' : 'p-1.5',
                          number === today && 'bg-gray-50/70',
                        )}
                      >
                        {here.length === 0 ? (
                          /* A non-teaching row is blank by design; a teaching
                             one that is empty is a free period, and saying so
                             is the whole reason for the shared time axis. */
                          row.is_teaching ? (
                            <span className="block px-1 py-1.5 text-2xs text-gray-400">Free</span>
                          ) : null
                        ) : (
                          <div className="flex flex-col gap-1">
                            {here.map((slot) => (
                              <SlotCell
                                key={slot.slot_id}
                                slot={slot}
                                row={row}
                                dense={dense === 'compact'}
                                clashes={clashing.has(slot.slot_id)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* The key is also the answer to "how much maths do we get" — a legend
          that carries data rather than one that only decodes colours. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {subjects.map((subject) => (
          <span key={subject.key} className="inline-flex items-center gap-1.5 text-2xs text-gray-700">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-sm border [print-color-adjust:exact]',
                tintFor(subject.key),
              )}
            />
            <span className="truncate">{subject.title}</span>
            <span className="text-gray-500 tabular">×{subject.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * One lesson in one cell.
 *
 * Cancelled and clashing are drawn differently on purpose: a cancelled lesson
 * recedes because nothing needs doing about it, and a clashing one is ringed
 * because somebody has to fix it. They are the only two states allowed to
 * override the subject's own colour, which is why the palette's green and red
 * are reserved out of the tint set.
 */
function SlotCell({
  slot,
  row,
  dense,
  clashes,
}: {
  slot: ScheduledSlot
  row: Row
  dense: boolean
  clashes: boolean
}) {
  /* Only worth the line when it disagrees with the row — a double lesson, or
   * something scheduled off the bell. Repeating the row's own band in every
   * cell is noise. */
  const offBand =
    slotTime(slot.starts_at) !== slotTime(row.starts_at) ||
    slotTime(slot.ends_at) !== slotTime(row.ends_at)

  const body = (
    <div
      className={cn(
        'w-full min-w-0 rounded border [print-color-adjust:exact]',
        dense ? 'px-1.5 py-1' : 'px-2 py-1.5',
        slot.is_cancelled
          ? 'border-dashed border-gray-300 bg-gray-50 text-gray-500'
          : tintFor(subjectKey(slot)),
        clashes && 'ring-1 ring-danger-400',
      )}
    >
      <p
        className={cn(
          'truncate text-xs font-medium',
          slot.is_cancelled && 'line-through decoration-gray-400',
        )}
      >
        {slot.course_title ?? 'Lesson'}
      </p>

      {offBand && (
        <p className="truncate text-2xs opacity-70 tabular">
          {slotTime(slot.starts_at)}–{slotTime(slot.ends_at)}
        </p>
      )}

      {!dense && slot.teacher_name && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-2xs opacity-80">
          <User size={10} weight="bold" className="shrink-0" />
          <span className="truncate">{slot.teacher_name}</span>
        </p>
      )}

      {!dense && slot.room_name && (
        <p className="flex items-center gap-1 truncate text-2xs opacity-80">
          <MapPin size={10} weight="bold" className="shrink-0" />
          <span className="truncate">{slot.room_name}</span>
        </p>
      )}

      {(slot.is_cancelled || clashes) && (
        <p className="mt-0.5 flex items-center gap-1 text-2xs font-medium">
          {slot.is_cancelled ? (
            <>
              <Prohibit size={10} weight="bold" className="shrink-0" />
              Cancelled
            </>
          ) : (
            <span className="flex items-center gap-1 text-danger-700">
              <WarningCircle size={10} weight="fill" className="shrink-0" />
              Clashes
            </span>
          )}
        </p>
      )}
    </div>
  )

  /* Compact hides the teacher and room, so the tooltip has to carry them —
   * density may cost space, never facts. */
  const detail = [
    `${slotTime(slot.starts_at)}–${slotTime(slot.ends_at)}`,
    slot.teacher_name,
    slot.room_name,
    slot.exception_reason,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip side="top" content={detail} className="w-full">
      {body}
    </Tooltip>
  )
}
