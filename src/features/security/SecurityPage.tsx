import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Blank,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { AuditEntryPanel } from './AuditEntryPanel'
import { securityApi, securityKeys } from './security.api'
import { auditDirection, auditLabel, type AuditLogQuery, type AuditLogRow } from './security.types'

const SEARCH_DEBOUNCE_MS = 300

/**
 * The record of who changed what.
 *
 * ── Two columns, because an audit line is half a sentence on its own ───────
 *
 * "Coralie granted library.view to Dina" tells you what happened; it does not
 * tell you what the grant actually contained, which is the question an auditor
 * came to answer. So the list is the index and the panel beside it is the
 * evidence — the same shape Sprig gives a study and its details, and the same
 * one this app already uses for a question bank.
 *
 * The first row is selected on arrival rather than leaving the panel empty: a
 * screen whose right half says "select something" wastes the half it was given.
 */
export function SecurityPage() {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [event, setEvent] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const pending = useRef<number | null>(null)

  useEffect(() => {
    if (draft === search) return
    pending.current = window.setTimeout(() => {
      pending.current = null
      setSearch(draft)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (pending.current === null) return
      clearTimeout(pending.current)
      pending.current = null
    }
  }, [draft, search])

  const query = useMemo<AuditLogQuery>(
    () => ({
      search: search || undefined,
      event: event || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      per_page: PER_PAGE_DEFAULT,
    }),
    [search, event, from, to, page],
  )

  const logs = useQuery({
    queryKey: securityKeys.logs(query),
    queryFn: () => securityApi.logs(query),
    placeholderData: (previous) => previous,
  })

  const rows = logs.data?.rows ?? []
  const pagination = logs.data?.pagination
  const isFiltered = Boolean(search || event || from || to)

  /* Follow the data: after a filter or a page change the previously selected
   * entry is usually gone, and a panel showing a row that is no longer in the
   * list beside it is a screen disagreeing with itself. */
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id)
    }
  }, [rows, selectedId])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  function clearFilters() {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
    setDraft('')
    setSearch('')
    setEvent('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'event',
      header: 'Event',
      cell: (row) => {
        const direction = auditDirection(row.event)
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                direction === 'granted' && 'bg-success-500',
                direction === 'revoked' && 'bg-danger-500',
                direction === 'changed' && 'bg-accent-500',
              )}
              aria-hidden
            />
            {auditLabel(row.event)}
          </span>
        )
      },
    },
    { key: 'actor', header: 'Who', cell: (row) => row.actor_name || <Blank /> },
    { key: 'subject', header: 'About', cell: (row) => row.subject_name || <Blank /> },
    {
      key: 'target',
      header: 'Target',
      cell: (row) =>
        row.target_type ? (
          <span className="font-mono text-[0.6875rem]">{row.target_type}</span>
        ) : (
          <Blank />
        ),
    },
    {
      key: 'when',
      header: 'When',
      className: 'tabular',
      width: '11rem',
      /* Relative for scanning, absolute in the title for the record — an
       * auditor quoting a time needs the real one. */
      cell: (row) =>
        row.created_at ? (
          <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
        ) : (
          <Blank />
        ),
    },
  ]

  if (logs.isError) {
    return (
      <PageStack>
        <PageHeader title="Audit and security" />
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader
        title="Audit and security"
        description="Every change to who may do what, in the order it happened. The trail is append-only — nothing here can be edited or removed."
      />

      <Toolbar
        className="pt-0"
        filters={
          <>
            <div className="w-52">
              <Select
                value={event}
                onChange={(e) => {
                  setEvent(e.target.value)
                  setPage(1)
                }}
                aria-label="Filter by event"
                /* Offered from `meta.events` — what this institution has
                 * actually recorded — rather than a hard-coded list that
                 * drifts every time the API adds an event name. */
                options={[
                  { value: '', label: 'Any event' },
                  ...(logs.data?.events ?? []).map((value) => ({
                    value,
                    label: auditLabel(value),
                  })),
                ]}
              />
            </div>
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
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search the trail"
              aria-label="Search by event, reason, target or who did it"
            />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={logs.isLoading}
            skeletonRows={10}
            onRowClick={(row) => setSelectedId(row.id)}
            selectedIds={selectedId ? new Set([selectedId]) : undefined}
            className={logs.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={<ShieldCheck size={20} />}
                  title="Nothing matches these filters"
                  description="No change to permissions answers to this search and this window together."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={<ShieldCheck size={20} />}
                  title="Nothing has been recorded yet"
                  description="The trail fills as roles, permissions and scopes are granted or taken away. An empty trail means no such change has been made."
                />
              )
            }
          />

          {pagination && <Pagination pagination={pagination} onPageChange={setPage} />}
        </div>

        <div className="min-w-0">
          {selected ? (
            <AuditEntryPanel entry={selected} />
          ) : (
            !logs.isLoading && (
              <Card>
                <EmptyState
                  title="No entry selected"
                  description="Choose a line to see what it changed."
                />
              </Card>
            )
          )}
        </div>
      </div>
    </PageStack>
  )
}
