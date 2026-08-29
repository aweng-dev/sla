import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ClipboardText, DotsThree, UserMinus, UserPlus, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Menu,
  Pagination,
  SearchInput,
  Segmented,
  Skeleton,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTerminology } from '@/features/tenant/TenantProvider'
import type { LearningGroupMember } from '@/features/academics/academics.types'
import { CLASS_PAGE_SIZE, classroomApi, classroomKeys } from '../classroom.api'
import {
  ATTENDANCE_STATUSES,
  CYCLE,
  attendanceApi,
  attendanceKeys,
  type AttendanceStatus,
  type MarkInput,
} from '../attendance.api'
import { EnrolLearnerDialog } from './EnrolLearnerDialog'

/**
 * The roll — and, when a register is open, the register.
 *
 * ── The innovation, and it is not decoration ───────────────────────────────
 *
 * Taking a register is not a different screen. Press "Take register" and this
 * list becomes the marking surface: every name gains a status control, a bar
 * appears at the foot with "Everyone present" and "Save register", and nothing
 * moves. A teacher marking a class is looking at the class — sending them to a
 * separate page means finding the class again, and losing their place in it.
 *
 * That is ClassDojo's pattern, and it is right for the same reason there: the
 * roster IS the register, so it should not be re-drawn as one.
 *
 * ── One save, not thirty ───────────────────────────────────────────────────
 *
 * Marks are held locally and written with `records/bulk`. Thirty separate
 * requests is thirty chances for half of them to land, and a half-saved
 * register is worse than an unsaved one because nothing on screen says which
 * half.
 *
 * ── "Everyone present" is the server's ─────────────────────────────────────
 *
 * `mark-remaining-present` decides who is remaining against the roll the SERVER
 * holds, not the page this screen drew. A learner added by the office while the
 * register was open is then marked too, which a client-side loop would miss.
 *
 * ── Recording and closing are two decisions ────────────────────────────────
 *
 * Saving keeps the register open; finalising closes it. A teacher marks through
 * a lesson and closes at the end, and the API keeps them apart — so a save is
 * never quietly a close.
 */
