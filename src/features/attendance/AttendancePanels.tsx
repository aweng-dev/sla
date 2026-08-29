import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarBlank, ChatCircleText, Check, X } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatNumber, humanize } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Skeleton,
  StatusBadge,
  Textarea,
  type Column,
} from '@/shared/ui'
import { FilterSelect, useGroupCatalog } from '@/features/academics/components/pickers'
import { FormDialog } from '@/features/academics/components/FormDialog'
import { useServerErrors } from '@/features/academics/components/useServerErrors'
import { attendanceApi } from './attendance.api'
import { attendanceKeys } from './attendance.keys'
import type { AttendanceDay, AttendanceExcuse } from './attendance.types'

/* ── A group's record ───────────────────────────────────────────────────── */

/**
 * Every register a group has taken, and what each came to.
 *
 * The percentage is the server's — `counts_as_present` folds `late` in and
 * leaves `absent` out, and that rule belongs to the institution's policy
 * rather than to this screen.
 */
export function AttendanceHistoryPanel() {
  const t = useTerminology()
  const groups = useGroupCatalog()
  const [groupId, setGroupId] = useState('')
  const activeGroup = groupId || groups.items[0]?.id || ''

  const history = useQuery({
    queryKey: attendanceKeys.groupHistory(activeGroup),
    queryFn: () => attendanceApi.groupHistory(activeGroup),
    enabled: Boolean(activeGroup),
  })

  const columns: Column<AttendanceDay>[] = [
    {
      key: 'date',
      header: 'Day',
      cell: (row) => <span className="font-medium">{formatDate(row.session_date)}</span>,
    },
    {
      key: 'status',
      header: 'Register',
      width: '9rem',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'present',
      header: 'Present',
      numeric: true,
      width: '7rem',
      cell: (row) => formatNumber(row.counts.present_count),
    },
    {
      key: 'absent',
      header: 'Absent',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.counts.absent_count > 0 ? (
          <span className="text-danger-500">{formatNumber(row.counts.absent_count)}</span>
        ) : (
          formatNumber(0)
        ),
    },
    {
      key: 'late',
      header: 'Late',
      numeric: true,
      width: '6rem',
      cell: (row) => formatNumber(row.counts.late_count),
    },
    {
      key: 'pct',
      header: 'Attendance',
      numeric: true,
      width: '8rem',
      cell: (row) => <PercentCell value={row.counts.attendance_percentage} />,
    },
  ]

  const totals = history.data?.totals

  return (
    <div className="flex flex-col gap-4">
      <FilterSelect
        value={activeGroup}
        onChange={setGroupId}
        options={groups.options}
        allLabel={`Choose a ${t('group').toLowerCase()}`}
        className="w-56"
      />

      {history.isError ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : !activeGroup ? (
        <Card>
          <EmptyState
            title={`Choose a ${t('group').toLowerCase()}`}
            description="Its register history and running attendance appear here."
          />
        </Card>
      ) : history.data && !history.data.ever_taken ? (
        <Card>
          <EmptyState
            icon={<CalendarBlank size={20} />}
            title="No register has ever been taken"
            description={`Nothing has been recorded for this ${t('group').toLowerCase()}. Take one from the Register tab and the history builds from there.`}
          />
        </Card>
      ) : (
        <>
          {totals && (
            <div className="grid gap-4 sm:grid-cols-4">
              <Figure label="Attendance" value={`${totals.attendance_percentage}%`} />
              <Figure label="Registers taken" value={formatNumber(totals.registers_taken)} />
              <Figure label="Marks" value={formatNumber(totals.marks_total)} />
              <Figure
                label="Absences"
                value={formatNumber(totals.absent_count)}
                hint={`${formatNumber(totals.late_count)} late`}
              />
            </div>
          )}
          <DataTable
            rows={history.data?.by_day ?? []}
            columns={columns}
            rowKey={(row) => row.session_id}
            loading={history.isLoading}
            skeletonRows={5}
            empty={<EmptyState title="No days in range" />}
          />
        </>
      )}
    </div>
  )
}

