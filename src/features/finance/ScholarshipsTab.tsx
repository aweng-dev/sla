import { useQuery } from '@tanstack/react-query'
import { Medal } from '@phosphor-icons/react'
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { financeApi, financeKeys } from './finance.api'

/**
 * Bursaries and scholarships.
 *
 * An award reduces what a learner owes without money arriving. The catalogue
 * of schemes lives elsewhere (`/admin/catalog/scholarships`), and this
 * institution has none defined — so the honest screen says that rather than
 * offering an award form whose first field would have no options.
 */
export function ScholarshipsTab() {
  const schemes = useQuery({
    queryKey: financeKeys.scholarships(),
    queryFn: financeApi.scholarships,
    staleTime: 10 * 60_000,
  })

  const awards = useQuery({
    queryKey: financeKeys.awards(),
    queryFn: () => financeApi.awards({ per_page: 50 }),
  })

  if (awards.isError) return <ErrorState error={awards.error} onRetry={() => awards.refetch()} />

  if (schemes.isLoading || awards.isLoading) return <Skeleton className="h-40 w-full" />

  const rows = awards.data?.rows ?? []
  const noSchemes = (schemes.data ?? []).length === 0

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Medal size={20} />}
        title={noSchemes ? 'No scholarship schemes are defined' : 'No awards yet'}
        description={
          noSchemes
            ? 'An award reduces what a learner owes without a payment arriving. Before anyone can be awarded one, the institution needs at least one scheme defined — that is set up outside this screen.'
            : 'Nobody has been awarded a scholarship or bursary for this session.'
        }
      />
    )
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {rows.map((award) => (
        <li key={award.id} className="px-4 py-3">
          <p className="text-sm text-gray-900">{award.student?.name ?? award.student_id}</p>
          <p className="mt-0.5 text-xs text-gray-600">{award.reason ?? 'No reason recorded'}</p>
        </li>
      ))}
    </ul>
  )
}
