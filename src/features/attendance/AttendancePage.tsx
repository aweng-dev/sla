import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarBlank, ChatCircleText, ListChecks, NotePencil } from '@phosphor-icons/react'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  panelId,
  type TabItem,
} from '@/shared/ui'
import { FormDialog, FieldRow } from '@/features/academics/components/FormDialog'
import { useServerErrors } from '@/features/academics/components/useServerErrors'
import { RegisterPanel } from './RegisterPanel'
import { AttendanceHistoryPanel, ExcusesPanel } from './AttendancePanels'
import { portalAttendanceApi } from './attendance.api'
import { attendanceKeys } from './attendance.keys'
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from './attendance.types'

/**
 * Attendance.
 *
 * ── Who sees which screen ──────────────────────────────────────────────────
 *
 * `/teaching/attendance/*` answers 200 to staff and 403 ACCESS_DENIED to a
 * learner and a guardian — verified against all four tokens — so the register
 * itself is staff-only. `/portal/attendance` answers everybody, narrowed to
 * the caller, and is what a learner and a parent get instead.
 *
 * ── The institution decides what a register even is ────────────────────────
 *
 * `institution.attendance_mode` is `daily` here, so a register belongs to a
 * class on a date. A university running `course` mode takes it per offering.
 * The mode is shown rather than assumed, and the group picker is the right
 * control for `daily` — which is the mode this institution runs.
 */
export function AttendancePage() {
  const { portal } = useTenant()
  if (portal === 'student' || portal === 'guardian') return <LearnerAttendance />
  return <StaffAttendance />
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

function StaffAttendance() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access, portal } = useTenant()
  const tabsId = useId()
  const [tab, setTab] = useState('register')

  const tabs: TabItem[] = [
    { key: 'register', label: t('register'), icon: <NotePencil size={14} /> },
  ]
  /*
   * A group's history is `/admin/learning-groups/{id}/attendance`, which
   * answers 403 to a teacher even though they hold `learning_groups.view` —
   * the gate is deeper than the permission list, the same way the student
   * roster's is. Measured: owner (portal `admin`) 200, teacher 403. So the tab
   * is offered on the administrative portal and not on the teaching one, where
   * it would be a refusal every time.
   */
  if (portal === 'admin') {
    tabs.push({ key: 'history', label: 'History', icon: <CalendarBlank size={14} /> })
  }
  /* Notes from home only exist where guardians do. */
  if (access?.institution.supports_guardians !== false && perms.has('attendance.view')) {
    tabs.push({ key: 'excuses', label: 'Absence notes', icon: <ChatCircleText size={14} /> })
  }

  const active = tabs.some((item) => item.key === tab) ? tab : 'register'
  const mode = access?.institution.attendance_mode_label

  return (
    <PageStack>
      <PageHeader
        title={t('register')}
        description={
          mode
            ? `${mode} — who was here, and who was not.`
            : 'Who was here, and who was not.'
        }
      />

      <Tabs baseId={tabsId} value={active} onChange={setTab} items={tabs} />

      <div
        role="tabpanel"
        id={panelId(tabsId, active)}
        aria-labelledby={`${tabsId}-tab-${active}`}
      >
        {active === 'register' && <RegisterPanel />}
        {active === 'history' && <AttendanceHistoryPanel />}
        {active === 'excuses' && <ExcusesPanel />}
      </div>
    </PageStack>
  )
}

/* ── Learner and guardian ───────────────────────────────────────────────── */

const excuseSchema = z
  .object({
    starts_on: z.string().min(1, 'Choose the first day'),
    ends_on: z.string().min(1, 'Choose the last day'),
    reason: z.string().trim().min(3, 'Say what happened'),
  })
  .refine((v) => v.starts_on <= v.ends_on, {
    path: ['ends_on'],
    message: 'The last day cannot be before the first',
  })
type ExcuseValues = z.infer<typeof excuseSchema>

/**
 * What a learner or a parent may see: their own standing, their own marks, and
 * a way to explain an absence.
 *
 * A guardian's `/portal/attendance` returns a row per child, so the summaries
 * are grouped rather than summed — an average across two children is a number
 * about nobody.
 */
