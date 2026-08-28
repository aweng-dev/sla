import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Sun } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions } from '@/features/tenant/TenantProvider'
import {
  Blank,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Flag,
  PageHeader,
  Pagination,
  panelId,
  Select,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { DecideLeaveDialog, LeaveTypeDialog } from './HrDialogs'
import { hrKeys, leaveApi } from './hr.api'
import {
  formatDays,
  LEAVE_STATUSES,
  type LeaveEntitlement,
  type LeaveRequest,
  type LeaveType,
} from './hr.types'

/**
 * Human Resources, which in this API means LEAVE.
 *
 * `module:hr` gates exactly three things — leave types, entitlements and
 * requests — so that is what this screen is. Staff records live under
 * `module:staff` and payroll under `module:payroll`, each with its own rail
 * item, and folding them in here would put three modules behind one.
 */
export function HrPage() {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const tabsId = useId()

  const [tab, setTab] = useState('requests')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [creatingType, setCreatingType] = useState(false)
  const [deciding, setDeciding] = useState<LeaveRequest | undefined>(undefined)

  const canManage = perms.has('hr.manage') || perms.has('hr.leave_approvals')

  const requestQuery = useMemo(
    () => ({ status: status || undefined, page, per_page: 25 }),
    [status, page],
  )

  const requests = useQuery({
    queryKey: hrKeys.leaveRequests(requestQuery),
    queryFn: () => leaveApi.requests(requestQuery),
    enabled: tab === 'requests',
    placeholderData: (previous) => previous,
  })

  const types = useQuery({
    queryKey: hrKeys.leaveTypes,
    queryFn: leaveApi.types,
    staleTime: 5 * 60_000,
  })

  const entitlements = useQuery({
    queryKey: hrKeys.entitlements({}),
    queryFn: () => leaveApi.entitlements({}),
    enabled: tab === 'entitlements',
  })

  const cancel = useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.all })
      toast.success('Request cancelled')
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be cancelled.'),
  })

  /* A type's name is worth more than its id on every row that references one,
   * and the list is small enough to hold. */
  const typeName = useMemo(() => {
    const map = new Map<string, string>()
    for (const type of types.data ?? []) map.set(type.id, type.name)
    return map
  }, [types.data])

  const tabs: TabItem[] = [
    { key: 'requests', label: 'Requests' },
    { key: 'types', label: 'Leave types' },
    { key: 'entitlements', label: 'Entitlement' },
  ]
  const active = tabs.some((item) => item.key === tab) ? tab : 'requests'

  const requestColumns: Column<LeaveRequest>[] = [
    {
      key: 'reference',
      header: 'Reference',
      className: 'tabular',
      cell: (row) => row.reference || <Blank />,
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => typeName.get(row.leave_type_id) ?? <Blank />,
    },
    {
      key: 'dates',
      header: 'Dates',
      className: 'tabular',
      cell: (row) => (
        <>
          {formatDate(row.start_on)} – {formatDate(row.end_on)}
          {(row.starts_half_day || row.ends_half_day) && (
            <span className="text-gray-600"> · half day</span>
          )}
        </>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.submitted_at ? formatDate(row.submitted_at) : <Blank />),
    },
    { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      width: '11rem',
      /* Only a PENDING request can be decided or cancelled — the API refuses
       * the rest, so the buttons are not drawn for them. */
      cell: (row) =>
        row.status === 'pending' && canManage ? (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" onClick={() => setDeciding(row)}>
              Decide
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={cancel.isPending && cancel.variables === row.id}
              onClick={() => cancel.mutate(row.id)}
            >
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ]

  const typeColumns: Column<LeaveType>[] = [
    { key: 'name', header: 'Type', cell: (row) => row.name },
    {
      key: 'code',
      header: 'Code',
      width: '8rem',
      cell: (row) => (row.code ? <span className="font-mono text-[0.6875rem]">{row.code}</span> : <Blank />),
    },
    {
      key: 'entitlement',
      header: 'Default entitlement',
      cell: (row) => formatDays(row.default_entitlement_days_x100),
    },
    { key: 'paid', header: 'Paid', width: '7rem', cell: (row) => <Flag on={row.is_paid}>{row.is_paid ? 'Paid' : 'Unpaid'}</Flag> },
    {
      key: 'approval',
      header: 'Approval',
      width: '10rem',
      cell: (row) => (
        <Flag on={row.requires_approval}>{row.requires_approval ? 'Required' : 'Automatic'}</Flag>
      ),
    },
    {
      key: 'notice',
      header: 'Notice',
      width: '8rem',
      className: 'tabular',
      cell: (row) => (row.min_notice_days > 0 ? `${row.min_notice_days} days` : <span className="text-gray-500">None</span>),
    },
    { key: 'status', header: 'Status', width: '7rem', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  const entitlementColumns: Column<LeaveEntitlement>[] = [
    { key: 'type', header: 'Type', cell: (row) => typeName.get(row.leave_type_id) ?? <Blank /> },
    {
      key: 'period',
      header: 'Period',
      className: 'tabular',
      cell: (row) => `${formatDate(row.period_start)} – ${formatDate(row.period_end)}`,
    },
    { key: 'entitled', header: 'Entitled', cell: (row) => formatDays(row.entitled_days_x100) },
    { key: 'taken', header: 'Taken', cell: (row) => formatDays(row.taken_days_x100) },
    { key: 'pending', header: 'Pending', cell: (row) => formatDays(row.pending_days_x100) },
    {
      key: 'remaining',
      header: 'Remaining',
      cell: (row) => (
        <span className="font-medium text-gray-900">{formatDays(row.remaining_days_x100)}</span>
      ),
    },
  ]

  return (
    <PageStack>
      <PageHeader title="Human resources" />

      <div>
        <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />

        <div
          role="tabpanel"
          id={panelId(tabsId, active)}
          aria-labelledby={`${tabsId}-tab-${active}`}
        >
          {active === 'requests' && (
            <>
              <Toolbar
                filters={
                  <div className="w-40">
                    <Select
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value)
                        setPage(1)
                      }}
                      aria-label="Filter by status"
                      options={[
                        { value: '', label: 'Any status' },
                        ...LEAVE_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
                      ]}
                    />
                  </div>
                }
              />
              {requests.isError ? (
                <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
              ) : (
                <>
                  <DataTable
                    rows={requests.data?.rows ?? []}
                    columns={requestColumns}
                    rowKey={(row) => row.id}
                    loading={requests.isLoading}
                    skeletonRows={6}
                    empty={
                      <EmptyState
                        icon={<Sun size={20} />}
                        title={status ? 'No requests with this status' : 'No leave has been requested'}
                        description="Applications appear here as staff submit them."
                      />
                    }
                  />
                  {requests.data?.pagination && (
                    <Pagination pagination={requests.data.pagination} onPageChange={setPage} />
                  )}
                </>
              )}
            </>
          )}

          {active === 'types' && (
            <>
              <Toolbar
                actions={
                  perms.has('hr.manage') ? (
                    <Button
                      variant="primary"
                      icon={<Plus size={14} weight="bold" />}
                      onClick={() => setCreatingType(true)}
                    >
                      New leave type
                    </Button>
                  ) : null
                }
              />
              {types.isError ? (
                <ErrorState error={types.error} onRetry={() => types.refetch()} />
              ) : (
                <DataTable
                  rows={types.data ?? []}
                  columns={typeColumns}
                  rowKey={(row) => row.id}
                  loading={types.isLoading}
                  skeletonRows={4}
                  empty={
                    <EmptyState
                      icon={<Sun size={20} />}
                      title="No leave types defined"
                      description="A type decides whether leave is paid, needs approval, and how much is granted by default. Nothing can be requested until one exists."
                      action={
                        perms.has('hr.manage') ? (
                          <Button variant="primary" onClick={() => setCreatingType(true)}>
                            New leave type
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
              )}
            </>
          )}

          {active === 'entitlements' && (
            <div className="pt-3">
              {entitlements.isError ? (
                <ErrorState error={entitlements.error} onRetry={() => entitlements.refetch()} />
              ) : (
                <DataTable
                  rows={entitlements.data?.rows ?? []}
                  columns={entitlementColumns}
                  rowKey={(row) => row.id}
                  loading={entitlements.isLoading}
                  skeletonRows={4}
                  empty={
                    <EmptyState
                      icon={<Sun size={20} />}
                      title="No entitlement granted"
                      description="Entitlement is granted per person, per leave type, for a period. A staff member's own record is the place to grant it."
                    />
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      <LeaveTypeDialog open={creatingType} onClose={() => setCreatingType(false)} />
      <DecideLeaveDialog request={deciding} onClose={() => setDeciding(undefined)} />
    </PageStack>
  )
}
