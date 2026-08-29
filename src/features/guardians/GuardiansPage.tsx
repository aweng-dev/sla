import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Plus, UsersThree } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { qk } from '@/shared/api/queryKeys'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { humanize } from '@/shared/lib/format'
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
  panelId,
  SearchInput,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { GuardianDialog } from './GuardianDialog'
import { PortalGuardiansPage } from './PortalGuardiansPage'
import { GUARDIAN_STATUSES, guardiansApi, type GuardianListQuery } from './guardians.api'
import type { GuardianRow } from './guardians.types'
import { toGuardianListQuery, useGuardianListSearch } from './useGuardianListSearch'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Parents and guardians, which is two screens for the same reason `/students`
 * is: `GET /admin/guardians` needs a staff PROFILE, and answers a guardian
 * asking after their own record with 403, not 404. They hold `guardians.view`
 * and it does not help them, so the branch is on the portal.
 */
export function GuardiansPage() {
  const { portal } = useTenant()

  if (portal === 'student' || portal === 'guardian') {
    return <PortalGuardiansPage />
  }

  return <StaffGuardiansPage />
}

function StaffGuardiansPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { search, setSearch, clear, isFiltered } = useGuardianListSearch()
  const tabsId = useId()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

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

  /** Clearing the filters has to clear the BOX as well — cancelling the timer
   *  and resetting the draft together is the only order in which nothing is
   *  left to fire. See the same note on the students roll. */
  const clearFilters = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
    committed.current = ''
    setDraft('')
    clear()
  }, [clear])

  /* ── The query ────────────────────────────────────────────────────────── */
  const listQuery = useMemo<GuardianListQuery>(
    () => ({
      search: search.search || undefined,
      status: search.status || undefined,
      page: search.page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search],
  )

  const guardians = useQuery({
    queryKey: qk.guardians.list(listQuery),
    queryFn: () => guardiansApi.list(listQuery),
    placeholderData: (previous) => previous,
  })

  /* Selection is one page's worth. Carrying it across a filter change would
   * let somebody act on rows they can no longer see. */
  useEffect(() => {
    setSelected(new Set())
  }, [search.search, search.status, search.page])

  const rows = guardians.data?.rows ?? []
  const pagination = guardians.data?.pagination

  /*
   * The tabs carry no counts, and that is deliberate.
   *
   * `/admin/students/statistics` has no counterpart for guardians — both
   * `/statistics` and `/stats` answer 404 — so a count per tab would cost one
   * extra request per status on every page load. Sprig's own tabs ("All
   * Users", "Groups") carry no counts either, so the shape is right anyway.
   */
  const tabs: TabItem[] = [
    { key: 'all', label: `All ${t('guardians').toLowerCase()}` },
    ...GUARDIAN_STATUSES.map((status) => ({ key: status, label: humanize(status) })),
  ]

  /* A status the tabs do not offer — hand-edited into the URL — must not leave
   * the strip pointing at a panel id that is not on the page. */
  const activeTab = tabs.some((item) => item.key === search.status) ? search.status : 'all'

  const columns: Column<GuardianRow>[] = [
    {
      key: 'guardian',
      header: t('guardian'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.person.full_name} size="md" />
          <span className="truncate">{row.person.full_name}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      /* Email over phone when both are held: it is what the school writes to.
       * Most guardians in a young institution have neither, which is worth
       * seeing at a glance rather than discovering one record at a time. */
      cell: (row) => row.person.email || row.person.phone || <Blank />,
    },
    {
      key: 'occupation',
      header: 'Occupation',
      cell: (row) => row.occupation || <Blank />,
    },
    {
      key: 'children',
      header: t('learners'),
      width: '7rem',
      className: 'tabular',
      cell: (row) => row.children_count,
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ]

  const selectedRows = rows.filter((row) => selected.has(row.id))

  /* The list's own state, as a query string, so the record a row opens can be
   * reloaded and still know the list it came from. */
  const listQueryString = new URLSearchParams(toGuardianListQuery(search)).toString()
  const recordSuffix = listQueryString ? `?${listQueryString}` : ''

  async function copyContacts() {
    /* Tab-separated so it pastes into a spreadsheet as three columns. The
     * blanks are kept rather than skipped — a row with no address is the
     * useful part of a contact export. */
    const lines = selectedRows.map((row) =>
      [row.person.full_name, row.person.email ?? '', row.person.phone ?? ''].join('\t'),
    )
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success(`${selectedRows.length} contact${selectedRows.length === 1 ? '' : 's'} copied`)
    } catch {
      toast.error('The clipboard is not available in this browser.')
    }
  }

  const addAction = perms.has('guardians.manage') ? (
    <Button variant="primary" trailing={<Plus size={16} weight="bold" />} onClick={() => setAdding(true)}>
      Add {t('guardian').toLowerCase()}
    </Button>
  ) : null

  if (guardians.isError) {
    return (
      <PageStack>
        <PageHeader title={t('guardians')} />
        <ErrorState error={guardians.error} onRetry={() => guardians.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title={t('guardians')}
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
              isFiltered ? (
                <Button variant="link" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
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
                    placeholder={`Search ${t('guardians').toLowerCase()}`}
                    aria-label={`Search ${t('guardians').toLowerCase()} by name or contact details`}
                  />
                </div>
                {addAction}
              </>
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={guardians.isLoading}
            skeletonRows={PER_PAGE_DEFAULT}
            selectedIds={selected}
            onSelectionChange={setSelected}
            rowHref={(row) => `/guardians/${row.id}${recordSuffix}`}
            className={guardians.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={<UsersThree size={20} />}
                  title={`No ${t('guardians').toLowerCase()} match these filters`}
                  description="Nobody on file answers to this search and this status together."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={<UsersThree size={20} />}
                  title={`No ${t('guardians').toLowerCase()} on file yet`}
                  description={`Adding one creates the person and their record. Tie them to a child from the ${t('learner').toLowerCase()}'s own record.`}
                  action={addAction ?? undefined}
                />
              )
            }
          />

          {pagination && (
            <Pagination pagination={pagination} onPageChange={(page) => setSearch({ page })} />
          )}
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        noun={t('guardian').toLowerCase()}
        onClear={() => setSelected(new Set())}
      >
        {/*
         * The only bulk action the API can honestly back.
         *
         * There is no bulk endpoint for guardians and no export that takes a
         * list of ids, so anything called "Export selected" would export
         * something other than the selection. Copying the contact details is
         * done here, in full, and is what somebody reaching for a selection of
         * parents usually wants.
         */}
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={13} />}
          onClick={copyContacts}
          className="text-white hover:bg-white/10 active:bg-white/20"
        >
          Copy contacts
        </Button>
      </BulkActionBar>

      <GuardianDialog open={adding} onClose={() => setAdding(false)} />
    </PageStack>
  )
}
