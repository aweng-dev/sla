import { useQuery } from '@tanstack/react-query'
import { BookOpen, Warning } from '@phosphor-icons/react'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatTile } from '@/shared/ui'
import { formatDate, formatMoney, formatNumber, formatRelative } from '@/shared/lib/format'
import { portalApi, portalKeys } from '../portal.api'

/**
 * The library card, as its holder sees it.
 *
 * ── `days_overdue` is the API's number ─────────────────────────────────────
 *
 * Never one derived here by comparing a due date to the browser clock. The
 * server knows the grace period; a phone in another timezone does not, and a
 * card that said "2 days late" beside a fine assessed for one is the kind of
 * disagreement a parent asks the office about.
 *
 * ── A guardian reads this and cannot borrow from it ────────────────────────
 *
 * Reserving stays the caller's own card — a parent may see a child's loans and
 * may not join a queue for them — so there is no reserve button here at all.
 */
export function MyLibrary() {
  const standing = useQuery({
    queryKey: portalKeys.library,
    queryFn: portalApi.libraryStanding,
  })

  const loans = useQuery({
    queryKey: portalKeys.libraryLoans,
    queryFn: portalApi.libraryLoans,
  })

  if (standing.isError) {
    return (
      <Card>
        <ErrorState error={standing.error} onRetry={() => standing.refetch()} />
      </Card>
    )
  }

  if (standing.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }

  const card = standing.data

  if (!card) {
    return (
      <Card>
        <EmptyState
          icon={<BookOpen size={20} />}
          title="No library card"
          description="Membership is set up at the desk. Once it is, what is out and what is due appears here."
        />
      </Card>
    )
  }

  const out = (loans.data ?? []).filter((loan) => loan.is_outstanding)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Out on loan"
          value={formatNumber(out.length)}
          hint={`Ceiling of ${formatNumber(card.loan_ceiling)}`}
          icon={<BookOpen size={16} />}
          loading={loans.isLoading}
        />
        <StatTile
          label="Overdue"
          value={formatNumber(card.overdue_count)}
          hint={card.has_overdue_items ? 'Please return these' : 'Nothing late'}
          icon={<Warning size={16} />}
        />
        <StatTile
          label="Owed"
          value={formatMoney(card.owed_minor, card.currency)}
          hint={card.owed_minor === 0 ? 'Nothing outstanding' : 'Fines on the card'}
        />
      </div>

      <Card>
        <CardHeader
          title="What is out"
          subtitle={`Card ${card.member_number}`}
          actions={<Badge tone={card.status === 'active' ? 'success' : 'neutral'}>{card.status}</Badge>}
        />

        {loans.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : out.length === 0 ? (
          <EmptyState title="Nothing out" description="Books you borrow appear here with their due dates." />
        ) : (
          <ul className="divide-y divide-gray-200">
            {out.map((loan) => (
              <li key={loan.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-900">
                    {loan.copy?.title?.title ?? loan.copy?.barcode ?? 'Copy'}
                  </span>
                  <span className="block text-2xs text-gray-500">{loan.copy?.barcode}</span>
                </span>

                <span className="shrink-0 text-right">
                  {/* The server's own count, not a date this screen compares. */}
                  {loan.days_overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-danger-600">
                      <Warning size={12} weight="fill" />
                      {formatNumber(loan.days_overdue)}{' '}
                      {loan.days_overdue === 1 ? 'day' : 'days'} late
                    </span>
                  ) : (
                    <span className="text-xs text-gray-900" title={formatDate(loan.due_at)}>
                      Due {loan.due_at ? formatRelative(loan.due_at) : '—'}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
