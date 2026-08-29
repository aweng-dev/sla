import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Coins, Plus } from '@phosphor-icons/react'
import {
  Avatar,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterPill,
  Menu,
  Pagination,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { formatDate } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys } from './finance.api'
import { Money } from './components/money'
import { methodLabel, PaymentStatusPill } from './components/StatusPill'
import { RecordPaymentDialog } from './dialogs/PaymentDialogs'
import type { Payment, PaymentStatus } from './finance.types'

const STATUSES: { value: PaymentStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'pending', label: 'Unconfirmed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed', label: 'Failed' },
  { value: 'reversed', label: 'Reversed' },
]

/** Money received, and what it has been applied to. */
export function PaymentsTab() {
  const t = useTerminology()
  const perms = usePermissions()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PaymentStatus | ''>('')
  const [recording, setRecording] = useState(false)

  const query = useQuery({
    queryKey: financeKeys.payments({ page, status }),
    queryFn: () => financeApi.payments({ page, per_page: 25, status: status || undefined }),
    placeholderData: (prev) => prev,
  })

  const columns: Column<Payment>[] = [
    {
      key: 'reference',
      header: 'Reference',
      cell: (row) => <span className="tabular text-gray-900">{row.reference}</span>,
    },
    {
      key: 'student',
      header: t('learner'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.student.name} size="md" />
          <span className="truncate">{row.student.name}</span>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{methodLabel(row.method)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (row) => <PaymentStatusPill status={row.status} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      width: '9rem',
      cell: (row) => <Money minor={row.amount_minor} currency={row.currency} emphasis />,
    },
    {
      key: 'unallocated',
      header: 'Unapplied',
      numeric: true,
      width: '9rem',
      /* Credit sitting on the account. Worth its own column: it is the number
       * a bursar chases when a parent says they have paid. */
      cell: (row) => (
        <Money
          minor={row.unallocated_minor}
          currency={row.currency}
          emphasis={row.unallocated_minor > 0}
          muted={row.unallocated_minor === 0}
        />
      ),
    },
    {
      key: 'paid_at',
      header: 'Received',
      numeric: true,
      width: '8rem',
      cell: (row) =>
        row.paid_at ? formatDate(row.paid_at) : <span className="text-gray-500">—</span>,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []
  const isEmpty = !query.isLoading && rows.length === 0

  return (
    <>
      <Toolbar
        filters={
          <Menu
            align="start"
            items={STATUSES.map((s) => ({
              key: s.value || 'any',
              label: s.label,
              onSelect: () => {
                setStatus(s.value)
                setPage(1)
              },
            }))}
            trigger={({ toggle, ref, open }) => (
              <FilterPill
                ref={ref as never}
                label={STATUSES.find((s) => s.value === status)?.label ?? 'Any status'}
                open={open}
                active={status !== ''}
                onClick={toggle}
              />
            )}
          />
        }
        actions={
          perms.has('finance.manage') && (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setRecording(true)}
            >
              Record payment
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<Coins size={20} />}
          title={status ? 'No payment matches that status' : 'No payments recorded'}
          description={
            status
              ? 'Clear the filter to see the rest.'
              : 'Record a payment when money arrives — by transfer, card, cash, or as a waiver. It can be applied to invoices afterwards.'
          }
          action={
            status ? (
              <Button
                onClick={() => {
                  setStatus('')
                  setPage(1)
                }}
              >
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={8}
            rowHref={(row) => `/finance/payments/${row.id}`}
            onRowClick={(row) =>
              navigate({ to: '/finance/payments/$paymentId', params: { paymentId: row.id } })
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <RecordPaymentDialog open={recording} onClose={() => setRecording(false)} />
    </>
  )
}
