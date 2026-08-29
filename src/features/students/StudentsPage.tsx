import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Plus, Student } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { qk } from '@/shared/api/queryKeys'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatDate, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Blank,
  BulkActionBar,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { AdmitStudentDialog } from './AdmitStudentDialog'
import { FilterSelect } from './FilterSelect'
import { PortalStudentsPage } from './PortalStudentsPage'
import {
  catalogApi,
  catalogKeys,
  STUDENT_STATUSES,
  studentsApi,
  type StudentListQuery,
} from './students.api'
import type { StudentRow } from './students.types'
import { toStudentListQuery, useStudentListSearch } from './useStudentListSearch'

const SEARCH_DEBOUNCE_MS = 300

/**
 * `/students`, which is two unrelated screens.
 *
 * The roll below is four `/admin/*` requests, and `/admin` needs a staff
 * PROFILE rather than a permission: a learner and a guardian both hold
 * `students.view` and both are refused all four with "Staff access is
 * required." They reach this route anyway — the server-driven rail puts a
 * "Student Management" item in their own sidebar and their dashboard offers
 * the same route as a tile — so the branch is on the portal, exactly as
 * `DashboardPage` branches, and not on a permission that does not discriminate.
 */
export function StudentsPage() {
  const { portal } = useTenant()

  if (portal === 'student' || portal === 'guardian') {
    return <PortalStudentsPage />
  }

  return <StaffStudentsPage />
}

/**
 * The roll.
 *
 * ── There is no class column, and that is deliberate ───────────────────────
 *
 * `GET /admin/students` sends no enrolment: `StudentResource` is thin on
 * purpose, because programme, level and class are four relations per row on a
 * screen that shows twenty-five of them. The class is therefore a FILTER here
 * and a fact on the record screen. Inventing the column by firing a second
 * request per row is how a list of thirty becomes thirty-one requests.
 *
 * ── The headers do not sort ────────────────────────────────────────────────
 *
 * The endpoint takes no sort parameter; it orders by surname then forename and
 * nothing else. A sortable-looking header that reorders one page of a fifty
 * page roll is worse than a plain one — it answers a different question than
 * the one it was asked.
 */
function StaffStudentsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { search, setSearch, clear, isFiltered } = useStudentListSearch()
  const tabsId = useId()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [admitting, setAdmitting] = useState(false)

  /* ── Search: typed locally, committed to the URL on a pause ───────────── */
  const [draft, setDraft] = useState(search.search)
  const committed = useRef(search.search)
  const pending = useRef<number | null>(null)

  /* The URL moved without us — a back button, or the "clear filters" link.
   * Adopt it, or the next keystroke would push the old term back. */
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
      /* `replace` so a term typed one letter at a time leaves one history
       * entry rather than eight the back button has to walk out of. */
      setSearch({ search: draft, page: 1 }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (pending.current === null) return
      clearTimeout(pending.current)
      pending.current = null
    }
  }, [draft, setSearch])

  /**
   * Clearing the filters has to clear the BOX as well.
   *
   * `clear` navigates, which gives `setSearch` a new identity, which re-runs
   * the debounce effect and reschedules the commit that was in flight — so a
   * term half-typed when the link is clicked lands in the URL a moment after
   * the filters were cleared, and the effect that adopts the URL cannot undo
   * it: the committed term and the new one are both empty, so it sees no
   * change to adopt. Cancelling the timer and resetting the draft together is
   * the only order in which nothing is left to fire.
   */
  const clearFilters = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
    committed.current = ''
    setDraft('')
    clear()
  }, [clear])

  /* ── The queries ──────────────────────────────────────────────────────── */
  const listQuery = useMemo<StudentListQuery>(
    () => ({
      search: search.search || undefined,
      status: search.status || undefined,
      program_id: search.program || undefined,
      learning_group_id: search.group || undefined,
      page: search.page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search],
  )

  const students = useQuery({
    queryKey: qk.students.list(listQuery),
    queryFn: () => studentsApi.list(listQuery),
    placeholderData: (previous) => previous,
  })

  /* The tab counts. Narrowed by the same search and filters as the list —
   * but never by status, so each tab reports its own share of what is on
   * screen rather than the tab you are standing on. */
  const summaryQuery = useMemo(
    () => ({
      search: search.search || undefined,
      program_id: search.program || undefined,
      learning_group_id: search.group || undefined,
    }),
    [search.search, search.program, search.group],
  )

  const summary = useQuery({
    queryKey: [...qk.students.statistics(), summaryQuery],
    queryFn: () => studentsApi.summary(summaryQuery),
    placeholderData: (previous) => previous,
  })

  const programs = useQuery({
    queryKey: catalogKeys.programs,
    queryFn: catalogApi.programs,
    staleTime: 10 * 60_000,
  })

  const groups = useQuery({
    queryKey: catalogKeys.groups,
    queryFn: catalogApi.groups,
    staleTime: 10 * 60_000,
  })

  /* Selection is one page's worth. Carrying it across a filter change would
   * let somebody act on rows they can no longer see. */
  useEffect(() => {
    setSelected(new Set())
  }, [search.search, search.status, search.program, search.group, search.page])

  const rows = students.data?.rows ?? []
  const pagination = students.data?.pagination

  const tabs: TabItem[] = [
    { key: 'all', label: `All ${t('learners')}`, count: summary.data?.total },
    ...STUDENT_STATUSES.map((status) => ({
      key: status,
      label: humanize(status),
      /* `by_status` is normalized in `studentsApi.summary`, and still guarded
       * here: this indexes a map straight out of a response, and the cost of
       * being wrong is a blank screen rather than a missing count. */
      count: summary.data?.by_status?.[status],
    })),
  ]

  /* A status the tabs do not offer — hand-edited into the URL — must not leave
   * the strip pointing at a panel id that is not on the page. */
  const activeTab = tabs.some((item) => item.key === search.status) ? search.status : 'all'

  const columns: Column<StudentRow>[] = [
    {
      key: 'student',
      header: t('learner'),
      /* One line, as Sprig's rosters are. The number used to sit under the name
       * AND in its own column; a hundred two-line rows turns a roster into a
       * list of cards. */
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.person.full_name} size="md" />
          <span className="truncate">{row.person.full_name}</span>
        </div>
      ),
    },
    {
      key: 'student_number',
      header: `${t('learner')} no.`,
      className: 'tabular',
      cell: (row) => row.student_number || <Blank />,
    },
    {
      key: 'admission_number',
      header: 'Admission no.',
      className: 'tabular',
      cell: (row) => row.admission_number || <Blank />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    /* Ranged left with tabular figures rather than right-aligned. A date is
     * not a quantity whose magnitude is being compared, and Sprig's own tables
     * — "Last Activity", "Date Added", "Sessions" — line every column up on
     * the left and leave the right edge alone. */
    {
      key: 'date_of_birth',
      header: 'Date of birth',
      className: 'tabular',
      width: '9rem',
      cell: (row) =>
        row.person.date_of_birth ? formatDate(row.person.date_of_birth) : <Blank />,
    },
    {
      key: 'admission_date',
      header: 'Admitted',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.admission_date ? formatDate(row.admission_date) : <Blank />),
    },
  ]

  const selectedRows = rows.filter((row) => selected.has(row.id))

  /* The list's own state, as a query string, so the record a row opens can be
   * reloaded and still know the roll it came from. */
  const listQueryString = new URLSearchParams(toStudentListQuery(search)).toString()
  const recordSuffix = listQueryString ? `?${listQueryString}` : ''

  async function copyNumbers() {
    const numbers = selectedRows.map((row) => row.student_number).join('\n')
    try {
      await navigator.clipboard.writeText(numbers)
      toast.success(`${selectedRows.length} ${t('learner').toLowerCase()} numbers copied`)
    } catch {
      toast.error('The clipboard is not available in this browser.')
    }
  }

  const admitAction = perms.has('students.manage') ? (
    <Button
      variant="primary"
      trailing={<Plus size={16} weight="bold" />}
      onClick={() => setAdmitting(true)}
    >
      Admit {t('learner').toLowerCase()}
    </Button>
  ) : null

  if (students.isError) {
    return (
      <PageStack>
        <PageHeader title={t('learners')} />
        <ErrorState error={students.error} onRetry={() => students.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title={t('learners')}
        tabs={
          <Tabs bare
            items={tabs}
            value={activeTab}
            onChange={(key) => setSearch({ status: key === 'all' ? '' : key, page: 1 })}
            baseId={tabsId}
          />
        }
      />

      <div>
        {/* The tabs choose a status, and the status narrows everything under
            them — the filters, the table and its pager are the panel. */}
        <div
          role="tabpanel"
          id={panelId(tabsId, activeTab)}
          aria-labelledby={`${tabsId}-tab-${activeTab}`}
        >
          <Toolbar
            filters={
              <>
                <FilterSelect
                  label={t('programme')}
                  anyLabel={`Any ${t('programme').toLowerCase()}`}
                  loading={programs.isLoading}
                  value={search.program}
                  onChange={(program) => setSearch({ program, page: 1 })}
                  options={(programs.data ?? []).map((program) => ({
                    value: program.id,
                    label: program.name,
                    hint: program.code ?? undefined,
                  }))}
                />
                <FilterSelect
                  label={t('group')}
                  anyLabel={`Any ${t('group').toLowerCase()}`}
                  loading={groups.isLoading}
                  value={search.group}
                  onChange={(group) => setSearch({ group, page: 1 })}
                  options={(groups.data ?? []).map((group) => ({
                    value: group.id,
                    label: group.name,
                    hint: group.code ?? undefined,
                  }))}
                />
                {isFiltered && (
                  <Button variant="link" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            actions={
              <>
                {/* `Input` wraps its field in a `w-full` div, which as a flex item
                    claims the whole row and pushes the action onto a second line.
                    The width belongs on the wrapper here. */}
                <div className="w-56">
                  <SearchInput
                    className="w-full"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`Search ${t('learners').toLowerCase()}`}
                    aria-label={`Search ${t('learners').toLowerCase()} by name or number`}
                  />
                </div>
                {admitAction}
              </>
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={students.isLoading}
            skeletonRows={PER_PAGE_DEFAULT}
            selectedIds={selected}
            onSelectionChange={setSelected}
            /* A URL, not a click handler: the row is the only way into a record,
             * and a `<tr onClick>` cannot be tabbed to, opened in a new tab or
             * middle-clicked. The record carries the list's filters in its own
             * query string so the way back lands on the same page of the same
             * filtered roll, reload or not. */
            rowHref={(row) => `/students/${row.id}${recordSuffix}`}
            /* Paging keeps the previous page on screen; dimming says the numbers
             * under the cursor are one request behind. */
            className={students.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={<Student size={20} />}
                  title={`No ${t('learners').toLowerCase()} match these filters`}
                  description="Nobody on the roll answers to this search and these filters together."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={<Student size={20} />}
                  title={`No ${t('learners').toLowerCase()} on the roll yet`}
                  description={`Admitting a ${t('learner').toLowerCase()} creates their record and, if you choose a ${t('group').toLowerCase()}, their place in it.`}
                  action={admitAction ?? undefined}
                />
              )
            }
          />

          {pagination && (
            <Pagination
              pagination={pagination}
              onPageChange={(page) => setSearch({ page })}
            />
          )}
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        noun={t('learner').toLowerCase()}
        onClear={() => setSelected(new Set())}
      >
        {/*
         * The only bulk action the API can honestly back.
         *
         * There is no bulk endpoint for students, and `POST /admin/exports`
         * filters a dataset by session, programme and status — it cannot be
         * handed a list of ids, so an "Export selected" would export something
         * other than the selection. Copying the numbers is done here, in full,
         * and is what a registrar reaching for a selection usually wants.
         */}
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={13} />}
          onClick={copyNumbers}
          className="text-white hover:bg-white/10 active:bg-white/20"
        >
          Copy numbers
        </Button>
      </BulkActionBar>

      <AdmitStudentDialog open={admitting} onClose={() => setAdmitting(false)} />
    </PageStack>
  )
}
