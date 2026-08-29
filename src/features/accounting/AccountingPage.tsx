import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bank, Scales } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatMoney, humanize } from '@/shared/lib/format'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Blank,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  panelId,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { JournalEntryPanel } from './JournalEntryPanel'
import { accountingApi, accountingKeys, type JournalQuery } from './accounting.api'
import {
  LEDGER_ACCOUNT_TYPES,
  type JournalEntry,
  type LedgerAccount,
} from './accounting.types'

/**
 * The institution's books.
 *
 * Three views of one thing, which is why they are tabs rather than three rail
 * items: the chart is what accounts exist, the journal is what was posted, and
 * the trial balance is the arithmetic check that the second agrees with itself.
 *
 * Nothing here writes. The ledger is written by the acts it records — a payroll
 * run posting, an invoice raised — so there is no "New entry" button and there
 * should not be one.
 */
export function AccountingPage() {
  const tabsId = useId()
  const [tab, setTab] = useState('chart')

  const tabs: TabItem[] = [
    { key: 'chart', label: 'Chart of accounts' },
    { key: 'journal', label: 'Journal' },
    { key: 'trial', label: 'Trial balance' },
  ]
  const active = tabs.some((t) => t.key === tab) ? tab : 'chart'

  return (
    <PageStack>
      <PageHeader
        title="Accounting"
        description="The chart of accounts, everything posted to it, and the check that the two agree. Entries are written by the acts that cause them — nothing here can be edited."
      />

      <div>
        <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />
        <div
          role="tabpanel"
          id={panelId(tabsId, active)}
          aria-labelledby={`${tabsId}-tab-${active}`}
        >
          {active === 'chart' && <ChartOfAccounts />}
          {active === 'journal' && <Journal />}
          {active === 'trial' && <TrialBalanceView />}
        </div>
      </div>
    </PageStack>
  )
}

/* ── Chart of accounts ───────────────────────────────────────────────────── */

function ChartOfAccounts() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')

  const query = useMemo(
    () => ({ search: search || undefined, type: type || undefined, per_page: 100 }),
    [search, type],
  )

  const accounts = useQuery({
    queryKey: accountingKeys.accounts(query),
    queryFn: () => accountingApi.accounts(query),
    placeholderData: (previous) => previous,
  })

  const columns: Column<LedgerAccount>[] = [
    {
      key: 'code',
      header: 'Code',
      width: '7rem',
      className: 'tabular',
      cell: (row) => <span className="font-mono text-[0.6875rem]">{row.code}</span>,
    },
    { key: 'name', header: 'Account', cell: (row) => row.name },
    { key: 'type', header: 'Type', width: '8rem', cell: (row) => humanize(row.type) },
    {
      key: 'side',
      header: 'Increases on',
      width: '9rem',
      /* Shown because it is what turns two totals into a balance, and a reader
       * checking a sign needs to see which side the account sits on. */
      cell: (row) => humanize(row.normal_balance),
    },
    {
      key: 'debit',
      header: 'Debits',
      numeric: true,
      cell: (row) =>
        row.debit_minor === null ? <Blank /> : formatMoney(row.debit_minor, row.currency),
    },
    {
      key: 'credit',
      header: 'Credits',
      numeric: true,
      cell: (row) =>
        row.credit_minor === null ? <Blank /> : formatMoney(row.credit_minor, row.currency),
    },
    {
      key: 'balance',
      header: 'Balance',
      numeric: true,
      /* Signed by the API the way the account's own side reads: positive means
       * the account holds what it is supposed to hold. A negative here is a
       * genuine anomaly, so it is the one figure that gets colour. */
      cell: (row) =>
        row.balance_minor === null ? (
          <Blank />
        ) : (
          <span
            className={cn(
              'font-medium',
              row.balance_minor < 0 ? 'text-danger-500' : 'text-gray-900',
            )}
          >
            {formatMoney(row.balance_minor, row.currency)}
          </span>
        ),
    },
    { key: 'status', header: 'Status', width: '7rem', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  if (accounts.isError) {
    return <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
  }

  return (
    <>
      <Toolbar
        filters={
          <>
            <div className="w-40">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Filter by account type"
                options={[
                  { value: '', label: 'Any type' },
                  ...LEDGER_ACCOUNT_TYPES.map((t) => ({ value: t, label: humanize(t) })),
                ]}
              />
            </div>
            {(search || type) && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setType('')
                }}
              >
                Clear filters
              </Button>
            )}
          </>
        }
        actions={
          <div className="w-56">
            <SearchInput
              className="w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts"
              aria-label="Search accounts by code or name"
            />
          </div>
        }
      />

      <DataTable
        rows={accounts.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={accounts.isLoading}
        skeletonRows={8}
        empty={
          <EmptyState
            icon={<Bank size={20} />}
            title={search || type ? 'No accounts match' : 'No chart of accounts yet'}
            description={
              search || type
                ? 'Nothing in the chart answers to this search and this type together.'
                : 'The chart is created when the institution starts keeping double-entry books. Accounts are added by the API rather than from this screen.'
            }
          />
        }
      />
    </>
  )
}

/* ── Journal ─────────────────────────────────────────────────────────────── */

