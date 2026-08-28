import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CaretRight, Keyboard, MagnifyingGlass, X } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton } from '@/shared/ui'
import { ModuleIcon } from '@/shared/icons/moduleIcons'
import { cn } from '@/shared/lib/cn'
import type { TerminologyKey } from '@/shared/types/tenant.types'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  GROUP_TERMINOLOGY,
  moduleForSource,
  searchKeys,
  searchQuery,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_TERM,
  SEARCH_MIN_TERM,
  SEARCH_PREVIEW_LIMIT,
  type SearchGroup,
  type SearchHit,
} from './search.api'

/**
 * One term, four modules, and nothing the reader could not already open.
 *
 * ── No request the server would refuse ─────────────────────────────────────
 *
 * Three rules, all of them the server's own. The term is not sent below two
 * characters — the API answers empty rather than 422 there, but it is still a
 * round trip whose answer is known, and the screen states the floor instead of
 * silently returning nothing. The field is capped at the `max:120` the request
 * validates. And `source` is only ever a value a previous response named in
 * `searched`, so the enum cannot be missed.
 *
 * ── Why the filters come from the response ─────────────────────────────────
 *
 * `searched` names the sources that were queried FOR THIS READER. A source they
 * do not reach is absent from it, and so is a module the institution does not
 * run — the API declines to say which, deliberately. Building the filter row
 * from a hard-coded list would put back exactly the map of the institution that
 * omission exists to withhold.
 *
 * ── Keyboard ───────────────────────────────────────────────────────────────
 *
 * Down and up move real DOM focus between real anchors rather than painting a
 * highlight and tracking `aria-activedescendant`. Enter is then the browser's
 * own, and so is every assistive technology's idea of where the reader is.
 */
export function SearchPage() {
  const t = useTerminology()

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [source, setSource] = useState('')
  /**
   * The sources this reader reaches, with the API's own label for each.
   *
   * Captured from an unnarrowed answer and held, because a narrowed one names
   * only the source it was narrowed to — `groups` carries one entry per source
   * that was queried, empty ones included, which is exactly the filter row.
   */
  const [reachable, setReachable] = useState<{ source: string; label: string }[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const hitRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const trimmed = term.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < SEARCH_MIN_TERM
  const limit = source ? SEARCH_MAX_LIMIT : SEARCH_PREVIEW_LIMIT

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(id)
  }, [term])

  const enabled = debounced.length >= SEARCH_MIN_TERM

  const query = useQuery({
    queryKey: searchKeys.query(debounced, source, limit),
    queryFn: () => searchQuery(debounced, source, limit),
    enabled,
    /* The field is a live one; dropping the previous answer on every keystroke
     * would flash the whole page to skeletons between two-character edits. */
    placeholderData: (previous) => previous,
  })

  useEffect(() => {
    if (source === '' && query.data && query.data.groups.length > 0) {
      setReachable(query.data.groups.map((group) => ({ source: group.source, label: group.label })))
    }
  }, [source, query.data])

  const groups = useMemo(
    () => (query.data?.groups ?? []).filter((group) => group.hits.length > 0),
    [query.data],
  )

  /* Each group's first index in the flattened, keyboard-navigable list. */
  const offsets = useMemo(() => {
    let cursor = 0
    return groups.map((group) => {
      const offset = cursor
      cursor += group.hits.length
      return offset
    })
  }, [groups])

  const total = groups.reduce((sum, group) => sum + group.hits.length, 0)

  function focusHit(index: number) {
    if (total === 0) return
    const clamped = Math.max(0, Math.min(index, total - 1))
    hitRefs.current[clamped]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusHit(activeIndex + 1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (activeIndex <= 0) inputRef.current?.focus()
      else focusHit(activeIndex - 1)
      return
    }

    if (event.key === 'Escape' && trimmed !== '') {
      event.preventDefault()
      setTerm('')
      setSource('')
      inputRef.current?.focus()
    }
  }

  return (
    <PageStack>
      <PageHeader
        title="Search"
        description="Find a record by name, number or reference, across everything you can already open."
      />

      {/*
        * The one control on the screen, and a little larger than the system
        * control because of it — but only a little. Sprig's own search fields
        * are 32px, 6px-radius and about 180px wide; a full-bleed 44px pill
        * belongs to a different product. 40px, the same 6px radius, 14px text
        * and a reading-width cap keeps it recognisably the same family.
        */}
      <div onKeyDown={onKeyDown}>
        <div className="max-w-xl">
          <Input
            ref={inputRef}
            type="search"
            autoFocus
            value={term}
            maxLength={SEARCH_MAX_TERM}
            onChange={(event) => setTerm(event.currentTarget.value)}
            onFocus={() => setActiveIndex(-1)}
            placeholder={`Search ${t('learners').toLowerCase()}, people, work and records`}
            aria-label="Search"
            icon={<MagnifyingGlass size={15} />}
            trailing={
              term !== '' ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setTerm('')
                    setSource('')
                    inputRef.current?.focus()
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <X size={13} weight="bold" />
                </button>
              ) : undefined
            }
            className="h-10 text-base [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>

        {reachable.length > 1 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <SourceChip active={source === ''} onClick={() => setSource('')}>
              Everything
            </SourceChip>
            {reachable.map((entry) => (
              <SourceChip
                key={entry.source}
                active={source === entry.source}
                onClick={() => setSource(source === entry.source ? '' : entry.source)}
              >
                {groupLabel(entry.source, entry.label, t)}
              </SourceChip>
            ))}
          </div>
        )}

        <div className="mt-4">
          {trimmed === '' && (
            <Card>
              <EmptyState
                icon={<MagnifyingGlass size={20} />}
                title="Search the institution"
                description={`Type a name, a ${t('learner').toLowerCase()} or staff number, or a reference. Only records you can already open are searched.`}
              />
            </Card>
          )}

          {tooShort && (
            <Card>
              <EmptyState
                icon={<Keyboard size={20} />}
                title={`Keep going — ${SEARCH_MIN_TERM} characters minimum`}
                description={`A single letter matches most of the institution, so the server does not search below ${SEARCH_MIN_TERM} characters.`}
              />
            </Card>
          )}

          {enabled && query.isError && (
            <Card>
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            </Card>
          )}

          {enabled && !query.isError && !query.data && <ResultsSkeleton />}

          {enabled && !query.isError && query.data && groups.length === 0 && (
            <Card>
              <EmptyState
                icon={<MagnifyingGlass size={20} />}
                title={`No matches for “${query.data.term}”`}
                description={
                  source
                    ? 'Nothing in this group matched. Try “Everything”, or search on a number.'
                    : 'Try a surname, an admission or staff number, or part of a reference.'
                }
                action={
                  source ? <Button onClick={() => setSource('')}>Search everything</Button> : undefined
                }
              />
            </Card>
          )}

          {enabled && !query.isError && groups.length > 0 && (
            <div className="flex flex-col gap-4">
              {groups.map((group, groupIndex) => (
                <ResultGroup
                  key={group.source}
                  group={group}
                  label={groupLabel(group.source, group.label, t)}
                  offset={offsets[groupIndex]}
                  narrowed={source !== ''}
                  onNarrow={() => setSource(group.source)}
                  registerHit={(index, node) => {
                    hitRefs.current[index] = node
                  }}
                  onHitFocus={setActiveIndex}
                />
              ))}

              <p className="flex items-center gap-1.5 px-1 text-2xs text-gray-500">
                <Keyboard size={13} aria-hidden />
                Use the up and down arrows to move through results, Enter to open, Escape to clear.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageStack>
  )
}

