import { useQuery } from '@tanstack/react-query'
import { Bus, MapPin } from '@phosphor-icons/react'
import { Badge, Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/shared/ui'
import { formatDate } from '@/shared/lib/format'
import { useViewer } from '@/features/tenant/TenantProvider'
import { portalApi, portalKeys } from '../portal.api'

/**
 * The route, as a rider or their family sees it.
 *
 * ── The stops are the point ────────────────────────────────────────────────
 *
 * A parent's question is "where and when is my child picked up", and the answer
 * is a stop and a time, in order along the route. A route name on its own
 * answers nothing, so the stops are listed rather than hidden behind a link.
 */
export function MyTransport() {
  const viewer = useViewer()

  const rides = useQuery({
    queryKey: portalKeys.transport,
    queryFn: portalApi.transportRoute,
  })

  if (rides.isError) {
    return (
      <Card>
        <ErrorState error={rides.error} onRetry={() => rides.refetch()} />
      </Card>
    )
  }

  if (rides.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }

  const rows = rides.data ?? []
  const riding = rows.filter((row) => row.has_place)

  if (riding.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Bus size={20} />}
          title="No place on a route"
          description={
            viewer.isGuardian && !viewer.isStudent
              ? 'When a place is arranged, the route and its stops appear here.'
              : 'When you are given a place, your route and its stops appear here.'
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {riding.map((ride) => (
        <Card key={ride.student_id}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-gray-900">
                {ride.route?.name ?? 'Route'}
              </h3>
              <p className="mt-0.5 text-2xs text-gray-600">
                {ride.route?.code}
                {ride.subscription?.starts_on && ` · from ${formatDate(ride.subscription.starts_on)}`}
              </p>
            </div>
            {ride.subscription && <StatusBadge status={ride.subscription.status} />}
          </div>

          {(ride.stops ?? []).length === 0 ? (
            <EmptyState
              icon={<MapPin size={20} />}
              title="No stops listed"
              description="A route with no stops has nowhere to be picked up from."
            />
          ) : (
            <ol className="divide-y divide-gray-200">
              {(ride.stops ?? [])
                .slice()
                .sort((a, b) => a.sequence - b.sequence)
                .map((stop) => (
                  <li key={stop.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-5 shrink-0 text-right text-2xs text-gray-500 tabular">
                      {stop.sequence}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{stop.name}</span>
                    <span className="shrink-0 text-2xs text-gray-500 tabular">
                      {stop.scheduled_arrival ?? '—'}
                    </span>
                  </li>
                ))}
            </ol>
          )}

          {(ride.recent_trips ?? []).length > 0 && (
            <p className="border-t border-gray-200 px-4 py-2 text-2xs text-gray-600">
              Recent runs:{' '}
              {(ride.recent_trips ?? [])
                .slice(0, 3)
                .map((trip) => `${trip.ran_on ? formatDate(trip.ran_on) : '—'} (${trip.status})`)
                .join(', ')}
            </p>
          )}

          {!ride.has_place && <Badge tone="neutral">No place</Badge>}
        </Card>
      ))}
    </div>
  )
}
