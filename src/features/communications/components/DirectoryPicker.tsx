import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, UsersThree } from '@phosphor-icons/react'
import { Avatar, Badge, EmptyState, ErrorState, SearchInput, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  communicationKeys,
  communicationsApi,
  directoryKindLabel,
  type DirectoryEntry,
} from '../communications.api'

/**
 * Who this account may write to.
 *
 * ── The list is not a roll ─────────────────────────────────────────────────
 *
 * `GET /portal/directory` is bounded server-side by who the caller is: a family
 * sees their children's teachers, staff see their colleagues, their learners and
 * those learners' families, and nobody sees an institution-wide roll unless
 * their scope already reached it. That bound is applied inside the query, not
 * after it — so this component pages through what it is given and never filters
 * a result out, which would make "25 of 400" a lie and skip people on page two.
 *
 * ── Why a picker and not a lookup field ────────────────────────────────────
 *
 * There is deliberately no single-entry route: one would answer "is this uuid
 * somebody at this school" for any id a client cared to try. So a person is
 * chosen from a list or not at all, and this component never resolves a name
 * from an id it was handed.
 */
export function DirectoryPicker({
  selected,
  onToggle,
  exclude = [],
  multiple = true,
}: {
  selected: DirectoryEntry[]
  onToggle: (entry: DirectoryEntry) => void
  /** Ids already in the conversation. Shown as chosen and not selectable, so
   *  the reason somebody is missing from the list is never a mystery. */
  exclude?: string[]
  multiple?: boolean
}) {
  const t = useTerminology()
  const [search, setSearch] = useState('')
  const query = useDebounced(search, 300)

  const params = useMemo(() => ({ search: query, per_page: 25 }), [query])

  const directory = useQuery({
    queryKey: communicationKeys.directory(params),
    queryFn: () => communicationsApi.directory(params),
    placeholderData: (previous) => previous,
  })

  const chosen = new Set(selected.map((entry) => entry.user_id))
  const already = new Set(exclude)

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder="Search people"
        aria-label="Search the directory"
      />

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((entry) => (
            <li key={entry.user_id}>
              <button
                type="button"
                onClick={() => onToggle(entry)}
                className="inline-flex items-center gap-1.5 rounded-md bg-rail-active px-2 py-1 text-2xs text-gray-900 transition-colors hover:bg-gray-200"
              >
                {entry.name}
                <span className="text-gray-500" aria-hidden>
                  ×
                </span>
                <span className="sr-only">Remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="max-h-64 min-h-[12rem] overflow-y-auto rounded-md border border-gray-200">
        {directory.isError && (
          <ErrorState error={directory.error} onRetry={() => directory.refetch()} />
        )}

        {directory.isLoading && (
          <ul className="p-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="flex items-center gap-2 px-2 py-2">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!directory.isLoading && !directory.isError && (directory.data?.rows.length ?? 0) === 0 && (
          <EmptyState
            icon={<UsersThree size={20} />}
            title={query ? 'Nobody matches that' : 'Nobody to write to'}
            description={
              query
                ? 'Try part of a surname.'
                : 'The directory shows the people your role reaches — colleagues, your ' +
                  `${t('learners').toLowerCase()}, and their families.`
            }
          />
        )}

        <ul className="p-1">
          {(directory.data?.rows ?? []).map((entry) => {
            const isChosen = chosen.has(entry.user_id)
            const isAlready = already.has(entry.user_id)

            return (
              <li key={entry.user_id}>
                <button
                  type="button"
                  disabled={isAlready}
                  aria-pressed={isChosen || isAlready}
                  onClick={() => onToggle(entry)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                    isAlready
                      ? 'cursor-not-allowed opacity-55'
                      : isChosen
                        ? 'bg-rail-active'
                        : 'hover:bg-gray-50',
                  )}
                >
                  <Avatar name={entry.name} size="sm" className="shrink-0" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-gray-900">
                      {entry.name}
                    </span>
                    <span className="block truncate text-2xs text-gray-500">
                      {[
                        entry.title,
                        ...entry.kinds.map((kind) => directoryKindLabel(kind, t)),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {entry.guardian_of.length > 0 &&
                        ` · ${entry.guardian_of
                          .map((child) => child.name)
                          .filter(Boolean)
                          .join(', ')}`}
                    </span>
                  </span>

                  {isAlready ? (
                    <Badge tone="neutral" className="shrink-0">
                      In it
                    </Badge>
                  ) : (
                    isChosen && <Check size={14} weight="bold" className="shrink-0 text-gray-900" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {!multiple && selected.length > 1 && (
        <p className="text-2xs text-gray-500">Only one person can be added at a time.</p>
      )}
    </div>
  )
}