function Journal() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = useMemo<JournalQuery>(
    () => ({
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search, from, to, page],
  )

  const entries = useQuery({
    queryKey: accountingKeys.entries(query),
    queryFn: () => accountingApi.entries(query),
    placeholderData: (previous) => previous,
  })

  const rows = entries.data?.rows ?? []

  const columns: Column<JournalEntry>[] = [
    {
      key: 'number',
      header: 'Entry',
      width: '9rem',
      className: 'tabular',
      cell: (row) => <span className="font-mono text-[0.6875rem]">{row.entry_number}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.entry_date ? formatDate(row.entry_date) : <Blank />),
    },
    { key: 'description', header: 'Description', cell: (row) => row.description },
    {
      key: 'source',
      header: 'Source',
      width: '9rem',
      cell: (row) => (row.source_type ? humanize(row.source_type) : <Blank />),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      /* One figure, not two. A balanced entry has the same total on each side,
       * and showing both invites a reader to compare them by eye when
       * `is_balanced` has already done it exactly. */
      cell: (row) => formatMoney(row.total_debit_minor, row.currency),
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <StatusBadge status={row.status} />
          {!row.is_balanced && (
            <span className="text-xs font-medium text-danger-500" title="Debits do not equal credits">
              unbalanced
            </span>
          )}
        </span>
      ),
    },
  ]

  if (entries.isError) {
    return <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
  }

  return (
    <>
      <Toolbar
        filters={
          <>
            <div className="w-40">
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
                aria-label="From date"
              />
            </div>
            <div className="w-40">
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
                aria-label="To date"
              />
            </div>
            {(search || from || to) && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setFrom('')
                  setTo('')
                  setPage(1)
                }}
              >
                Clear filters
              </Button>
            )}
          </>
        }
        actions={
          <div className="w-56">
            <SearchInput
              className="w-full"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search the journal"
              aria-label="Search by entry number or description"
            />
          </div>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        loading={entries.isLoading}
        skeletonRows={8}
        onRowClick={(row) => setSelectedId(row.id)}
        selectedIds={selectedId ? new Set([selectedId]) : undefined}
        className={entries.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
        empty={
          <EmptyState
            icon={<Bank size={20} />}
            title="Nothing has been posted"
            description="Entries appear as the acts that cause them happen — a payroll run posted to the ledger, an invoice raised."
          />
        }
      />

      {entries.data?.pagination && (
        <Pagination pagination={entries.data.pagination} onPageChange={setPage} />
      )}

      {/* The lines live on the detail endpoint, so the panel fetches its own
          entry rather than reading one the list never carried. */}
      <JournalEntryPanel entryId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}

/* ── Trial balance ───────────────────────────────────────────────────────── */

function TrialBalanceView() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const window = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to])

  const trial = useQuery({
    queryKey: accountingKeys.trialBalance(window),
    queryFn: () => accountingApi.trialBalance(window),
    placeholderData: (previous) => previous,
  })

  if (trial.isError) {
    return <ErrorState error={trial.error} onRetry={() => trial.refetch()} />
  }

  const data = trial.data
  const currency = data?.accounts[0]?.currency ?? 'NGN'

  const columns: Column<LedgerAccount>[] = [
    {
      key: 'code',
      header: 'Code',
      width: '7rem',
      cell: (row) => <span className="font-mono text-[0.6875rem]">{row.code}</span>,
    },
    { key: 'name', header: 'Account', cell: (row) => row.name },
    { key: 'type', header: 'Type', width: '8rem', cell: (row) => humanize(row.type) },
    {
      key: 'debit',
      header: 'Debit',
      numeric: true,
      /* A dash rather than a zero on the side an account did not move: a
       * column of zeroes is what makes a paper trial balance unreadable. */
      cell: (row) =>
        row.debit_minor ? formatMoney(row.debit_minor, row.currency) : <Blank />,
    },
    {
      key: 'credit',
      header: 'Credit',
      numeric: true,
      cell: (row) =>
        row.credit_minor ? formatMoney(row.credit_minor, row.currency) : <Blank />,
    },
  ]

  return (
    <>
      <Toolbar
        filters={
          <>
            <div className="w-40">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
            </div>
            <div className="w-40">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
            {(from || to) && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
              >
                Clear window
              </Button>
            )}
          </>
        }
      />

      {data && data.accounts.length > 0 && (
        <Card
          className={cn(
            'mb-5 flex flex-wrap items-center justify-between gap-4 px-4 py-3',
            !data.is_balanced && 'border-danger-300',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md',
                data.is_balanced ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-500',
              )}
            >
              <Scales size={15} />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {data.is_balanced ? 'The books balance' : 'The books do not balance'}
              </p>
              <p className="text-xs text-gray-600">
                {data.is_balanced
                  ? 'Debits equal credits across every account with a movement.'
                  : 'Debits and credits disagree. Every posted entry should be balanced — check the journal.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-gray-600">Debits</p>
              <p className="text-sm font-medium text-gray-900 tabular">
                {formatMoney(data.total_debit_minor, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Credits</p>
              <p className="text-sm font-medium text-gray-900 tabular">
                {formatMoney(data.total_credit_minor, currency)}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className={trial.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
        <CardHeader
          title="Trial balance"
          subtitle={
            data?.from || data?.to
              ? `Struck ${data.from ? `from ${formatDate(data.from)}` : ''}${data.from && data.to ? ' ' : ''}${data.to ? `to ${formatDate(data.to)}` : ''}`
              : 'Every account with a movement, all time.'
          }
        />
        <DataTable
          rows={data?.accounts ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          loading={trial.isLoading}
          skeletonRows={5}
          className="border-0"
          empty={
            <EmptyState
              icon={<Scales size={20} />}
              title="Nothing to balance"
              description="An account appears here once something has been posted to it. Accounts with no movement are lines in the chart, not lines in a trial balance."
            />
          }
        />
      </Card>
    </>
  )
}