export function ClassRoster({
  groupId,
  canManage,
  canTakeRegister,
  academicSessionId,
}: {
  groupId: string
  canManage: boolean
  canTakeRegister: boolean
  academicSessionId: string | null
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [page, setPage] = useState(1)
  const [enrolling, setEnrolling] = useState(false)

  /* Register state. `sessionId` null means no register is open on this screen. */
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})

  /*
   * Which day is being marked.
   *
   * Today by default, because that is the overwhelming case — but a register
   * missed on Tuesday still has to be taken, and a teacher back at their desk
   * on Thursday should not have to ask the office to do it. The endpoint takes
   * any date and resumes whatever is already there for it.
   */
  const [onDate, setOnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const today = new Date().toISOString().slice(0, 10)

  const query = useMemo(
    () => ({ search, include_past: scope === 'all', page, per_page: CLASS_PAGE_SIZE }),
    [search, scope, page],
  )

  const members = useQuery({
    queryKey: classroomKeys.members(groupId, query),
    queryFn: () => classroomApi.members(groupId, query),
    placeholderData: (previous) => previous,
  })

  const session = useQuery({
    queryKey: attendanceKeys.session(sessionId ?? 'none'),
    queryFn: () => attendanceApi.session(sessionId!),
    enabled: sessionId !== null,
  })

  const rows = members.data?.rows ?? []

  /*
   * The size of the ROLL, not of the page.
   *
   * Once the list pages at ten, counting the rows on screen would report "12 of
   * 10 marked" the moment somebody marked more than one page — and the segmented
   * badge would say a class of twenty-eight has ten in it. The pagination meta
   * is the only number that means the whole class.
   */
  const rollTotal = members.data?.pagination.total ?? 0

  const open = useMutation({
    mutationFn: () =>
      attendanceApi.openSession({
        learning_group_id: groupId,
        academic_session_id: academicSessionId ?? undefined,
        session_date: onDate,
      }),
    onSuccess: (opened) => {
      setSessionId(opened.id)

      /* Seeded from whatever is already recorded, so an interrupted register
       * resumes at the tenth name rather than starting again. */
      const existing: Record<string, AttendanceStatus> = {}
      for (const record of opened.records ?? []) existing[record.student_id] = record.status
      setMarks(existing)

      toast.success(
        (opened.records ?? []).length > 0
          ? `Continuing the register already started for ${formatDate(opened.session_date)}.`
          : `Register open for ${formatDate(opened.session_date)}. Mark the class, then save.`,
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That register could not be opened.',
      )
    },
  })

  const save = useMutation({
    mutationFn: () => {
      const records: MarkInput[] = Object.entries(marks).map(([student_id, status]) => ({
        student_id,
        status,
      }))

      return attendanceApi.markMany(sessionId!, records)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.session(sessionId!) })
      queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
      toast.success('Register saved. It stays open until you close it.')
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That register was not saved.',
      )
    },
  })

  const allPresent = useMutation({
    mutationFn: () => attendanceApi.markRemainingPresent(sessionId!),
    onSuccess: (fresh) => {
      const next: Record<string, AttendanceStatus> = {}
      for (const record of fresh.records ?? []) next[record.student_id] = record.status
      setMarks(next)
      queryClient.invalidateQueries({ queryKey: attendanceKeys.session(sessionId!) })
      toast.success('Everyone not already marked is down as present.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const finalise = useMutation({
    mutationFn: async () => {
      /* Save first: a teacher who marks the last name and presses Close must
       * not lose it to a close that raced the write. */
      if (Object.keys(marks).length > 0) {
        await attendanceApi.markMany(sessionId!, Object.entries(marks).map(([student_id, status]) => ({ student_id, status })))
      }
      return attendanceApi.finalise(sessionId!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
      setSessionId(null)
      setMarks({})
      toast.success('Register closed.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be closed.')
    },
  })

  const remove = useMutation({
    mutationFn: (member: LearningGroupMember) =>
      classroomApi.removeMember(groupId, member.student_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
      toast.success('Taken off the roll.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const marking = sessionId !== null
  const markedCount = Object.keys(marks).length
  const finalised = session.data?.is_finalised ?? false

  function cycle(studentId: string) {
    const current = marks[studentId]
    const index = current ? CYCLE.indexOf(current) : -1
    const next = CYCLE[(index + 1) % CYCLE.length]
    setMarks((all) => ({ ...all, [studentId]: next }))
  }

  if (members.isError) {
    return (
      <Card>
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      </Card>
    )
  }

  return (
    <>
      {/*
        * The controls sit above the card, on the canvas — Sprig puts its
        * "Received within / Filters" row there rather than inside the panel's
        * border. A toolbar boxed inside the card reads as part of the data.
        */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={draft}
            placeholder={`Search the ${t('group').toLowerCase()}`}
            disabled={marking}
            onChange={(event) => {
              setDraft(event.currentTarget.value)
              setPage(1)
            }}
          />
          {!marking && (
            <Segmented
              label="Which learners to show"
              value={scope}
              onChange={(value) => {
                setScope(value as 'current' | 'all')
                setPage(1)
              }}
              options={[
                { value: 'current', label: 'On the roll', count: rollTotal },
                { value: 'all', label: 'Including past' },
              ]}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {canTakeRegister && !marking && (
            <div className="flex items-center gap-1.5">
              {/* The day being marked. Sits with the button rather than behind
                * a menu: back-filling a missed register is common enough that
                * hiding the date makes it feel unsupported. */}
              <Input
                type="date"
                aria-label="Register date"
                value={onDate}
                max={today}
                className="w-40"
                onChange={(event) => setOnDate(event.currentTarget.value || today)}
              />
              <Button
                icon={<ClipboardText size={15} />}
                loading={open.isPending}
                onClick={() => open.mutate()}
              >
                Take register
              </Button>
            </div>
          )}
          {canManage && !marking && (
            <Button
              variant="primary"
              icon={<UserPlus size={15} weight="bold" />}
              onClick={() => setEnrolling(true)}
            >
              Enrol
            </Button>
          )}
        </div>
      </div>

      <Card>
        {marking && (
          <p className="border-b border-gray-200 px-4 py-2 text-2xs text-gray-600">
            Click a name to move it through {CYCLE.map((s) => ATTENDANCE_STATUSES.find((a) => a.value === s)?.label).join(' → ')}.
            The other statuses are on each row&rsquo;s menu.
          </p>
        )}

        {members.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserPlus size={20} />}
            title={search ? 'Nobody matches that' : `No ${t('learners').toLowerCase()} yet`}
            description={
              search
                ? 'Try part of a name or a number.'
                : `Put ${t('learners').toLowerCase()} on the roll and everything else on this page starts working — subjects, the register, the mark book.`
            }
            action={
              canManage && !search ? (
                <Button variant="primary" onClick={() => setEnrolling(true)}>
                  Enrol the first
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((member) => (
              <li key={member.id}>
                <RosterRow
                  member={member}
                  marking={marking && !finalised}
                  status={marks[member.student_id] ?? null}
                  canManage={canManage}
                  onCycle={() => cycle(member.student_id)}
                  onSet={(status) =>
                    setMarks((all) => ({ ...all, [member.student_id]: status }))
                  }
                  onRemove={() => remove.mutate(member)}
                />
              </li>
            ))}
          </ul>
        )}

        {/*
          * Marks survive paging: they are held in `marks`, keyed by learner,
          * and only written on save. A teacher can mark ten, turn the page,
          * mark ten more and save once — which is why the bar counts against
          * the roll rather than against what is on screen.
          */}
        {members.data && members.data.pagination.total > 0 && (
          <Pagination
            className="px-4"
            pagination={members.data.pagination}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/*
        * The register bar. Sticky at the foot, exactly where the bulk-action
        * bar sits everywhere else in this product — a teacher's hands stay on
        * the list and the two decisions are always reachable.
        */}
      {marking && (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div className="pointer-events-auto flex animate-slide-up flex-wrap items-center gap-1 rounded-lg bg-ink-deep py-2 pl-3.5 pr-1.5 text-white shadow-float">
            <span className="whitespace-nowrap text-sm font-semibold tabular">
              {formatNumber(markedCount)} of {formatNumber(rollTotal)} marked
            </span>
            {/* Which day, said out loud whenever it is not today — marking
              * Tuesday's register on Thursday must never look like marking
              * Thursday's. */}
            {onDate !== today && (
              <span className="whitespace-nowrap rounded bg-white/15 px-1.5 py-0.5 text-2xs">
                {formatDate(onDate)}
              </span>
            )}
            <span className="mx-1.5 h-4 w-px bg-white/20" aria-hidden />

            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              icon={<CheckCircle size={14} />}
              loading={allPresent.isPending}
              onClick={() => allPresent.mutate()}
            >
              Everyone present
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              loading={save.isPending}
              disabled={markedCount === 0}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              loading={finalise.isPending}
              onClick={() => finalise.mutate()}
            >
              Save &amp; close
            </Button>

            <button
              type="button"
              onClick={() => {
                setSessionId(null)
                setMarks({})
              }}
              aria-label="Leave the register open and stop marking"
              className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}

      <EnrolLearnerDialog
        open={enrolling}
        groupId={groupId}
        onClose={() => setEnrolling(false)}
        onEnrolled={() => {
          queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
        }}
      />
    </>
  )
}

function RosterRow({
  member,
  marking,
  status,
  canManage,
  onCycle,
  onSet,
  onRemove,
}: {
  member: LearningGroupMember
  marking: boolean
  status: AttendanceStatus | null
  canManage: boolean
  onCycle: () => void
  onSet: (status: AttendanceStatus) => void
  onRemove: () => void
}) {
  const name = member.student?.name ?? member.student_id
  const past = member.left_at !== null

  /*
   * One identity block, drawn once and used in both modes. The name is the
   * only thing at full weight on the row — Sprig's lists put a single dark
   * value against muted supporting text, and a row where the number and the
   * name compete is a row you read twice.
   */
  const identity = (
    <>
      <Avatar name={name} size="sm" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', past ? 'text-gray-500' : 'text-gray-900')}>
          {name}
        </span>
        <span className="block truncate text-2xs text-gray-500">
          {member.student?.student_number}
          {past && member.left_at && ` · left ${formatDate(member.left_at)}`}
        </span>
      </span>
    </>
  )

  if (!marking) {
    return (
      <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50">
        {identity}
        {past && <Badge tone="neutral">Past</Badge>}
        {canManage && !past && (
          <Menu
            align="end"
            className="w-48"
            items={[
              {
                key: 'remove',
                label: 'Take off the roll',
                icon: <UserMinus size={15} />,
                destructive: true,
                onSelect: onRemove,
              },
            ]}
            trigger={({ toggle, ref, open: isOpen }) => (
              <Button
                ref={ref}
                size="icon"
                variant="ghost"
                aria-label={`Options for ${name}`}
                onClick={toggle}
                /* Revealed on hover and on focus, so thirty identical grey
                 * dots do not compete with thirty names. */
                className={cn(
                  'shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
                  isOpen && 'opacity-100',
                )}
              >
                <DotsThree size={16} weight="bold" />
              </Button>
            )}
          />
        )}
      </div>
    )
  }

  const entry = ATTENDANCE_STATUSES.find((option) => option.value === status)

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 transition-colors',
        /* Marked rows recede so the unmarked ones are what stands out — the
         * register is worked by finding who is left, not by admiring who is
         * done. */
        status === null ? 'bg-white' : 'bg-gray-50/60',
      )}
    >
      {/* The whole row is the control — a teacher taps a name, not a widget
        * beside it. */}
      <button
        type="button"
        onClick={onCycle}
        aria-label={`${name} — ${entry?.label ?? 'not marked'}. Press to change.`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left transition-colors hover:bg-gray-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40"
      >
        {identity}
      </button>

      <StatusPill status={status} />

      <Menu
        align="end"
        className="w-44"
        items={ATTENDANCE_STATUSES.map((option) => ({
          key: option.value,
          label: option.label,
          onSelect: () => onSet(option.value),
        }))}
        trigger={({ toggle, ref }) => (
          <Button
            ref={ref}
            size="icon"
            variant="ghost"
            aria-label={`Set status for ${name}`}
            onClick={toggle}
            className="shrink-0"
          >
            <DotsThree size={16} weight="bold" />
          </Button>
        )}
      />
    </div>
  )
}

/**
 * The mark.
 *
 * A coloured dot and plain ink, which is how `StatusBadge` renders every other
 * status in this product — Sprig fills nothing. A row of thirty filled chips is
 * a row of thirty competing blocks, and the one thing a teacher is scanning for
 * is the gaps.
 *
 * The word carries the meaning and the dot is the shortcut, so a register read
 * by somebody who cannot distinguish red from green is still readable.
 */
function StatusPill({ status }: { status: AttendanceStatus | null }) {
  if (status === null) {
    return <span className="w-[5.5rem] shrink-0 text-right text-2xs text-gray-400">—</span>
  }

  const entry = ATTENDANCE_STATUSES.find((option) => option.value === status)

  return (
    <span className="flex w-[5.5rem] shrink-0 items-center justify-end gap-1.5 whitespace-nowrap text-xs text-gray-900">
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          status === 'present' && 'bg-success-500',
          status === 'absent' && 'bg-danger-500',
          status === 'late' && 'bg-brand-500',
          (status === 'excused' || status === 'left_early') && 'bg-gray-400',
        )}
        aria-hidden
      />
      {entry?.label}
    </span>
  )
}
