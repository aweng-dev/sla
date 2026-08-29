import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IdentificationBadge } from '@phosphor-icons/react'
import { humanize, formatDate } from '@/shared/lib/format'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Blank,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
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
import { EMPLOYMENT_STATUSES, type StaffRow } from './hr.types'
import { hrKeys, staffApi, type StaffListQuery } from './hr.api'
import { toStaffListQuery, useStaffListSearch } from './useStaffListSearch'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Everyone the institution employs.
 *
 * ── There is no "Add" button, and that is the API's design ─────────────────
 *
 * `/admin/staff` is GET only. A person becomes staff through People
 * Management, which owns the person record; this surface manages the
 * employment hanging off one. Offering a create here would mean inventing an
 * endpoint.
 */
export function StaffPage() {
  const t = useTerminology()
  const { search, setSearch, clear, isFiltered } = useStaffListSearch()
  const tabsId = useId()

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

  const listQuery = useMemo<StaffListQuery>(
    () => ({
      search: search.search || undefined,
      status: search.status || undefined,
      position_id: search.position || undefined,
      page: search.page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search],
  )

  const staff = useQuery({
    queryKey: hrKeys.staffList(listQuery),
    queryFn: () => staffApi.list(listQuery),
    placeholderData: (previous) => previous,
  })

  /* Positions come back empty for an institution that has not defined any, in
   * which case the filter is not drawn rather than offered as an empty list. */
  const positions = useQuery({
    queryKey: hrKeys.positions,
    queryFn: staffApi.positions,
    staleTime: 10 * 60_000,
  })

  const rows = staff.data?.rows ?? []
  const pagination = staff.data?.pagination

  const tabs: TabItem[] = [
    { key: 'all', label: 'All staff' },
    ...EMPLOYMENT_STATUSES.map((status) => ({ key: status, label: humanize(status) })),
  ]
  const activeTab = tabs.some((item) => item.key === search.status) ? search.status : 'all'

  const listQueryString = new URLSearchParams(toStaffListQuery(search)).toString()
  const recordSuffix = listQueryString ? `?${listQueryString}` : ''

  const columns: Column<StaffRow>[] = [
    {
      key: 'staff',
      header: 'Staff',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.person.full_name} size="md" />
          <span className="truncate">{row.person.full_name}</span>
        </div>
      ),
    },
    {
      key: 'employee_number',
      header: 'Employee no.',
      className: 'tabular',
      width: '10rem',
      cell: (row) => row.employee_number || <Blank />,
    },
    {
      key: 'job_title',
      header: 'Job title',
      cell: (row) => row.job_title || <Blank />,
    },
    {
      key: 'employment_type',
      header: 'Type',
      width: '8rem',
      cell: (row) => (row.employment_type ? humanize(row.employment_type) : <Blank />),
    },
    {
      key: 'employment_status',
      header: 'Status',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.employment_status} />,
    },
    {
      key: 'hire_date',
      header: 'Hired',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.hire_date ? formatDate(row.hire_date) : <Blank />),
    },
  ]

  if (staff.isError) {
    return (
      <PageStack>
        <PageHeader title={`${t('teachers')} and staff`} />
        <ErrorState error={staff.error} onRetry={() => staff.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title="Staff"
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
        <div
          role="tabpanel"
          id={panelId(tabsId, activeTab)}
          aria-labelledby={`${tabsId}-tab-${activeTab}`}
        >
          <Toolbar
            filters={
              <>
                {(positions.data?.length ?? 0) > 0 && (
                  <div className="w-48">
                    <Select
                      value={search.position}
                      onChange={(event) => setSearch({ position: event.target.value, page: 1 })}
                      aria-label="Filter by position"
                      options={[
                        { value: '', label: 'Any position' },
                        ...(positions.data ?? []).map((position) => ({
                          value: position.id,
                          label: position.name,
                        })),
                      ]}
                    />
                  </div>
                )}
                {isFiltered && (
                  <Button variant="link" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            actions={
              <div className="w-56">
                <SearchInput
                  className="w-full"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Search staff"
                  aria-label="Search staff by name or employee number"
                />
              </div>
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={staff.isLoading}
            skeletonRows={PER_PAGE_DEFAULT}
            rowHref={(row) => `/staff/${row.id}${recordSuffix}`}
            className={staff.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={<IdentificationBadge size={20} />}
                  title="No staff match these filters"
                  description="Nobody on the payroll answers to this search and these filters together."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={<IdentificationBadge size={20} />}
                  title="No staff on record yet"
                  description="People become staff through People Management, which owns the person record. This screen manages the employment attached to one."
                />
              )
            }
          />

          {pagination && (
            <Pagination pagination={pagination} onPageChange={(page) => setSearch({ page })} />
          )}
        </div>
      </div>
    </PageStack>
  )
}
