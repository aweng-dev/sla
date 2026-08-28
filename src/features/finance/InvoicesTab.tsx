import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Receipt } from '@phosphor-icons/react'
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
import { Money, PaidBar } from './components/money'
import { InvoiceStatusPill } from './components/StatusPill'
import { GenerateInvoiceDialog } from './dialogs/InvoiceDialogs'
import type { Invoice, InvoiceStatus } from './finance.types'

const STATUSES: { value: InvoiceStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Awaiting payment' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

/** Every charge raised against a learner. */
export function InvoicesTab({ sessionId }: { sessionId?: string }) {
  const t = useTerminology()
  const perms = usePermissions()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [outstanding, setOutstanding] = useState(false)
  const [generating, setGenerating] = useState(false)

  const query = useQuery({
    queryKey: financeKeys.invoices({ page, status, outstanding, sessionId }),
    queryFn: () =>
      financeApi.invoices({
        page,
        per_page: 25,
        status: status || undefined,
        outstanding: outstanding || undefined,
        academic_session_id: sessionId,
      }),
    placeholderData: (prev) => prev,
  })

  const columns: Column<Invoice>[] = [
    {
      key: 'invoice_number',
      header: 'Invoice',
      cell: (row) => <span className="tabular text-gray-900">{row.invoice_number}</span>,
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
      key: 'status',
      header: 'Status',
      width: '10rem',
      cell: (row) => <InvoiceStatusPill status={row.status} />,
    },
    {
      key: 'total',
      header: 'Charged',
      numeric: true,
      width: '9rem',
      cell: (row) => <Money minor={row.total_minor} currency={row.currency} />,
    },
    {
      key: 'paid',
      header: 'Paid',
      width: '11rem',
      cell: (row) => (
        <PaidBar paid={row.paid_minor} total={row.total_minor} currency={row.currency} />
      ),
    },
    {
      key: 'balance',
      header: 'Outstanding',
      numeric: true,
      width: '9rem',
      cell: (row) => (
        <Money
          minor={row.balance_minor}
          currency={row.currency}
          emphasis={row.balance_minor > 0}
          muted={row.balance_minor === 0}
        />
      ),
    },
    {
      key: 'due_on',
      header: 'Due',
      numeric: true,
      width: '8rem',
      cell: (row) =>
        row.due_on ? formatDate(row.due_on) : <span className="text-gray-500">—</span>,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []
  const filtered = status !== '' || outstanding
  const isEmpty = !query.isLoading && rows.length === 0

  return (
    <>
      <Toolbar
        filters={
          <>
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
            <button
              type="button"
              aria-pressed={outstanding}
              onClick={() => {
                setOutstanding((v) => !v)
                setPage(1)
              }}
              className={
                outstanding
                  ? 'h-8 rounded-md border border-gray-400 bg-gray-100 px-2.5 text-sm text-gray-900'
                  : 'h-8 rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-800 transition-colors hover:bg-gray-50'
              }
            >
              Outstanding only
            </button>
          </>
        }
        actions={
          perms.has('finance.manage') && (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setGenerating(true)}
            >
              Generate invoice
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<Receipt size={20} />}
          title={filtered ? 'No invoice matches those filters' : 'No invoices yet'}
          description={
            filtered
              ? 'Clear the filters to see the rest of the ledger.'
              : `An invoice is generated from the fee structure assigned to a ${t('learner').toLowerCase()} for a session. Assign a structure first, then generate.`
          }
          action={
            filtered ? (
              <Button
                onClick={() => {
                  setStatus('')
                  setOutstanding(false)
                  setPage(1)
                }}
              >
                Clear filters
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
            rowHref={(row) => `/finance/invoices/${row.id}`}
            onRowClick={(row) =>
              navigate({ to: '/finance/invoices/$invoiceId', params: { invoiceId: row.id } })
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <GenerateInvoiceDialog open={generating} onClose={() => setGenerating(false)} />
    </>
  )
}
