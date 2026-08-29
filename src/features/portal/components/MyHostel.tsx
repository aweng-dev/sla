import { useQuery } from '@tanstack/react-query'
import { Bed } from '@phosphor-icons/react'
import { Card, EmptyState, ErrorState, Fact, Facts, Skeleton, StatusBadge } from '@/shared/ui'
import { formatDate, formatDateTime } from '@/shared/lib/format'
import { useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { portalApi, portalKeys } from '../portal.api'

/**
 * The bed, as its occupant or their family sees it.
 *
 * A collection rather than one record, because a guardian may have several
 * children in residence — and because a learner who moved rooms mid-session has
 * a chain of allocations, of which only one holds a bed.
 */
export function MyHostel() {
  const t = useTerminology()
  const viewer = useViewer()

  const allocations = useQuery({
    queryKey: portalKeys.hostel,
    queryFn: portalApi.hostelAllocation,
  })

  if (allocations.isError) {
    return (
      <Card>
        <ErrorState error={allocations.error} onRetry={() => allocations.refetch()} />
      </Card>
    )
  }

  if (allocations.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }

  const rows = allocations.data ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Bed size={20} />}
          title="No room allocated"
          description={
            viewer.isGuardian && !viewer.isStudent
              ? 'When a room is allocated, the block, the bed and the check-in date appear here.'
              : 'When you are given a room, the block, the bed and your check-in date appear here.'
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((allocation) => (
        <Card key={allocation.id}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-gray-900">
                {allocation.bed?.room?.name ?? 'Room'}
                {allocation.bed?.label && ` · bed ${allocation.bed.label}`}
              </h3>
              {/* Named only where a guardian is reading several. */}
              {viewer.isGuardian && allocation.student?.name && (
                <p className="mt-0.5 text-2xs text-gray-600">{allocation.student.name}</p>
              )}
            </div>
            <StatusBadge status={allocation.status} />
          </div>

          <Facts>
            <Fact label="Stay">
              {allocation.starts_on ? formatDate(allocation.starts_on) : '—'}
              {allocation.ends_on && ` → ${formatDate(allocation.ends_on)}`}
            </Fact>
            <Fact label="Checked in">
              {allocation.checked_in_at ? formatDateTime(allocation.checked_in_at) : 'Not yet'}
            </Fact>
            <Fact label="Checked out">
              {allocation.checked_out_at ? formatDateTime(allocation.checked_out_at) : 'Not yet'}
            </Fact>
            <Fact label={`Bed held for this ${t('learner').toLowerCase()}`}>
              {allocation.holds_bed ? 'Yes' : 'No'}
            </Fact>
          </Facts>
        </Card>
      ))}
    </div>
  )
}