function ResultGroup({
  group,
  label,
  offset,
  narrowed,
  onNarrow,
  registerHit,
  onHitFocus,
}: {
  group: SearchGroup
  label: string
  offset: number
  narrowed: boolean
  onNarrow: () => void
  registerHit: (index: number, node: HTMLAnchorElement | null) => void
  onHitFocus: (index: number) => void
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ModuleIcon name={moduleForSource(group.source)} size={14} className="text-gray-500" />
          {label}
        </h2>
        {group.has_more && !narrowed && (
          <Button variant="link" size="sm" onClick={onNarrow}>
            More in {label.toLowerCase()}
          </Button>
        )}
      </div>

      <ul>
        {group.hits.map((hit, index) => (
          <li key={hit.id} className="border-b border-gray-200 last:border-0">
            <HitLink
              hit={hit}
              hitRef={(node) => registerHit(offset + index, node)}
              onFocus={() => onHitFocus(offset + index)}
            />
          </li>
        ))}
      </ul>

      {group.has_more && narrowed && (
        <p className="border-t border-gray-200 px-4 py-2 text-2xs text-gray-500">
          More than {group.hits.length} match. Add a surname or a number to narrow it.
        </p>
      )}
    </Card>
  )
}

function HitLink({
  hit,
  hitRef,
  onFocus,
}: {
  hit: SearchHit
  hitRef: (node: HTMLAnchorElement | null) => void
  onFocus: () => void
}) {
  const className =
    'flex items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40'

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-900">{hit.title}</span>
        {hit.subtitle && (
          <span className="block truncate text-xs text-gray-600">{hit.subtitle}</span>
        )}
      </span>
      <CaretRight size={13} className="shrink-0 text-gray-400" aria-hidden />
    </>
  )

  /* A learner is the one hit this app can open on its own screen. Everything
   * else opens its module — see `moduleForSource`. */
  if (hit.source === 'students') {
    return (
      <Link
        to="/students/$studentId"
        params={{ studentId: hit.id }}
        ref={hitRef}
        onFocus={onFocus}
        className={className}
      >
        {body}
      </Link>
    )
  }

  return (
    <Link
      to="/$module"
      params={{ module: moduleForSource(hit.source) }}
      ref={hitRef}
      onFocus={onFocus}
      className={className}
    >
      {body}
    </Link>
  )
}

/**
 * One source of the search, on or off.
 *
 * Shaped like the product's filter pill — 32px, 6px radius, hairline, label
 * only — rather than as a rounded capsule with a leading glyph. The chosen one
 * is marked by a heavier border and a grey fill, not by inverting to solid
 * black: a row of filters is not the place this product spends its contrast.
 */
function SourceChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center rounded-md border bg-white px-2.5 text-sm transition-colors',
        active
          ? 'border-gray-400 bg-gray-100 font-medium text-gray-900'
          : 'border-gray-300 text-gray-800 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 2 }).map((_, group) => (
        <Card key={group}>
          <div className="border-b border-gray-200 px-4 py-2.5">
            <Skeleton className="h-3 w-24" />
          </div>
          <ul>
            {Array.from({ length: 3 }).map((__, row) => (
              <li key={row} className="space-y-1.5 border-b border-gray-200 px-4 py-2.5 last:border-0">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-24" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

/** The institution's own word where it has one, and the API's label where it
 *  does not. See `GROUP_TERMINOLOGY`. */
function groupLabel(
  source: string,
  apiLabel: string,
  t: (key: TerminologyKey, fallback?: string) => string,
): string {
  const key = GROUP_TERMINOLOGY[source]
  return key ? t(key, apiLabel) : apiLabel
}
