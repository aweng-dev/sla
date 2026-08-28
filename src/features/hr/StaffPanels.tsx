import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Certificate, Plus, SealCheck } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, humanize } from '@/shared/lib/format'
import {
  Blank,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  Skeleton,
  StatusBadge,
  type Column,
} from '@/shared/ui'
import { hrKeys, leaveApi, payrollApi, staffApi } from './hr.api'
import {
  formatDays,
  type LeaveEntitlement,
  type LeaveRequest,
  type Payslip,
  type StaffAssignment,
  type StaffQualification,
  type StaffRecord,
} from './hr.types'

/* ── Overview ────────────────────────────────────────────────────────────── */

export function StaffOverview({ record, photo }: { record: StaffRecord; photo: string | null }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Person" subtitle="Held once, shared everywhere this person appears." />
        <div className="flex items-start gap-4 border-b border-gray-200 px-4 py-4">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg font-semibold text-gray-600">
              {record.person.full_name.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{record.person.full_name}</p>
            <p className="text-xs text-gray-600">{record.job_title ?? 'No job title recorded'}</p>
          </div>
        </div>
        <Facts>
          {record.person.preferred_name && (
            <Fact label="Known as">{record.person.preferred_name}</Fact>
          )}
          <Fact label="Date of birth">
            {record.person.date_of_birth ? formatDate(record.person.date_of_birth) : <Blank />}
          </Fact>
          <Fact label="Gender">
            {record.person.gender ? humanize(record.person.gender) : <Blank />}
          </Fact>
        </Facts>
      </Card>

      <Card>
        <CardHeader title="Employment" subtitle="What this person is to the institution." />
        <Facts>
          <Fact label="Employee number">
            {record.employee_number ? (
              <span className="tabular">{record.employee_number}</span>
            ) : (
              <Blank />
            )}
          </Fact>
          <Fact label="Job title">{record.job_title || <Blank />}</Fact>
          <Fact label="Type">
            {record.employment_type ? humanize(record.employment_type) : <Blank />}
          </Fact>
          <Fact label="Status">
            <StatusBadge status={record.employment_status} />
          </Fact>
          <Fact label="Hired">{formatDate(record.hire_date)}</Fact>
          {record.termination_date && (
            <Fact label="Left">{formatDate(record.termination_date)}</Fact>
          )}
          <Fact label="Teaching">
            <span className="tabular">{record.course_offering_count}</span>{' '}
            {record.course_offering_count === 1 ? 'offering' : 'offerings'}
          </Fact>
        </Facts>
      </Card>
    </div>
  )
}

/* ── Assignments ─────────────────────────────────────────────────────────── */

/**
 * Where this person is posted.
 *
 * Read from the RECORD's own payload rather than `/admin/staff-assignments`,
 * which is refused for an institution that keeps no organizational chart — the
 * API answers that with a domain 404 saying so. The record carries the
 * assignments inline either way, so the panel works for both kinds.
 */
export function StaffAssignments({ record }: { record: StaffRecord }) {
  const columns: Column<StaffAssignment>[] = [
    {
      key: 'unit',
      header: 'Unit',
      cell: (row) => row.organizational_unit_name || <Blank />,
    },
    { key: 'campus', header: 'Campus', cell: (row) => row.campus_name || <Blank /> },
    { key: 'position', header: 'Position', cell: (row) => row.position_name || <Blank /> },
    {
      key: 'primary',
      header: 'Primary',
      width: '7rem',
      cell: (row) => <Flag on={row.is_primary}>{row.is_primary ? 'Primary' : 'Secondary'}</Flag>,
    },
    {
      key: 'from',
      header: 'From',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.starts_on ? formatDate(row.starts_on) : <Blank />),
    },
    {
      key: 'to',
      header: 'Until',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.ends_on ? formatDate(row.ends_on) : <span className="text-gray-500">Open</span>),
    },
  ]

  return (
    <DataTable
      rows={record.assignments}
      columns={columns}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          icon={<Certificate size={20} />}
          title="No postings recorded"
          description="An assignment ties a member of staff to a unit and a campus, from a date."
        />
      }
    />
  )
}

