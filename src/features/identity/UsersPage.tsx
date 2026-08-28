import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { UserCircle } from '@phosphor-icons/react'
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchInput,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { PageHeader } from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys } from './identity.api'
import type { DirectoryUser } from './identity.types'

/**
 * Everybody with a sign-in.
 *
 * ── `kinds` is a list, and that is the point ───────────────────────────────
 *
 * A person can be staff and a guardian at once — a teacher whose child attends
 * the school. Rendering one "role" column would force a choice between two
 * true answers, so every kind is shown, and the guardian case says whose
 * parent they are.
 *
 * This is a directory, not an account manager: the API exposes no create,
 * suspend or password-reset here, so none is offered. What it does expose is
 * the access resolution, which is the row's real destination.
 */
export function UsersPage() {
  const t = useTerminology()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState<string>('')

  const query = useQuery({
    queryKey: identityKeys.users({ page }),
    queryFn: () => identityApi.users({ page, per_page: 25 }),
    placeholderData: (prev) => prev,
  })

  const all = query.data?.rows ?? []

  const kinds = useMemo(() => {
    const set = new Set<string>()
    for (const row of all) for (const k of row.kinds) set.add(k)
    return [...set].sort()
  }, [all])

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase()
    return all.filter((row) => {
      if (kind && !row.kinds.includes(kind)) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        (row.title ?? '').toLowerCase().includes(q) ||
        row.kinds.some((k) => k.includes(q))
      )
    })
  }, [all, term, kind])

  const columns: Column<DirectoryUser>[] = [
    {
      key: 'name',
      header: 'Person',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.name} size="md" />
          <span className="truncate">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Post',
      cell: (row) =>
        row.title ? (
          <span className="text-gray-700">{row.title}</span>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    {
      key: 'kinds',
      header: 'Here as',
      width: '14rem',
      cell: (row) =>
        row.kinds.length === 0 ? (
          /* The institution owner holds no profile kind at all — they are not
           * staff, student or guardian. Saying "—" would read as missing data. */
          <Badge tone="accent">Administrator</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.kinds.map((k) => (
              <Badge key={k} tone="neutral">
                {kindLabel(k, t)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'guardian_of',
      header: 'Children',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.guardian_of.length > 0 ? (
          row.guardian_of.length
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  return (
    <PageStack>
      <PageHeader
        title="Authentication and identity"
        meta={
          query.data ? (
            <span>{query.data.pagination.total} people with a sign-in</span>
          ) : undefined
        }
      />

      <div>
        <Toolbar
          filters={
            <>
              <SearchInput
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="w-64"
              />
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(kind === k ? '' : k)}
                  className={
                    kind === k
                      ? 'h-8 rounded-md border border-gray-400 bg-gray-100 px-2.5 text-sm capitalize text-gray-900'
                      : 'h-8 rounded-md border border-gray-300 bg-white px-2.5 text-sm capitalize text-gray-800 transition-colors hover:bg-gray-50'
                  }
                >
                  {kindLabel(k, t)}
                </button>
              ))}
            </>
          }
        />

        {!query.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<UserCircle size={20} />}
            title="Nobody matches that"
            description="Search covers names, posts and what somebody is here as."
            action={
              <Button
                onClick={() => {
                  setTerm('')
                  setKind('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.user_id}
              loading={query.isLoading}
              skeletonRows={8}
              rowHref={(row) => `/authentication/${row.user_id}`}
              onRowClick={(row) =>
                navigate({ to: '/authentication/$userId', params: { userId: row.user_id } })
              }
            />
            {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
          </>
        )}
      </div>
    </PageStack>
  )
}

/** `student` → the institution's own word for a learner. */
export function kindLabel(kind: string, t: (k: 'learner' | 'guardian' | 'teacher') => string): string {
  if (kind === 'student') return t('learner')
  if (kind === 'guardian') return t('guardian')
  if (kind === 'staff') return 'Staff'
  return humanize(kind)
}
