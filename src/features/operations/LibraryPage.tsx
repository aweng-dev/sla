import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowCounterClockwise,
  ArrowUUpLeft,
  Books,
  BookOpen,
  Coins,
  Prohibit,
  Warning,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CellStack,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  ReasonDialog,
  Segmented,
  Select,
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, formatNumber, formatRelative, humanize } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { SearchInput } from '@/shared/ui'
import { ModuleGate } from './components/ModuleGate'
import {
  libraryApi,
  libraryKeys,
  type FineStatus,
  type LibraryFine,
  type LibraryLoan,
  type LibraryMember,
  type LibraryTitle,
  type MemberStatus,
} from './library.api'

/**
 * The circulation desk.
 *
 * ── Loans come first because the desk is a queue ───────────────────────────
 *
 * A librarian's screen is not a catalogue. It is "what is out, what is late, and
 * who has it" — the catalogue is what you consult when somebody asks for a book,
 * which is the second thing that happens, not the first. So Loans is the landing
 * tab and it opens on the outstanding ones.
 *
 * ── The overdue sweep is a page action, not a row action ───────────────────
 *
 * `POST /loans/overdue-sweep` assesses every loan past its date in one pass and
 * raises the fines. It belongs beside the page title, run once at the start of a
 * day, and its result is reported rather than assumed: a sweep that found
 * nothing is a real answer and must not read as a failure.
 *
 * ── `days_overdue` is the API's number ─────────────────────────────────────
 *
 * Never one this screen derives by comparing `due_at` to the clock. The server
 * knows the grace period; a browser in another timezone does not, and a table
 * that said "2 days late" beside a fine assessed for one would be the kind of
 * disagreement somebody has to explain to a parent.
 */

const TABS_ID = 'library-tabs'

type TabKey = 'loans' | 'catalogue' | 'members' | 'fines'

export function LibraryPage() {
  const [tab, setTab] = useState<TabKey>('loans')
  const queryClient = useQueryClient()
  const permissions = usePermissions()

  const canManage = permissions.hasAny('library.manage', 'library.circulate')

  const tabs: TabItem[] = [
    { key: 'loans', label: 'Loans' },
    { key: 'catalogue', label: 'Catalogue' },
    { key: 'members', label: 'Members' },
    { key: 'fines', label: 'Fines' },
  ]

  const sweep = useMutation({
    mutationFn: () => libraryApi.sweep(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.root })

      const marked = Number(result.loans_marked_overdue ?? 0)
      const fines = Number(result.fines_assessed ?? 0)

      toast.success(
        marked === 0 && fines === 0
          ? 'Nothing is overdue.'
          : `${formatNumber(marked)} ${marked === 1 ? 'loan' : 'loans'} marked overdue, ${formatNumber(fines)} ${fines === 1 ? 'fine' : 'fines'} assessed.`,
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'The sweep did not run.')
    },
  })

  return (
    <ModuleGate
      module="library"
      title="Library"
      offTitle="This institution does not run a library"
      offDescription="The library module is switched off here. An administrator can enable it from the institution's modules."
      actions={
        canManage ? (
          <Button
            icon={<ArrowCounterClockwise size={15} />}
            loading={sweep.isPending}
            onClick={() => sweep.mutate()}
          >
            Run overdue sweep
          </Button>
        ) : undefined
      }
    >
      <div>
        <Tabs items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} baseId={TABS_ID} />

        <Panel id="loans" tab={tab}>
          <LoansTab canManage={canManage} />
        </Panel>
        <Panel id="catalogue" tab={tab}>
          <CatalogueTab />
        </Panel>
        <Panel id="members" tab={tab}>
          <MembersTab canManage={canManage} />
        </Panel>
        <Panel id="fines" tab={tab}>
          <FinesTab canManage={canManage} />
        </Panel>
      </div>
    </ModuleGate>
  )
}

function Panel({ id, tab, children }: { id: TabKey; tab: TabKey; children: React.ReactNode }) {
  if (tab !== id) return null
  return (
    <div
      role="tabpanel"
      id={panelId(TABS_ID, id)}
      aria-labelledby={`${TABS_ID}-tab-${id}`}
      className="pt-4"
    >
      {children}
    </div>
  )
}

/* ── Loans ───────────────────────────────────────────────────────────────── */

function LoansTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<'outstanding' | 'overdue' | 'all'>('outstanding')
  const [page, setPage] = useState(1)

  const params = useMemo(
    () => ({
      outstanding: scope === 'outstanding',
      overdue: scope === 'overdue',
      page,
    }),
    [scope, page],
  )

  const loans = useQuery({
    queryKey: libraryKeys.loans(params),
    queryFn: () => libraryApi.loans(params),
    placeholderData: (previous) => previous,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: libraryKeys.root })
  }

  const returnLoan = useMutation({
    mutationFn: (loan: LibraryLoan) => libraryApi.returnLoan(loan.id, {}),
    onSuccess: (loan) => {
      refresh()
      toast.success(
        loan.days_overdue > 0
          ? `Returned ${formatNumber(loan.days_overdue)} ${loan.days_overdue === 1 ? 'day' : 'days'} late. A fine was assessed.`
          : 'Returned.',
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be returned.')
    },
  })

  const renewLoan = useMutation({
    mutationFn: (loan: LibraryLoan) => libraryApi.renewLoan(loan.id),
    onSuccess: (loan) => {
      refresh()
      toast.success(`Renewed. Now due ${formatDate(loan.due_at)}.`)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be renewed.')
    },
  })

  const rows = loans.data?.rows ?? []
  const overdueCount = rows.filter((row) => row.days_overdue > 0).length

  const columns: Column<LibraryLoan>[] = [
    {
      key: 'copy',
      header: 'Copy',
      cell: (row) => (
        <CellStack
          primary={row.copy?.title?.title ?? row.copy?.barcode ?? '—'}
          secondary={row.copy?.barcode}
        />
      ),
    },
    {
      key: 'member',
      header: 'Borrower',
      cell: (row) => (
        <CellStack
          primary={row.member?.person?.name ?? row.member?.student?.name ?? '—'}
          secondary={row.member?.member_number}
        />
      ),
    },
    {
      key: 'due',
      header: 'Due',
      cell: (row) =>
        row.days_overdue > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-danger-600">
            <Warning size={13} weight="fill" />
            {formatNumber(row.days_overdue)} {row.days_overdue === 1 ? 'day' : 'days'} late
          </span>
        ) : (
          <span className="text-sm text-gray-900" title={formatDate(row.due_at)}>
            {row.due_at ? formatRelative(row.due_at) : '—'}
          </span>
        ),
    },
    {
      key: 'renewals',
      header: 'Renewals',
      numeric: true,
      cell: (row) => formatNumber(row.renewal_count),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '10rem',
            cell: (row: LibraryLoan) =>
              row.is_outstanding ? (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ArrowUUpLeft size={14} />}
                    loading={returnLoan.isPending && returnLoan.variables?.id === row.id}
                    onClick={() => returnLoan.mutate(row)}
                  >
                    Return
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={renewLoan.isPending && renewLoan.variables?.id === row.id}
                    onClick={() => renewLoan.mutate(row)}
                  >
                    Renew
                  </Button>
                </div>
              ) : null,
          } satisfies Column<LibraryLoan>,
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="On loan"
          value={formatNumber(loans.data?.pagination.total ?? 0)}
          icon={<BookOpen size={16} />}
          loading={loans.isLoading}
        />
        <StatTile
          label="Late on this page"
          value={formatNumber(overdueCount)}
          hint={overdueCount > 0 ? 'Run the sweep to assess fines' : 'Nothing to chase'}
          icon={<Warning size={16} />}
          loading={loans.isLoading}
        />
        <StatTile
          label="Showing"
          value={scope === 'all' ? 'Everything' : scope === 'overdue' ? 'Late only' : 'Still out'}
          icon={<Books size={16} />}
        />
      </div>

      <Card>
        <Toolbar
          className="px-3"
          filters={
            <Segmented
              label="Which loans to show"
              value={scope}
              onChange={(value) => {
                setScope(value as typeof scope)
                setPage(1)
              }}
              options={[
                { value: 'outstanding', label: 'Still out' },
                { value: 'overdue', label: 'Late' },
                { value: 'all', label: 'All' },
              ]}
            />
          }
        />

        {loans.isError ? (
          <ErrorState error={loans.error} onRetry={() => loans.refetch()} />
        ) : (
          <>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              loading={loans.isLoading}
              empty={
                <EmptyState
                  icon={<BookOpen size={20} />}
                  title={scope === 'overdue' ? 'Nothing is late' : 'Nothing is out'}
                  description={
                    scope === 'overdue'
                      ? 'Every loan is within its due date.'
                      : 'Loans appear here as copies are issued at the desk.'
                  }
                />
              }
            />
            {loans.data && loans.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={loans.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

/* ── Catalogue ───────────────────────────────────────────────────────────── */

function CatalogueTab() {
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [page, setPage] = useState(1)

  const params = useMemo(
    () => ({ search, available: availableOnly, page }),
    [search, availableOnly, page],
  )

  const titles = useQuery({
    queryKey: libraryKeys.titles(params),
    queryFn: () => libraryApi.titles(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<LibraryTitle>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (row) => (
        <CellStack
          primary={row.title}
          secondary={[row.author, row.edition].filter(Boolean).join(' · ')}
        />
      ),
    },
    { key: 'isbn', header: 'ISBN', cell: (row) => row.isbn ?? '—' },
    {
      key: 'category',
      header: 'Category',
      cell: (row) => (row.category ? humanize(row.category) : '—'),
    },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      cell: (row) =>
        row.available_copy_count === undefined ? (
          '—'
        ) : row.available_copy_count === 0 ? (
          <Badge tone="neutral">All out</Badge>
        ) : (
          formatNumber(row.available_copy_count)
        ),
    },
  ]

  return (
    <Card>
      <Toolbar
        className="px-3"
        filters={
          <>
            <SearchInput
              value={draft}
              placeholder="Title, author, ISBN"
              onChange={(event) => {
                setDraft(event.currentTarget.value)
                setPage(1)
              }}
            />
            <Segmented
              label="Which titles to show"
              value={availableOnly ? 'available' : 'all'}
              onChange={(value) => {
                setAvailableOnly(value === 'available')
                setPage(1)
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'available', label: 'On the shelf' },
              ]}
            />
          </>
        }
      />

      {titles.isError ? (
        <ErrorState error={titles.error} onRetry={() => titles.refetch()} />
      ) : (
        <>
          <DataTable
            rows={titles.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={titles.isLoading}
            empty={
              <EmptyState
                icon={<Books size={20} />}
                title={search ? 'Nothing matches that' : 'The catalogue is empty'}
                description={
                  search
                    ? 'Try part of a title or an author.'
                    : 'Titles appear here as they are catalogued, each with its own copies.'
                }
              />
            }
          />
          {titles.data && titles.data.pagination.total > 0 && (
            <Pagination
              className="px-4"
              pagination={titles.data.pagination}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Card>
  )
}

/* ── Members ─────────────────────────────────────────────────────────────── */

function MembersTab({ canManage }: { canManage: boolean }) {
  const t = useTerminology()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<MemberStatus | ''>('')
  const [page, setPage] = useState(1)
  const [suspending, setSuspending] = useState<LibraryMember | null>(null)

  const params = useMemo(() => ({ status, page }), [status, page])

  const members = useQuery({
    queryKey: libraryKeys.members(params),
    queryFn: () => libraryApi.members(params),
    placeholderData: (previous) => previous,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: libraryKeys.root })
  }

  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      libraryApi.suspendMember(id, reason),
    onSuccess: () => {
      refresh()
      setSuspending(null)
      toast.success('Suspended. They cannot borrow until reinstated.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const reinstate = useMutation({
    mutationFn: (id: string) => libraryApi.reinstateMember(id),
    onSuccess: () => {
      refresh()
      toast.success('Reinstated.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const columns: Column<LibraryMember>[] = [
    {
      key: 'member',
      header: 'Member',
      cell: (row) => (
        <CellStack
          primary={row.person?.name ?? row.student?.name ?? row.member_number}
          secondary={row.member_number}
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'ceiling',
      header: 'Loan ceiling',
      numeric: true,
      cell: (row) => formatNumber(row.loan_ceiling),
    },
    {
      key: 'expires',
      header: 'Expires',
      cell: (row) => (row.expires_on ? formatDate(row.expires_on) : '—'),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '9rem',
            cell: (row: LibraryMember) =>
              row.status === 'suspended' ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={reinstate.isPending && reinstate.variables === row.id}
                    onClick={() => reinstate.mutate(row.id)}
                  >
                    Reinstate
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Prohibit size={14} />}
                    onClick={() => setSuspending(row)}
                  >
                    Suspend
                  </Button>
                </div>
              ),
          } satisfies Column<LibraryMember>,
        ]
      : []),
  ]

  return (
    <>
      <Card>
        <Toolbar
          className="px-3"
          filters={
            <div className="w-44">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => {
                  setStatus(event.currentTarget.value as MemberStatus | '')
                  setPage(1)
                }}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </div>
          }
        />

        {members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : (
          <>
            <DataTable
              rows={members.data?.rows ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={members.isLoading}
              empty={
                <EmptyState
                  title="Nobody is a member yet"
                  description={`${t('learners')} and staff become members when they are enrolled at the desk.`}
                />
              }
            />
            {members.data && members.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={members.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ReasonDialog
        open={suspending !== null}
        title={`Suspend ${suspending?.person?.name ?? suspending?.member_number ?? 'this member'}`}
        description="They keep their record and their history. They simply cannot take anything out until this is lifted."
        confirmLabel="Suspend"
        destructive
        pending={suspend.isPending}
        onClose={() => setSuspending(null)}
        onConfirm={(reason) => suspending && suspend.mutate({ id: suspending.id, reason })}
      />
    </>
  )
}

/* ── Fines ───────────────────────────────────────────────────────────────── */

function FinesTab({ canManage }: { canManage: boolean }) {
  const { access } = useTenant()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<FineStatus | ''>('outstanding')
  const [page, setPage] = useState(1)
  const [waiving, setWaiving] = useState<LibraryFine | null>(null)

  const sessionId = access?.calendar?.session?.id ?? null

  const params = useMemo(() => ({ status, page }), [status, page])

  const fines = useQuery({
    queryKey: libraryKeys.fines(params),
    queryFn: () => libraryApi.fines(params),
    placeholderData: (previous) => previous,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: libraryKeys.root })
  }

  const bill = useMutation({
    mutationFn: (fine: LibraryFine) => libraryApi.billFine(fine.id, sessionId!),
    onSuccess: () => {
      refresh()
      toast.success('Billed. It is now a charge on their account.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be billed.')
    },
  })

  const waive = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => libraryApi.waiveFine(id, reason),
    onSuccess: () => {
      refresh()
      setWaiving(null)
      toast.success('Waived.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be waived.')
    },
  })

  const outstanding = (fines.data?.rows ?? []).filter((row) => row.is_open)
  const owedMinor = outstanding.reduce((sum, row) => sum + row.amount_minor, 0)
  const currency = outstanding[0]?.currency ?? 'NGN'

  const columns: Column<LibraryFine>[] = [
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      cell: (row) => formatMoney(row.amount_minor, row.currency),
    },
    {
      key: 'reason',
      header: 'Why',
      cell: (row) => (
        <CellStack
          primary={row.reason ? humanize(row.reason) : 'Overdue'}
          secondary={
            row.days_overdue > 0
              ? `${formatNumber(row.days_overdue)} ${row.days_overdue === 1 ? 'day' : 'days'} late`
              : undefined
          }
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'assessed',
      header: 'Assessed',
      cell: (row) => (row.assessed_at ? formatDate(row.assessed_at) : '—'),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '11rem',
            cell: (row: LibraryFine) =>
              row.is_open ? (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Coins size={14} />}
                    disabled={sessionId === null}
                    title={
                      sessionId === null
                        ? 'No session is current, so there is nothing to invoice against.'
                        : undefined
                    }
                    loading={bill.isPending && bill.variables?.id === row.id}
                    onClick={() => bill.mutate(row)}
                  >
                    Bill
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setWaiving(row)}>
                    Waive
                  </Button>
                </div>
              ) : null,
          } satisfies Column<LibraryFine>,
        ]
      : []),
  ]

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Open on this page"
            value={formatMoney(owedMinor, currency)}
            hint={`${formatNumber(outstanding.length)} ${outstanding.length === 1 ? 'fine' : 'fines'} not yet billed or waived`}
            icon={<Coins size={16} />}
            loading={fines.isLoading}
          />
          <StatTile
            label="All fines"
            value={formatNumber(fines.data?.pagination.total ?? 0)}
            icon={<Warning size={16} />}
            loading={fines.isLoading}
          />
        </div>

        <Card>
          <Toolbar
            className="px-3"
            filters={
              <div className="w-44">
                <Select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.currentTarget.value as FineStatus | '')
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: 'All statuses' },
                    { value: 'outstanding', label: 'Outstanding' },
                    { value: 'billed', label: 'Billed' },
                    { value: 'waived', label: 'Waived' },
                  ]}
                />
              </div>
            }
          />

          {fines.isError ? (
            <ErrorState error={fines.error} onRetry={() => fines.refetch()} />
          ) : (
            <>
              <DataTable
                rows={fines.data?.rows ?? []}
                columns={columns}
                rowKey={(row) => row.id}
                loading={fines.isLoading}
                empty={
                  <EmptyState
                    icon={<Coins size={20} />}
                    title="No fines"
                    description="Fines are assessed when an overdue copy comes back, or when the sweep runs."
                  />
                }
              />
              {fines.data && fines.data.pagination.total > 0 && (
                <Pagination
                  className="px-4"
                  pagination={fines.data.pagination}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </Card>
      </div>

      <ReasonDialog
        open={waiving !== null}
        title="Waive this fine"
        description="The fine stays on the record as waived, with this reason against it. It is not deleted."
        confirmLabel="Waive"
        pending={waive.isPending}
        onClose={() => setWaiving(null)}
        onConfirm={(reason) => waiving && waive.mutate({ id: waiving.id, reason })}
      />
    </>
  )
}
