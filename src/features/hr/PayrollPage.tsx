import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Calculator, Plus, Receipt } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions } from '@/features/tenant/TenantProvider'
import {
  Blank,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Flag,
  Menu,
  PageHeader,
  panelId,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { PayrollPeriodDialog } from './HrDialogs'
import { hrKeys, payrollApi } from './hr.api'
import { formatDays, type PayrollPeriod, type PayrollRun, type Payslip } from './hr.types'

/**
 * Payroll: the periods, the runs against them, and the payslips they produce.
 *
 * ── The run is a state machine, and the API is the authority on it ─────────
 *
 *   draft → calculate → approve → post, with cancel available until posted
 *   and payslips published after.
 *
 * The run carries `is_recalculable`, `is_approved` and `is_posted`, which are
 * the API's own reading of where it stands. The action menu is built from
 * those three booleans rather than from `status`, so a state this client has
 * not been taught about still produces the right buttons instead of the wrong
 * ones.
 */
export function PayrollPage() {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const tabsId = useId()

  const [tab, setTab] = useState('periods')
  const [creatingPeriod, setCreatingPeriod] = useState(false)

  const canManage = perms.has('payroll.manage')

  const periods = useQuery({
    queryKey: hrKeys.payrollPeriods,
    queryFn: payrollApi.periods,
    staleTime: 60_000,
  })

  const runs = useQuery({
    queryKey: hrKeys.payrollRuns({}),
    queryFn: () => payrollApi.runs(),
    enabled: tab === 'runs',
  })

  const payslips = useQuery({
    queryKey: hrKeys.payslips({}),
    queryFn: () => payrollApi.payslips(),
    enabled: tab === 'payslips',
  })

  const periodName = useMemo(() => {
    const map = new Map<string, string>()
    for (const period of periods.data ?? []) map.set(period.id, period.name)
    return map
  }, [periods.data])

  function runMutation(label: string, fn: (id: string) => Promise<unknown>) {
    return {
      label,
      run: (id: string) =>
        fn(id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: hrKeys.all })
            toast.success(label)
          })
          .catch((error: unknown) =>
            toast.error(error instanceof ApiError ? error.rootMessage() : `${label} failed.`),
          ),
    }
  }

  const closePeriod = useMutation({
    mutationFn: (id: string) => payrollApi.closePeriod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.all })
      toast.success('Period closed')
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be closed.'),
  })

  const tabs: TabItem[] = [
    { key: 'periods', label: 'Periods' },
    { key: 'runs', label: 'Runs' },
    { key: 'payslips', label: 'Payslips' },
  ]
  const active = tabs.some((item) => item.key === tab) ? tab : 'periods'

  const periodColumns: Column<PayrollPeriod>[] = [
    { key: 'name', header: 'Period', cell: (row) => row.name },
    {
      key: 'code',
      header: 'Code',
      width: '8rem',
      cell: (row) => (row.code ? <span className="font-mono text-[0.6875rem]">{row.code}</span> : <Blank />),
    },
    { key: 'frequency', header: 'Frequency', width: '8rem', cell: (row) => humanize(row.frequency) },
    {
      key: 'window',
      header: 'Covers',
      className: 'tabular',
      cell: (row) => `${formatDate(row.starts_on)} – ${formatDate(row.ends_on)}`,
    },
    { key: 'pay_date', header: 'Pay day', className: 'tabular', width: '9rem', cell: (row) => formatDate(row.pay_date) },
    {
      key: 'accepts',
      header: 'Open to runs',
      width: '9rem',
      cell: (row) => <Flag on={row.accepts_runs}>{row.accepts_runs ? 'Open' : 'Closed'}</Flag>,
    },
    { key: 'status', header: 'Status', width: '7rem', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      width: '7rem',
      cell: (row) =>
        canManage && row.accepts_runs ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={closePeriod.isPending && closePeriod.variables === row.id}
              onClick={() => closePeriod.mutate(row.id)}
            >
              Close
            </Button>
          </div>
        ) : null,
    },
  ]

  const runColumns: Column<PayrollRun>[] = [
    {
      key: 'run',
      header: 'Run',
      cell: (row) => (
        <span>
          {periodName.get(row.payroll_period_id) ?? 'Period'}
          {row.run_number !== null && <span className="text-gray-600"> · #{row.run_number}</span>}
        </span>
      ),
    },
    {
      key: 'payslips',
      header: 'Payslips',
      width: '7rem',
      className: 'tabular',
      cell: (row) => row.payslip_count,
    },
    { key: 'gross', header: 'Gross', numeric: true, cell: (row) => formatMoney(row.gross_minor, row.currency) },
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
      key: 'actions',
      header: '',
      width: '5rem',
      cell: (row) => {
        if (!canManage) return null

        /* Built from the API's own booleans, not from `status`. */
        const items = []
        if (row.is_recalculable) {
          items.push({
            key: 'calculate',
            label: row.calculated_at ? 'Recalculate' : 'Calculate',
            icon: <Calculator size={15} />,
            onSelect: () => runMutation('Run calculated', payrollApi.calculate).run(row.id),
          })
        }
        if (!row.is_approved && row.calculated_at) {
          items.push({
            key: 'approve',
            label: 'Approve',
            onSelect: () => runMutation('Run approved', payrollApi.approve).run(row.id),
          })
        }
        if (row.is_approved && !row.is_posted) {
          items.push({
            key: 'post',
            label: 'Post to the ledger',
            onSelect: () => runMutation('Run posted', payrollApi.post).run(row.id),
          })
        }
        if (row.is_posted) {
          items.push({
            key: 'publish',
            label: 'Publish payslips',
            onSelect: () => runMutation('Payslips published', payrollApi.publishPayslips).run(row.id),
          })
        }
        if (!row.is_posted && !row.cancelled_at) {
          items.push({
            key: 'cancel',
            label: 'Cancel run',
            destructive: true,
            separated: true,
            /* The API requires a reason and refuses without one, so this asks
             * rather than sending an empty string it would reject. */
            onSelect: () => {
              const reason = window.prompt('Why is this run being cancelled?')
              if (reason && reason.trim().length >= 3) {
                payrollApi
                  .cancel(row.id, reason.trim())
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: hrKeys.all })
                    toast.success('Run cancelled')
                  })
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof ApiError ? error.rootMessage() : 'The run could not be cancelled.',
                    ),
                  )
              } else if (reason !== null) {
                toast.error('A reason of at least three characters is required.')
              }
            },
          })
        }

        if (items.length === 0) return null

        return (
          <div className="flex justify-end">
            <Menu
              items={items}
              trigger={({ toggle, ref }) => (
                <Button ref={ref as never} size="sm" onClick={toggle}>
                  Actions
                </Button>
              )}
            />
          </div>
        )
      },
    },
  ]

  const payslipColumns: Column<Payslip>[] = [
    {
      key: 'reference',
      header: 'Reference',
      className: 'tabular',
      cell: (row) => row.reference || <Blank />,
    },
    { key: 'basic', header: 'Basic', numeric: true, cell: (row) => formatMoney(row.basic_minor, row.currency) },
    { key: 'gross', header: 'Gross', numeric: true, cell: (row) => formatMoney(row.gross_minor, row.currency) },
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
    {
      key: 'unpaid',
      header: 'Unpaid leave',
      cell: (row) =>
        row.unpaid_leave_days_x100 > 0 ? formatDays(row.unpaid_leave_days_x100) : <Blank />,
    },
    { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  return (
    <PageStack>
      <PageHeader title="Payroll"
        tabs={
          <Tabs bare items={tabs} value={active} onChange={setTab} baseId={tabsId} />
        }
      />

      <div>
        <div
          role="tabpanel"
          id={panelId(tabsId, active)}
          aria-labelledby={`${tabsId}-tab-${active}`}
        >
          {active === 'periods' && (
            <>
              <Toolbar
                actions={
                  canManage ? (
                    <Button
                      variant="primary"
                      trailing={<Plus size={16} weight="bold" />}
                      onClick={() => setCreatingPeriod(true)}
                    >
                      New period
                    </Button>
                  ) : null
                }
              />
              {periods.isError ? (
                <ErrorState error={periods.error} onRetry={() => periods.refetch()} />
              ) : (
                <DataTable
                  rows={periods.data ?? []}
                  columns={periodColumns}
                  rowKey={(row) => row.id}
                  loading={periods.isLoading}
                  skeletonRows={4}
                  empty={
                    <EmptyState
                      icon={<Receipt size={20} />}
                      title="No payroll periods yet"
                      description="A period is the window a run covers and the day people are paid. Nothing can be calculated until one exists."
                      action={
                        canManage ? (
                          <Button variant="primary" onClick={() => setCreatingPeriod(true)}>
                            New period
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
              )}
            </>
          )}

          {active === 'runs' && (
            <div className="pt-3">
              {runs.isError ? (
                <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
              ) : (
                <DataTable
                  rows={runs.data?.rows ?? []}
                  columns={runColumns}
                  rowKey={(row) => row.id}
                  loading={runs.isLoading}
                  skeletonRows={4}
                  empty={
                    <EmptyState
                      icon={<Calculator size={20} />}
                      title="No runs yet"
                      description="A run calculates one period for one campus. It is calculated, approved, then posted to the ledger."
                    />
                  }
                />
              )}
            </div>
          )}

          {active === 'payslips' && (
            <div className="pt-3">
              {payslips.isError ? (
                <ErrorState error={payslips.error} onRetry={() => payslips.refetch()} />
              ) : (
                <DataTable
                  rows={payslips.data?.rows ?? []}
                  columns={payslipColumns}
                  rowKey={(row) => row.id}
                  loading={payslips.isLoading}
                  skeletonRows={4}
                  empty={
                    <EmptyState
                      icon={<Receipt size={20} />}
                      title="No payslips yet"
                      description="Payslips appear once a run has been calculated."
                    />
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      <PayrollPeriodDialog open={creatingPeriod} onClose={() => setCreatingPeriod(false)} />
    </PageStack>
  )
}