function PercentCell({ value }: { value: number }) {
  /* Below 90% is where a school starts looking; below 80% is where it acts.
   * The thresholds are the common ones and are shown as colour, not as a
   * judgement in words the data cannot support. */
  return (
    <span
      className={cn(
        'tabular',
        value < 80 ? 'text-danger-500' : value < 90 ? 'text-gray-900' : 'text-gray-900',
      )}
    >
      {value}%
    </span>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-gray-900 tabular">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

/* ── Absence notes ──────────────────────────────────────────────────────── */

const reviewSchema = z.object({ note: z.string().optional() })
type ReviewValues = z.infer<typeof reviewSchema>

/**
 * Notes from home, waiting on a decision.
 *
 * Approving takes no note; declining requires one — the API enforces it with
 * `required_if:approve,false`, because a refusal a family cannot read the
 * reason for is not a decision they can do anything about.
 */
export function ExcusesPanel() {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending')
  const [declining, setDeclining] = useState<AttendanceExcuse | null>(null)

  const canReview = perms.has('attendance.manage')

  const excuses = useQuery({
    queryKey: attendanceKeys.excuses({ status }),
    queryFn: () => attendanceApi.excuses({ status: status || undefined }),
  })

  const review = useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      attendanceApi.reviewExcuse(id, { approve, note: note ?? null }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success(variables.approve ? 'Excuse approved' : 'Excuse declined')
      setDeclining(null)
    },
    onError: () => toast.error('That could not be saved.'),
  })

  const form = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { note: '' } })
  const applyServerErrors = useServerErrors(form)

  const rows = excuses.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <FilterSelect
        value={status}
        onChange={setStatus}
        options={[
          { value: 'pending', label: 'Waiting on a decision' },
          { value: 'approved', label: 'Approved' },
          { value: 'declined', label: 'Declined' },
        ]}
        allLabel="All notes"
        className="w-56"
      />

      {excuses.isError ? (
        <ErrorState error={excuses.error} onRetry={() => excuses.refetch()} />
      ) : excuses.isLoading ? (
        <Card>
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChatCircleText size={20} />}
            title={status === 'pending' ? 'Nothing waiting' : 'None here'}
            description={
              status === 'pending'
                ? 'Absence notes sent from home appear here for a decision.'
                : 'No notes with this status.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((excuse) => (
            <Card key={excuse.id}>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 gap-2.5">
                  <Avatar name={excuse.student?.name} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {excuse.student?.name ?? 'Learner'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {excuse.starts_on === excuse.ends_on
                        ? formatDate(excuse.starts_on)
                        : `${formatDate(excuse.starts_on)} – ${formatDate(excuse.ends_on)}`}
                      {excuse.category ? ` · ${humanize(excuse.category)}` : ''}
                    </p>
                    <p className="mt-1.5 text-sm text-gray-800">{excuse.reason}</p>
                    {excuse.review_note && (
                      <p className="mt-1.5 text-xs text-gray-600">
                        Decision note: {excuse.review_note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {excuse.has_document && <Badge tone="neutral">Document</Badge>}
                  <StatusBadge status={excuse.status} />
                  {canReview && excuse.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        icon={<Check size={13} weight="bold" />}
                        loading={review.isPending}
                        onClick={() => review.mutate({ id: excuse.id, approve: true })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        icon={<X size={13} weight="bold" />}
                        onClick={() => {
                          form.reset({ note: '' })
                          setDeclining(excuse)
                        }}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {declining && (
        <FormDialog
          open
          onClose={() => setDeclining(null)}
          title={`Decline ${declining.student?.name ?? 'this note'}`}
          description="A reason is required — the family sees it."
          form={form}
          onSubmit={(values) => {
            if (!values.note?.trim()) {
              form.setError('note', { message: 'Say why it is being declined' })
              return
            }
            review.mutate(
              { id: declining.id, approve: false, note: values.note.trim() },
              { onError: applyServerErrors },
            )
          }}
          pending={review.isPending}
          submitLabel="Decline"
          destructive
        >
          <Field label="Reason" required error={form.formState.errors.note?.message}>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                placeholder="No medical note supplied; please send one in."
                {...form.register('note')}
              />
            )}
          </Field>
        </FormDialog>
      )}
    </div>
  )
}
