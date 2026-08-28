import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  Select,
  Skeleton,
} from '@/shared/ui'
import { coursesApi } from './academics.api'
import { academicsKeys } from './academics.keys'

/**
 * The scheme of work behind one subject.
 *
 * ── Read-only, and deliberately so ─────────────────────────────────────────
 *
 * `GET /admin/courses/{id}/curriculum` answers with `version: null`,
 * `editable: false` and no modules for every subject in this institution — no
 * curriculum version has been created. Authoring one is a multi-step flow
 * across `/admin/curricula/{id}/versions`, its course entries and their
 * modules, with publish and retire transitions on top; building an editor for
 * a shape nothing has ever returned would be building against a guess.
 *
 * So this screen shows what the API actually knows and says plainly what is
 * missing. `editable` is the server's own answer about whether this reader
 * could change it, and it is surfaced rather than assumed.
 */
export function CurriculumPage() {
  const t = useTerminology()
  const [courseId, setCourseId] = useState('')

  const courses = useQuery({
    queryKey: academicsKeys.courses.list({ per_page: PER_PAGE_DEFAULT }),
    queryFn: () => coursesApi.list({ per_page: PER_PAGE_DEFAULT }),
  })

  const rows = courses.data?.rows ?? []
  const selectedId = courseId || rows[0]?.id || ''

  const curriculum = useQuery({
    queryKey: academicsKeys.courses.curriculum(selectedId),
    queryFn: () => coursesApi.curriculum(selectedId),
    enabled: Boolean(selectedId),
  })

  return (
    <PageStack>
      <PageHeader title="Curriculum" />

      {courses.isError ? (
        <ErrorState error={courses.error} onRetry={() => courses.refetch()} />
      ) : rows.length === 0 && !courses.isLoading ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={20} />}
            title={`No ${t('courses').toLowerCase()} yet`}
            description={`A curriculum hangs off a ${t('course').toLowerCase()}. Add one first.`}
          />
        </Card>
      ) : (
        <>
          <div className="w-72">
            <Select
              aria-label={`Choose a ${t('course').toLowerCase()}`}
              value={selectedId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={courses.isLoading}
              options={rows.map((row) => ({
                value: row.id,
                label: `${row.title} · ${row.code}`,
              }))}
            />
          </div>

          {curriculum.isError ? (
            <ErrorState error={curriculum.error} onRetry={() => curriculum.refetch()} />
          ) : curriculum.isLoading ? (
            <Card>
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </Card>
          ) : curriculum.data ? (
            <Card>
              <CardHeader
                title={curriculum.data.subject.title}
                subtitle={curriculum.data.subject.code}
                actions={
                  curriculum.data.version ? (
                    <Badge tone="accent">
                      {curriculum.data.version.status ?? 'version'}
                    </Badge>
                  ) : (
                    <Badge>No version</Badge>
                  )
                }
              />

              <Facts>
                <Fact label={t('level')}>{curriculum.data.level?.name ?? 'Not scoped to one'}</Fact>
                <Fact label="Modules">{curriculum.data.modules.length}</Fact>
                <Fact label="Editable here">
                  {curriculum.data.editable ? 'Yes' : 'No'}
                </Fact>
              </Facts>

              {curriculum.data.modules.length === 0 && (
                <div className="border-t border-gray-200">
                  <EmptyState
                    icon={<BookOpen size={20} />}
                    title="No scheme of work yet"
                    description={`No curriculum version has been published for ${curriculum.data.subject.title}. Until one exists there is nothing for a teacher's plan or a report card comment to point at.`}
                  />
                </div>
              )}

              {curriculum.data.modules.length > 0 && (
                <ol className="divide-y divide-gray-200 border-t border-gray-200">
                  {curriculum.data.modules.map((module) => (
                    <li key={module.id} className="flex gap-3 px-4 py-3">
                      <span className="tabular w-6 shrink-0 text-sm text-gray-500">
                        {module.sequence}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{module.title}</p>
                        {module.description && (
                          <p className="mt-0.5 text-xs text-gray-600">{module.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : null}
        </>
      )}
    </PageStack>
  )
}
