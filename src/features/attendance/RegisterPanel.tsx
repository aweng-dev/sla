import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle, Lock, NotePencil } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Skeleton,
} from '@/shared/ui'
import { qk } from '@/shared/api/queryKeys'
import { studentsApi } from '@/features/students/students.api'
import { FilterSelect, useGroupCatalog } from '@/features/academics/components/pickers'
import { reportError } from '@/features/academics/components/useServerErrors'
import { attendanceApi, type MarkPayload } from './attendance.api'
import { attendanceKeys } from './attendance.keys'
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
} from './attendance.types'

/**
 * Taking the register.
 *
 * ── The roll is the group, not the records ─────────────────────────────────
 *
 * `AttendanceRecordResource` returns `student_id` and no name, and a learner
 * who has not been marked yet has no record at all. So the roll comes from the
 * group's membership and the marks are joined onto it — which is the only way
 * to show the people still to be marked, who are the whole point of the screen.
 *
 * ── Marks are held locally until saved ─────────────────────────────────────
 *
 * A tutor marks a class in a few seconds, and a request per tap would be
 * thirty round trips over a school's connection with thirty chances to
 * half-save. Taps change local state; one `records/bulk` writes them. The
 * unsaved count is always on screen so nobody walks away from a full register
 * that was never sent.
 */
