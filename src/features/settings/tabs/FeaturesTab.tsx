import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, ErrorState, Skeleton, Switch } from '@/shared/ui'
import { ReadOnlyNote } from '../components/Facts'
import { settingsApi } from '../settings.api'
import { settingsKeys } from '../settings.keys'
import type { FeatureSwitch } from '../settings.types'

/**
 * What this institution's subscription includes.
 *
 * Every switch is disabled, and that is the honest rendering rather than a
 * limitation of this screen: `GET /admin/features` has no companion write route
 * anywhere in the API. These are the platform's switches on the institution's
 * plan, enforced by `feature:<key>` middleware on the routes each one covers —
 * hiding a nav item is presentation, the refusal happens server-side.
 *
 * An enabled-looking control that quietly saved nothing would be worse than no
 * control at all, so the state is shown and the reason is said.
 */
export function FeaturesTab() {
  const query = useQuery({
    queryKey: settingsKeys.features,
    queryFn: settingsApi.features,
    staleTime: 10 * 60_000,
  })

  const groups = useMemo(() => groupByGroup(query.data ?? []), [query.data])

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  if (query.isLoading) {
    return <FeaturesSkeleton />
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([group, features]) => (
        <Card key={group}>
          <CardHeader title={group} />
          <CardBody className="flex flex-col divide-y divide-gray-200 py-0">
            {features.map((feature) => (
              <div key={feature.key} className="flex items-start justify-between gap-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{feature.name}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{feature.description}</p>
                </div>
                <Switch
                  checked={feature.enabled}
                  onChange={() => undefined}
                  disabled
                  label={`${feature.name} — ${feature.enabled ? 'included' : 'not included'}`}
                  className="mt-1"
                />
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      <ReadOnlyNote>
        These are set by the platform against your institution&rsquo;s plan. To change one, talk to
        whoever manages the account — there is no request this screen could send.
      </ReadOnlyNote>
    </div>
  )
}

/** Grouped in first-seen order rather than alphabetically: the API returns them
 *  in the order it wants them read, and sorting would put Platform above
 *  Teaching for no reason a reader could name. */
function groupByGroup(features: FeatureSwitch[]): [string, FeatureSwitch[]][] {
  const groups = new Map<string, FeatureSwitch[]>()
  for (const feature of features) {
    const existing = groups.get(feature.group)
    if (existing) existing.push(feature)
    else groups.set(feature.group, [feature])
  }
  return [...groups.entries()]
}

function FeaturesSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: 3 }).map((_, card) => (
        <Card key={card}>
          <CardBody className="flex flex-col gap-4">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 2 }).map((__, row) => (
              <div key={row} className="flex items-start justify-between gap-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-4 w-8 rounded-full" />
              </div>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