function LearnerAttendance() {
  const t = useTerminology()
  const { membership, access } = useTenant()
  const queryClient = useQueryClient()
  const [explaining, setExplaining] = useState(false)

  const childIds = access?.scopes.child_student_ids ?? []
  const ownId = membership?.student_id ?? null
  const subjects = ownId ? [ownId] : childIds

  const summary = useQuery({
    queryKey: attendanceKeys.portal.summary(),
    queryFn: () => portalAttendanceApi.summary(),
  })

  const records = useQuery({
    queryKey: attendanceKeys.portal.records(),
    queryFn: () => portalAttendanceApi.records({ per_page: 50 }),
  })

  const form = useForm<ExcuseValues>({
    resolver: zodResolver(excuseSchema),
    defaultValues: { starts_on: '', ends_on: '', reason: '' },
  })
  const applyServerErrors = useServerErrors(form)

  const submit = useMutation({
    mutationFn: (values: ExcuseValues) =>
      portalAttendanceApi.submitExcuse({
        student_id: subjects[0]!,
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        reason: values.reason.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.portal.all })
      toast.success('Note sent to the school')
      setExplaining(false)
      form.reset({ starts_on: '', ends_on: '', reason: '' })
    },
    onError: applyServerErrors,
  })

  const rows = summary.data ?? []

  return (
    <PageStack>
      <PageHeader
        title={t('register')}
        description={ownId ? 'Your attendance record.' : `Your ${t('learners').toLowerCase()}' attendance.`}
        actions={
          subjects.length > 0 ? (
            <Button variant="primary" onClick={() => setExplaining(true)}>
              Explain an absence
            </Button>
          ) : undefined
        }
      />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : summary.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks size={20} />}
            title="Nothing recorded yet"
            description="Attendance appears here once a register has been taken."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* A learner has one row per period AND per offering, so neither id
            * alone is unique across the set — the index is what makes the key
            * stable here. */}
          {rows.map((row, index) => (
            <Card
              key={[row.student_id, row.academic_period_id, row.course_offering_id, index].join(':')}
            >
              <div className="p-4">
                <p className="text-xs font-medium text-gray-600">
                  {row.course_offering_id ? t('course') : t('period')}
                </p>
                <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-gray-900 tabular">
                  {row.attendance_percentage}%
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {formatNumber(row.present_count)} present of{' '}
                  {formatNumber(row.required_sessions)}
                  {row.late_count > 0 ? ` · ${formatNumber(row.late_count)} late` : ''}
                  {row.absent_count > 0 ? ` · ${formatNumber(row.absent_count)} absent` : ''}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Marks" subtitle="Each register you were in." />
        {records.isError ? (
          <ErrorState error={records.error} onRetry={() => records.refetch()} />
        ) : records.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (records.data ?? []).length === 0 ? (
          <EmptyState title="No marks yet" />
        ) : (
          <ul className="divide-y divide-gray-200">
            {(records.data ?? []).map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="text-sm text-gray-900">
                  {record.updated_at ? formatDate(record.updated_at) : '—'}
                  {record.remark && (
                    <span className="ml-2 text-xs text-gray-600">{record.remark}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {record.minutes_late ? (
                    <span className="text-xs text-gray-600 tabular">
                      {record.minutes_late} min late
                    </span>
                  ) : null}
                  <StatusBadge status={record.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormDialog
        open={explaining}
        onClose={() => setExplaining(false)}
        title="Explain an absence"
        description="The school sees this and decides whether to record the absence as excused."
        form={form}
        onSubmit={(values) => submit.mutate(values)}
        pending={submit.isPending}
        submitLabel="Send to the school"
      >
        <FieldRow>
          <Field label="First day away" required error={form.formState.errors.starts_on?.message}>
            {(props) => <Input {...props} type="date" {...form.register('starts_on')} />}
          </Field>
          <Field label="Last day away" required error={form.formState.errors.ends_on?.message}>
            {(props) => <Input {...props} type="date" {...form.register('ends_on')} />}
          </Field>
        </FieldRow>
        <Field label="What happened" required error={form.formState.errors.reason?.message}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              placeholder="Chest infection, seen at the clinic on Tuesday."
              {...form.register('reason')}
            />
          )}
        </Field>
      </FormDialog>
    </PageStack>
  )
}

/** Re-exported so the register's status vocabulary has one home. */
export { ATTENDANCE_STATUS_LABELS }
export type { AttendanceStatus }