export function RegisterPanel() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access, portal } = useTenant()
  const queryClient = useQueryClient()

  const groups = useGroupCatalog()
  const [groupId, setGroupId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})

  const canTake = perms.has('attendance.manage')
  const activeGroup = groupId || groups.items[0]?.id || ''

  /*
   * There is no "get the session for group+date" endpoint. The group's history
   * carries exactly that mapping in `by_day`, so it is used when the reader can
   * read it — but `/admin/learning-groups/{id}/attendance` answers 403 to a
   * teacher, so its failure must not break the screen.
   *
   * The way in for everybody is `POST /teaching/attendance/sessions`, which is
   * IDEMPOTENT: posting for a group and date that already has a register
   * returns that register rather than a conflict (verified — the same id comes
   * back). So the button is "open or resume", and a teacher reaches the same
   * roll without ever reading the history.
   */
  /* Not requested on the teaching portal at all: it is measured to answer 403
   * there, and a request known to be refused is noise in the network panel and
   * a wasted round trip. The teacher's way in is the idempotent open below. */
  const canReadHistory = portal === 'admin'

  const history = useQuery({
    queryKey: attendanceKeys.groupHistory(activeGroup),
    queryFn: () => attendanceApi.groupHistory(activeGroup),
    enabled: Boolean(activeGroup) && canReadHistory,
    retry: false,
  })

  const [openedId, setOpenedId] = useState<string | null>(null)
  const dayFromHistory = history.data?.by_day.find((row) => row.session_date === date) ?? null
  const sessionId = dayFromHistory?.session_id ?? openedId
  const day = sessionId ? { session_id: sessionId } : null

  const register = useQuery({
    queryKey: attendanceKeys.register(sessionId ?? ''),
    queryFn: () => attendanceApi.register(sessionId!),
    enabled: Boolean(sessionId),
  })

  /*
   * The roll comes from the STUDENT roster filtered by group, not from
   * `/admin/learning-groups/{id}/members`. Both return the same people, but
   * the members route answers 403 to a teacher — who is the main person
   * taking a register — while `/admin/students?learning_group_id=` answers
   * them 200. Measured against both tokens, not assumed.
   */
  const members = useQuery({
    queryKey: qk.students.list({ learning_group_id: activeGroup, per_page: 200 }),
    queryFn: () => studentsApi.list({ learning_group_id: activeGroup, per_page: 200 }),
    enabled: Boolean(activeGroup),
  })

  /* A new register, or a new date, means the previous draft is about a
   * different day and must not leak into this one. */
  useEffect(() => {
    setDraft({})
    setOpenedId(null)
  }, [activeGroup, date])

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
    toast.success(message)
  }

  const open = useMutation({
    mutationFn: () =>
      attendanceApi.openRegister({
        session_date: date,
        learning_group_id: activeGroup,
        academic_session_id: access?.calendar?.session?.id ?? null,
        academic_period_id: access?.calendar?.period?.id ?? null,
      }),
    onSuccess: (session) => {
      setOpenedId(session.id)
      settle(session.is_finalised ? 'Register opened' : 'Register ready')
    },
    onError: (error) => reportError(error, 'The register could not be opened.'),
  })

  const save = useMutation({
    mutationFn: (records: MarkPayload[]) => attendanceApi.markBulk(sessionId!, records),
    onSuccess: (_data, records) => {
      setDraft({})
      settle(`${records.length} ${records.length === 1 ? 'mark' : 'marks'} saved`)
    },
    onError: (error) => reportError(error, 'The marks could not be saved.'),
  })

  const rest = useMutation({
    mutationFn: () => attendanceApi.markRemainingPresent(sessionId!),
    onSuccess: () => {
      setDraft({})
      settle('Everyone else marked present')
    },
    onError: (error) => reportError(error, 'That could not be completed.'),
  })

  const finalise = useMutation({
    mutationFn: () => attendanceApi.finalise(sessionId!),
    onSuccess: () => settle('Register finalised'),
    onError: (error) => reportError(error, 'The register could not be finalised.'),
  })

  /** The roll: every member, with their mark if they have one and their
   *  unsaved change if the reader has made one. */
  const roll = useMemo(() => {
    const marks = new Map(
      (register.data?.records ?? []).map((record) => [record.student_id, record]),
    )
    return (members.data?.rows ?? []).map((row) => ({
      studentId: row.id,
      name: row.person.full_name,
      number: row.student_number,
      saved: marks.get(row.id) ?? null,
      pending: draft[row.id] ?? null,
    }))
  }, [members.data, register.data, draft])

  const unsaved = Object.keys(draft).length
  const finalised = register.data?.is_finalised ?? false
  const unmarked = roll.filter((row) => !row.saved && !row.pending).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={activeGroup}
          onChange={setGroupId}
          options={groups.options}
          allLabel={`Choose a ${t('group').toLowerCase()}`}
          className="w-56"
        />
        <div className="w-44">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        {day && (
          <Badge tone={finalised ? 'neutral' : 'accent'}>
            {finalised ? 'Finalised' : 'Open'}
          </Badge>
        )}
      </div>

      {!activeGroup ? (
        <Card>
          <EmptyState
            title={`Choose a ${t('group').toLowerCase()}`}
            description="Pick a class and a date to take or review its register."
          />
        </Card>
      ) : !day ? (
        <Card>
          <EmptyState
            icon={<NotePencil size={20} />}
            title="No register open for this day"
            description={`Opening one records that the register was started for ${formatDate(date)} — there is no way to remove it afterwards. If one already exists for this day it is resumed rather than duplicated.`}
            action={
              canTake ? (
                <Button variant="primary" loading={open.isPending} onClick={() => open.mutate()}>
                  Open the register for {formatDate(date)}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`${formatDate(date)}`}
            subtitle={
              register.data
                ? `${roll.length - unmarked} of ${roll.length} marked${unsaved > 0 ? ` · ${unsaved} unsaved` : ''}`
                : undefined
            }
            actions={
              canTake && !finalised ? (
                <div className="flex items-center gap-2">
                  {unmarked > 0 && (
                    <Button
                      size="sm"
                      icon={<CheckCircle size={14} />}
                      loading={rest.isPending}
                      onClick={() => rest.mutate()}
                    >
                      Mark rest present
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={<Lock size={14} />}
                    loading={finalise.isPending}
                    disabled={unsaved > 0}
                    onClick={() => finalise.mutate()}
                  >
                    Finalise
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={unsaved === 0}
                    loading={save.isPending}
                    onClick={() =>
                      save.mutate(
                        Object.entries(draft).map(([student_id, status]) => ({
                          student_id,
                          status,
                        })),
                      )
                    }
                  >
                    Save {unsaved > 0 ? unsaved : ''}
                  </Button>
                </div>
              ) : finalised ? (
                <span className="text-xs text-gray-600">Closed to further marking</span>
              ) : undefined
            }
          />

          {register.isLoading || members.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : roll.length === 0 ? (
            <EmptyState
              title={`Nobody in this ${t('group').toLowerCase()}`}
              description={`Add ${t('learners').toLowerCase()} to it before taking a register.`}
            />
          ) : (
            <ul className="divide-y divide-gray-200">
              {roll.map((row) => (
                <li
                  key={row.studentId}
                  className="flex items-center justify-between gap-4 px-4 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={row.name} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-900">{row.name}</span>
                      {row.number && (
                        <span className="block truncate text-xs text-gray-600 tabular">
                          {row.number}
                        </span>
                      )}
                    </span>
                  </span>

                  <StatusPicker
                    value={row.pending ?? (row.saved?.status as AttendanceStatus | undefined) ?? null}
                    dirty={row.pending !== null}
                    disabled={!canTake || finalised}
                    onChange={(status) =>
                      setDraft((current) => ({ ...current, [row.studentId]: status }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!canReadHistory && (
        <p className="text-xs text-gray-600">
          Past registers for this {t('group').toLowerCase()} are not visible from the teaching
          portal — opening the day above resumes an existing register rather than duplicating it.
        </p>
      )}

      {history.data?.ever_taken && (
        <p className="text-xs text-gray-600">
          {formatNumber(history.data.totals.registers_taken)} registers taken between{' '}
          {formatDate(history.data.range.from)} and {formatDate(history.data.range.to)} ·{' '}
          {history.data.totals.attendance_percentage}% attendance
        </p>
      )}
    </div>
  )
}

/**
 * The five marks, as one segmented control.
 *
 * Buttons rather than a select because a tutor marks a class in a few seconds
 * and a dropdown is two interactions per learner. The chosen mark takes a
 * tinted fill; the rest stay plain, so a roll of thirty reads as a column of
 * quiet type with the exceptions standing out — which is what the reader is
 * scanning for.
 */
const TONES: Record<AttendanceStatus, string> = {
  present: 'bg-success-50 text-success-700 border-success-200',
  absent: 'bg-danger-50 text-danger-700 border-danger-200',
  late: 'bg-brand-100 text-gray-900 border-brand-300',
  excused: 'bg-accent-50 text-accent-700 border-accent-200',
  left_early: 'bg-coral-50 text-coral-700 border-coral-200',
}

function StatusPicker({
  value,
  dirty,
  disabled,
  onChange,
}: {
  value: AttendanceStatus | null
  dirty: boolean
  disabled?: boolean
  onChange: (status: AttendanceStatus) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {/* An unsaved change is marked, not merely coloured — colour here already
        * means the status, so it cannot also mean "not yet sent". */}
      {dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-label="Unsaved" />}
      <span className="inline-flex overflow-hidden rounded-md border border-gray-300" role="group">
        {ATTENDANCE_STATUSES.map((status, index) => {
          const active = value === status
          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(status)}
              className={cn(
                'px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed',
                index > 0 && 'border-l border-gray-300',
                active
                  ? `border-y-0 font-medium ${TONES[status]}`
                  : 'bg-white text-gray-600 hover:bg-gray-50 disabled:text-gray-400',
              )}
            >
              {ATTENDANCE_STATUS_LABELS[status]}
            </button>
          )
        })}
      </span>
    </span>
  )
}
