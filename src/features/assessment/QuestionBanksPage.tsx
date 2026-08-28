import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Plus } from '@phosphor-icons/react'
import { humanize } from '@/shared/lib/format'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
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
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { BankDialog } from './BankDialog'
import {
  assessmentCatalog,
  assessmentKeys,
  banksApi,
  type BankListQuery,
} from './assessment.api'
import { BANK_STATUSES, type QuestionBankRow } from './assessment.types'
import { toBankListQuery, useBankListSearch } from './useBankListSearch'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Every question bank in the institution.
 *
 * The same roster shape as students and guardians — tabs, toolbar, table,
 * pager — because it is the same kind of screen and a reader who has learned
 * one should not have to learn another.
 *
 * ── The tabs carry no counts ───────────────────────────────────────────────
 *
 * There is no statistics endpoint for banks, so a count per tab would cost one
 * request per status on every page load. Sprig's own tabs carry none either.
 */
export function QuestionBanksPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { search, setSearch, clear, isFiltered } = useBankListSearch()
  const tabsId = useId()

  const [creating, setCreating] = useState(false)

  /* ── Search: typed locally, committed to the URL on a pause ───────────── */
  const [draft, setDraft] = useState(search.search)
  const committed = useRef(search.search)
  const pending = useRef<number | null>(null)

  useEffect(() => {
    if (search.search === committed.current) return
    committed.current = search.search
    setDraft(search.search)
  }, [search.search])

  useEffect(() => {
    if (draft === committed.current) return
    pending.current = window.setTimeout(() => {
      pending.current = null
      committed.current = draft
      setSearch({ search: draft, page: 1 }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (pending.current === null) return
      clearTimeout(pending.current)
      pending.current = null
    }
  }, [draft, setSearch])

  /** Cancelling the pending commit and resetting the draft together is the
   *  only order in which nothing is left to fire — see the students roll. */
  const clearFilters = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
    committed.current = ''
    setDraft('')
    clear()
  }, [clear])

  const listQuery = useMemo<BankListQuery>(
    () => ({
      search: search.search || undefined,
      status: search.status || undefined,
      course_id: search.course || undefined,
      page: search.page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search],
  )

  const banks = useQuery({
    queryKey: assessmentKeys.bankList(listQuery),
    queryFn: () => banksApi.list(listQuery),
    placeholderData: (previous) => previous,
  })

  const courses = useQuery({
    queryKey: assessmentKeys.catalogCourses,
    queryFn: assessmentCatalog.courses,
    staleTime: 10 * 60_000,
  })

  const rows = banks.data?.rows ?? []
  const pagination = banks.data?.pagination

  const tabs: TabItem[] = [
    { key: 'all', label: 'All banks' },
    ...BANK_STATUSES.map((status) => ({ key: status, label: humanize(status) })),
  ]
  const activeTab = tabs.some((item) => item.key === search.status) ? search.status : 'all'

  const listQueryString = new URLSearchParams(toBankListQuery(search)).toString()
  const recordSuffix = listQueryString ? `?${listQueryString}` : ''

  const columns: Column<QuestionBankRow>[] = [
    {
      key: 'name',
      header: 'Bank',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-50 text-accent-700">
            <Database size={13} />
          </span>
          <span className="truncate">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      width: '9rem',
      cell: (row) =>
        row.code ? <span className="font-mono text-[0.6875rem]">{row.code}</span> : <Blank />,
    },
    {
      key: 'course',
      header: t('course'),
      cell: (row) => row.course_title || <Blank />,
    },
    {
      key: 'level',
      header: t('level'),
      width: '8rem',
      cell: (row) => row.academic_level || <Blank />,
    },
    {
      key: 'questions',
      header: 'Questions',
      width: '9rem',
      className: 'tabular',
      /* Two numbers that mean different things: how much is in the bank, and
       * how much of it may actually go on a paper. */
      cell: (row) =>
        row.question_count === undefined ? (
          <Blank />
        ) : (
          <span>
            {row.question_count}
            {row.assemblable_count !== undefined && (
              <span className="text-gray-600"> · {row.assemblable_count} ready</span>
            )}
          </span>
        ),
    },
    {
      key: 'visibility',
      header: 'Visibility',
      width: '8rem',
      cell: (row) => <Flag on={row.is_shared}>{row.is_shared ? 'Shared' : 'Private'}</Flag>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '7rem',
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ]

  const createAction = perms.has('question_bank.manage') ? (
    <Button variant="primary" icon={<Plus size={14} weight="bold" />} onClick={() => setCreating(true)}>
      New bank
    </Button>
  ) : null

  if (banks.isError) {
    return (
      <PageStack>
        <PageHeader title="Question bank" />
        <ErrorState error={banks.error} onRetry={() => banks.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title="Question bank" />

      <div>
        <Tabs
          items={tabs}
          value={activeTab}
          onChange={(key) => setSearch({ status: key === 'all' ? '' : key, page: 1 })}
          baseId={tabsId}
        />

        <div
          role="tabpanel"
          id={panelId(tabsId, activeTab)}
          aria-labelledby={`${tabsId}-tab-${activeTab}`}
        >
          <Toolbar
            filters={
              <>
                <div className="w-48">
                  <Select
                    value={search.course}
                    onChange={(event) => setSearch({ course: event.target.value, page: 1 })}
                    aria-label={`Filter by ${t('course').toLowerCase()}`}
                    options={[
                      { value: '', label: `Any ${t('course').toLowerCase()}` },
                      ...(courses.data ?? []).map((course) => ({
                        value: course.id,
                        label: course.name,
                      })),
                    ]}
                  />
                </div>
                {isFiltered && (
                  <Button variant="link" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            actions={
              <>
                <div className="w-56">
                  <SearchInput
                    className="w-full"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Search banks"
                    aria-label="Search banks by name or code"
                  />
                </div>
                {createAction}
              </>
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={banks.isLoading}
            skeletonRows={8}
            rowHref={(row) => `/question-bank/${row.id}${recordSuffix}`}
            className={banks.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={<Database size={20} />}
                  title="No banks match these filters"
                  description="Nothing answers to this search and these filters together."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={<Database size={20} />}
                  title="No question banks yet"
                  description={`A bank groups reusable questions for one ${t('course').toLowerCase()} or ${t('level').toLowerCase()}. Papers are assembled from what is in them.`}
                  action={createAction ?? undefined}
                />
              )
            }
          />

          {pagination && (
            <Pagination pagination={pagination} onPageChange={(page) => setSearch({ page })} />
          )}
        </div>
      </div>

      <BankDialog open={creating} onClose={() => setCreating(false)} />
    </PageStack>
  )
}
