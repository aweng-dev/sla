import { useQuery } from '@tanstack/react-query'
import { GraduationCap } from '@phosphor-icons/react'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { portalApi, portalKeys, type PortalResult } from '../portal.api'

/**
 * Results, as the person they are about reads them.
 *
 * ── Published only, and the emptiness is meaningful ────────────────────────
 *
 * `/portal/results` joins the caller's own published grades. A learner whose
 * teacher finished marking this morning still sees nothing, because releasing
 * is a separate decision somebody has to take — so the empty state says that
 * rather than implying no work has been done.
 *
 * ── The components are the answer to "why" ─────────────────────────────────
 *
 * A percentage on its own invites the one question this screen should already
 * have answered: where did it come from. Each grade carries its category
 * breakdown, so the coursework and the exam are shown separately with the
 * weight each carried.
 */
export function MyResults() {
  const t = useTerminology()
  const viewer = useViewer()

  const results = useQuery({
    queryKey: portalKeys.results,
    queryFn: portalApi.results,
  })

  if (results.isError) {
    return (
      <Card>
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      </Card>
    )
  }

  if (results.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    )
  }

  const rows = results.data ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<GraduationCap size={20} />}
          title="Nothing has been released yet"
          description={
            viewer.isGuardian && !viewer.isStudent
              ? `Results appear here once the institution publishes them. Marking being finished is not the same as results being released.`
              : `Your results appear here once they are released. A ${t('teacher').toLowerCase()} finishing marking is not the same as the institution releasing them.`
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <ResultCard key={row.id} result={row} />
      ))}
    </div>
  )
}

function ResultCard({ result }: { result: PortalResult }) {
  const components = (result.components ?? []).slice().sort((a, b) => a.sequence - b.sequence)

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {result.course?.title ?? 'Course'}
          </h3>
          <p className="mt-0.5 text-2xs text-gray-600">
            {result.course?.code}
            {result.published_at && ` · released ${formatDate(result.published_at)}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {result.letter_grade && (
            <span className="text-lg font-semibold text-gray-900">{result.letter_grade}</span>
          )}
          <span className="text-sm text-gray-900 tabular">
            {result.percentage === null ? '—' : `${formatNumber(result.percentage)}%`}
          </span>
          {result.is_passing !== null && (
            <Badge tone={result.is_passing ? 'success' : 'danger'}>
              {result.is_passing ? 'Pass' : 'Fail'}
            </Badge>
          )}
        </div>
      </div>

      {components.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {components.map((component) => (
            <li key={component.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {component.label ?? 'Assessment'}
                {component.items_count !== null && component.items_count > 0 && (
                  <span className="text-gray-500">
                    {' '}
                    · {formatNumber(component.items_count)}{' '}
                    {component.items_count === 1 ? 'piece' : 'pieces'}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-2xs text-gray-500 tabular">
                {component.weight_percent === null
                  ? ''
                  : `${formatNumber(component.weight_percent)}% of the mark`}
              </span>

              <span className="w-24 shrink-0 text-right text-sm text-gray-900 tabular">
                {component.raw_score === null
                  ? '—'
                  : `${formatNumber(component.raw_score)}/${formatNumber(component.max_score ?? 0)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(result.class_position !== null && result.class_position !== undefined) ||
      (result.class_average !== null && result.class_average !== undefined) ? (
        <p className="border-t border-gray-200 px-4 py-2 text-2xs text-gray-600">
          {result.class_position !== null && result.class_position !== undefined && (
            <>Position {formatNumber(result.class_position)} in the class</>
          )}
          {result.class_average !== null && result.class_average !== undefined && (
            <>
              {result.class_position !== null && result.class_position !== undefined && ' · '}
              class average {formatNumber(result.class_average)}%
            </>
          )}
        </p>
      ) : null}
    </Card>
  )
}
