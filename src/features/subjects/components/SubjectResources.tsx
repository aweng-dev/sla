import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CaretRight, Stack } from '@phosphor-icons/react'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { formatNumber } from '@/shared/lib/format'
import { useModules } from '@/features/tenant/TenantProvider'
import { lessonKeys, lessonsApi } from '@/features/lessons/lessons.api'

/**
 * The teaching material behind this subject.
 *
 * ── What a "resource" is here ──────────────────────────────────────────────
 *
 * The learning modules and lessons authored against this course — the same
 * records the Lessons screen owns, filtered to this subject. Not a new store:
 * `/teaching/learning-modules?course_id=` already answers exactly this
 * question, and inventing a second place to put a worksheet would mean two
 * places to look for one.
 *
 * ── The distinction from a curriculum is worth keeping straight ────────────
 *
 * A curriculum is what a CLASS is taught and when. Material is what it is
 * taught FROM, and it outlives any one class or term — which is why it hangs
 * off the course while a curriculum hangs off the class's assignment. Both are
 * on this page, on different tabs, for that reason.
 *
 * ── Absent when the module is off ─────────────────────────────────────────
 *
 * `lms` gates the endpoint. An institution without it gets a sentence saying
 * so rather than a spinner that resolves to a 403.
 */
export function SubjectResources({
  courseId,
  subjectTitle,
}: {
  courseId: string
  subjectTitle: string
}) {
  const navigate = useNavigate()
  const modules = useModules()
  const enabled = modules.has('lms')

  const query = useQuery({
    queryKey: lessonKeys.modules({ course_id: courseId }),
    queryFn: () => lessonsApi.modules({ course_id: courseId }),
    enabled: enabled && Boolean(courseId),
  })

  if (!enabled) {
    return (
      <Card>
        <EmptyState
          icon={<Stack size={20} />}
          title="Lessons are not switched on"
          description="Teaching material lives in the lessons module. An administrator can enable it for this institution."
        />
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    )
  }

  const rows = query.data?.rows ?? []

  return (
    <Card>
      <CardHeader
        title="Teaching material"
        subtitle={`Units and lessons authored against ${subjectTitle}. They outlive any one class or term.`}
        actions={
          <Button onClick={() => void navigate({ to: '/lms' })}>Open lessons</Button>
        }
      />

      {query.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Stack size={20} />}
          title="Nothing yet"
          description={`No teaching material has been written against ${subjectTitle}. A curriculum says what a class covers; material is what they cover it with.`}
          action={<Button variant="primary" onClick={() => void navigate({ to: '/lms' })}>Add material</Button>}
        />
      ) : (
        <ul className="divide-y divide-gray-200">
          {rows.map((unit) => (
            <li key={unit.id}>
              <button
                type="button"
                onClick={() => void navigate({ to: '/lms' })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {unit.title}
                  </span>
                  <span className="block truncate text-xs text-gray-600">
                    {formatNumber(unit.lesson_count ?? 0)} lesson
                    {(unit.lesson_count ?? 0) === 1 ? '' : 's'}
                    {unit.published_lesson_count !== undefined &&
                      ` · ${formatNumber(unit.published_lesson_count)} published`}
                    {/* A unit written for one term's running of the subject
                      * rather than for the subject itself. Worth saying: it
                      * will not be there next year. */}
                    {unit.owner_kind === 'course_offering' && ' · this term only'}
                  </span>
                </span>

                {unit.is_published ? (
                  <Badge tone="success">Published</Badge>
                ) : (
                  <Badge>Draft</Badge>
                )}

                <CaretRight size={13} className="shrink-0 text-gray-400" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