/* ── Qualifications ──────────────────────────────────────────────────────── */

export function StaffQualifications({
  staffId,
  canManage,
  onAdd,
}: {
  staffId: string
  canManage: boolean
  onAdd: () => void
}) {
  const queryClient = useQueryClient()

  const qualifications = useQuery({
    queryKey: hrKeys.qualifications(staffId),
    queryFn: () => staffApi.qualifications(staffId),
  })

  const verify = useMutation({
    mutationFn: (id: string) => staffApi.verifyQualification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.qualifications(staffId) })
      toast.success('Qualification verified')
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.'),
  })

  if (qualifications.isError) {
    return <ErrorState error={qualifications.error} onRetry={() => qualifications.refetch()} />
  }

  const columns: Column<StaffQualification>[] = [
    {
      key: 'title',
      header: 'Qualification',
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-[0.8125rem] leading-5 text-gray-900">{row.title}</div>
          {row.awarding_body && (
            <div className="truncate text-[0.6875rem] leading-4 text-gray-600">
              {row.awarding_body}
            </div>
          )}
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', width: '8rem', cell: (row) => humanize(row.kind) },
    {
      key: 'field',
      header: 'Field',
      cell: (row) => row.field_of_study || <Blank />,
    },
    {
      key: 'awarded',
      header: 'Awarded',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.awarded_on ? formatDate(row.awarded_on) : <Blank />),
    },
    {
      key: 'expiry',
      header: 'Expires',
      width: '10rem',
      /* `has_expired` is the API's own reading against today. Recomputing it
       * from `expires_on` here would disagree with it across a timezone. */
      cell: (row) =>
        row.expires_on ? (
          <span className={row.has_expired ? 'text-danger-500' : undefined}>
            {formatDate(row.expires_on)}
            {row.has_expired && ' · expired'}
          </span>
        ) : (
          <span className="text-gray-500">Does not expire</span>
        ),
    },
    {
      key: 'verified',
      header: 'Verified',
      width: '10rem',
      cell: (row) =>
        row.is_verified ? (
          <Flag on>Verified {row.verified_at ? formatDate(row.verified_at) : ''}</Flag>
        ) : canManage ? (
          <Button
            size="sm"
            icon={<SealCheck size={13} />}
            loading={verify.isPending && verify.variables === row.id}
            onClick={() => verify.mutate(row.id)}
          >
            Verify
          </Button>
        ) : (
          <Flag on={false}>Not verified</Flag>
        ),
    },
  ]

  return (
    <div>
      {canManage && (
        <div className="flex justify-end pb-3">
          <Button icon={<Plus size={14} weight="bold" />} onClick={onAdd}>
            Add qualification
          </Button>
        </div>
      )}
      <DataTable
        rows={qualifications.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={qualifications.isLoading}
        skeletonRows={3}
        empty={
          <EmptyState
            icon={<Certificate size={20} />}
            title="No qualifications recorded"
            description="Degrees, licences and training, with the body that awarded them."
            action={
              canManage ? <Button onClick={onAdd}>Add qualification</Button> : undefined
            }
          />
        }
      />
    </div>
  )
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

export function StaffLeave({ staffId }: { staffId: string }) {
  const entitlements = useQuery({
    queryKey: hrKeys.entitlements({ staff_id: staffId }),
    queryFn: () => leaveApi.entitlements({ staff_id: staffId }),
  })

  const requests = useQuery({
    queryKey: hrKeys.leaveRequests({ staff_id: staffId }),
    queryFn: () => leaveApi.requests({ staff_id: staffId, per_page: 25 }),
  })

  const entitlementColumns: Column<LeaveEntitlement>[] = [
    {
      key: 'period',
      header: 'Period',
      className: 'tabular',
      cell: (row) => `${formatDate(row.period_start)} – ${formatDate(row.period_end)}`,
    },
    { key: 'entitled', header: 'Entitled', cell: (row) => formatDays(row.entitled_days_x100) },
    { key: 'carried', header: 'Carried over', cell: (row) => formatDays(row.carried_over_days_x100) },
    { key: 'taken', header: 'Taken', cell: (row) => formatDays(row.taken_days_x100) },
    { key: 'pending', header: 'Pending', cell: (row) => formatDays(row.pending_days_x100) },
    {
      key: 'remaining',
      header: 'Remaining',
      /* The API's own sum — entitled + carried + adjustment − taken − pending.
       * Not recomputed here, so the screen cannot disagree with the balance
       * the approver is deciding against. */
      cell: (row) => (
        <span className="font-medium text-gray-900">{formatDays(row.remaining_days_x100)}</span>
      ),
    },
  ]

  const requestColumns: Column<LeaveRequest>[] = [
    {
      key: 'reference',
      header: 'Reference',
      className: 'tabular',
      cell: (row) => row.reference || <Blank />,
    },
    {
      key: 'dates',
      header: 'Dates',
      className: 'tabular',
      cell: (row) => `${formatDate(row.start_on)} – ${formatDate(row.end_on)}`,
    },
    { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'decided',
      header: 'Decided',
      className: 'tabular',
      cell: (row) => (row.decided_at ? formatDate(row.decided_at) : <Blank />),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Entitlement" subtitle="What this person is owed, and what is left." />
        {entitlements.isError ? (
          <ErrorState error={entitlements.error} onRetry={() => entitlements.refetch()} />
        ) : (
          <DataTable
            rows={entitlements.data?.rows ?? []}
            columns={entitlementColumns}
            rowKey={(row) => row.id}
            loading={entitlements.isLoading}
            skeletonRows={2}
            className="border-0"
            empty={
              <EmptyState
                title="No entitlement granted"
                description="Leave is granted per type, for a period, before it can be taken."
              />
            }
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Requests" subtitle="Every application, and how it was answered." />
        {requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
        ) : (
          <DataTable
            rows={requests.data?.rows ?? []}
            columns={requestColumns}
            rowKey={(row) => row.id}
            loading={requests.isLoading}
            skeletonRows={2}
            className="border-0"
            empty={<EmptyState title="No leave requested" />}
          />
        )}
      </Card>
    </div>
  )
}

/* ── Payslips ────────────────────────────────────────────────────────────── */

export function StaffPayslips({ staffId }: { staffId: string }) {
  const payslips = useQuery({
    queryKey: hrKeys.payslips({ staff_id: staffId }),
    queryFn: () => payrollApi.payslips({ staff_id: staffId, per_page: 25 }),
  })

  if (payslips.isError) {
    return <ErrorState error={payslips.error} onRetry={() => payslips.refetch()} />
  }

  const columns: Column<Payslip>[] = [
    {
      key: 'reference',
      header: 'Reference',
      className: 'tabular',
      cell: (row) => row.reference || <Blank />,
    },
    {
      key: 'gross',
      header: 'Gross',
      numeric: true,
      cell: (row) => formatMoney(row.gross_minor, row.currency),
    },
    {
      key: 'deductions',
      header: 'Deductions',
      numeric: true,
      cell: (row) => formatMoney(row.deductions_minor, row.currency),
    },
    {
      key: 'net',
      header: 'Net',
      numeric: true,
      cell: (row) => (
        <span className="font-medium text-gray-900">{formatMoney(row.net_minor, row.currency)}</span>
      ),
    },
    { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'published',
      header: 'Published',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.published_at ? formatDate(row.published_at) : <Blank />),
    },
  ]

  return (
    <DataTable
      rows={payslips.data?.rows ?? []}
      columns={columns}
      rowKey={(row) => row.id}
      loading={payslips.isLoading}
      skeletonRows={3}
      empty={
        <EmptyState
          title="No payslips yet"
          description="A payslip appears once a payroll run covering this person has been calculated."
        />
      }
    />
  )
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

export function StaffRecordSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[0, 1].map((card) => (
        <Card key={card}>
          <div className="border-b border-gray-200 px-4 py-3">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="divide-y divide-gray-200">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
