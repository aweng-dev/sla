import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { CurriculumStatusBadge } from '@/features/subjects/components/CurriculumStatusBadge'
import {
  curriculumApi,
  curriculumKeys,
  type CurriculumStatus,
  type OfferingCurriculum,
} from '@/features/subjects/curriculum.api'
import {
  FilterSelect,
  useCourseCatalog,
  useGroupCatalog,
  usePeriodCatalog,
  useSessionCatalog,
} from './components/pickers'

/**
 * Every scheme of work in the institution, across subjects.
 *
 * ── What this screen used to be, and why it changed ────────────────────────
 *
 * It used to show `GET /admin/courses/{id}/curriculum` with no year group — a
 * subject picker above one document, captioned "Level: not scoped to one". It
 * therefore said, on every visit, that Mathematics has A curriculum. It does
 * not: 3A and 3C are taught the same subject at different paces and each has
 * its own, which is what `offering_curricula` records. A screen asserting the
 * opposite was the conflicting concept, so it is gone.
 *
 * The programme chain it read — curriculum → version → required subject — is
 * untouched and still serves what a PROGRAMME requires of a cohort. That is a
 * different question from what 3A is being taught this term, and it is asked
 * from the programme, not from here.
 *
 * ── A cross-subject index, because the per-subject view already exists ─────
 *
 * A subject's own page shows its classes and their curricula. This is the view
 * across all of them: the four filters answer "which classes have nothing for
 * next term", which is the question that is asked once a term and has no home
 * on any single subject's page.
 *
 * ── Every row names a class ───────────────────────────────────────────────
 *
 * There is no row here that is about a subject alone, because there is no such
 * document.
 */

const STATUSES: { value: CurriculumStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

export function CurriculumPage() {
  const t = useTerminology()
  const { access } = useTenant()

  const [courseId, setCourseId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [sessionId, setSessionId] = useState(access?.calendar?.session?.id ?? '')
  const [periodId, setPeriodId] = useState('')
  const [status, setStatus] = useState<CurriculumStatus | ''>('')
  const [page, setPage] = useState(1)

  const courses = useCourseCatalog()
  const groups = useGroupCatalog()
  const sessions = useSessionCatalog()
  const periods = usePeriodCatalog()

  const filters = {
    course_id: courseId || undefined,
    learning_group_id: groupId || undefined,
    academic_session_id: sessionId || undefined,
    academic_period_id: periodId || undefined,
    status: status || undefined,
    page,
    per_page: PER_PAGE_DEFAULT,
  }

  const query = useQuery({
    queryKey: curriculumKeys.list(filters),
    queryFn: () => curriculumApi.list(filters),
    placeholderData: (previous) => previous,
  })

  const anyFilter = Boolean(courseId || groupId || sessionId || periodId || status)

  const columns = useMemo<Column<OfferingCurriculum>[]>(
    () => [
      {
        key: 'title',
        header: 'Curriculum',
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.title}</span>
            <span className="truncate text-xs text-gray-600">
              {row.course_title ?? '—'}
              {row.course_code ? ` · ${row.course_code}` : ''}
            </span>
          </span>
        ),
      },
      {
        key: 'group',
        header: t('group'),
        width: '11rem',
        cell: (row) => (
          <span className="text-gray-700">{row.learning_group_name ?? '—'}</span>
        ),
      },
      {
        key: 'when',
        header: t('period'),
        width: '11rem',
        cell: (row) => (
          <span className="flex flex-col text-gray-700">
            <span>{row.academic_period_name ?? '—'}</span>
            <span className="text-xs text-gray-600">{row.academic_session_name ?? ''}</span>
          </span>
        ),
      },
      {
        key: 'version',
        header: 'Version',
        width: '6rem',
        cell: (row) => <span className="tabular text-gray-700">{row.version}</span>,
      },
      {
        key: 'units',
        header: 'Units',
        numeric: true,
        width: '5.5rem',
        cell: (row) => formatNumber(row.module_count ?? 0),
      },
      {
        key: 'status',
        header: 'Status',
        width: '9rem',
        cell: (row) => (
          <span className="flex flex-col gap-0.5">
            <CurriculumStatusBadge status={row.status} />
            {row.published_at && (
              <span className="text-2xs text-gray-500">{formatDateTime(row.published_at)}</span>
            )}
          </span>
        ),
      },
    ],
    [t],
  )

  return (
    <PageStack>
      <PageHeader
        title="Curriculum"
        description={`What each ${t('group').toLowerCase()} is taught, subject by subject. Every scheme of work belongs to one ${t('group').toLowerCase()} — open a ${t('course').toLowerCase()} to write one.`}
      />

      <Toolbar
        filters={
          <>
            <FilterSelect
              value={courseId}
              onChange={(value) => {
                setCourseId(value)
                setPage(1)
              }}
              options={courses.options}
              allLabel={`All ${t('courses').toLowerCase()}`}
              disabled={courses.isLoading}
            />
            <FilterSelect
              value={groupId}
              onChange={(value) => {
                setGroupId(value)
                setPage(1)
              }}
              options={groups.options}
              allLabel={`All ${t('groups').toLowerCase()}`}
              disabled={groups.isLoading}
            />
            <FilterSelect
              value={sessionId}
              onChange={(value) => {
                setSessionId(value)
                setPage(1)
              }}
              options={sessions.options}
              allLabel={`All ${t('sessions').toLowerCase()}`}
              disabled={sessions.isLoading}
              className="w-40"
            />
            <FilterSelect
              value={periodId}
              onChange={(value) => {
                setPeriodId(value)
                setPage(1)
              }}
              options={periods.options}
              allLabel={`All ${t('periods').toLowerCase()}`}
              disabled={periods.isLoading}
              className="w-40"
            />
            <FilterSelect
              value={status}
              onChange={(value) => {
                setStatus(value as CurriculumStatus | '')
                setPage(1)
              }}
              options={STATUSES.filter((option) => option.value !== '').map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              allLabel="Any status"
              className="w-36"
            />
          </>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={query.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            /* The subject in the path, because the editor's back link goes to
             * the subject workspace and a curriculum has no address that does
             * not name the subject it belongs to. */
            rowHref={(row) =>
              row.course_id ? `/courses/${row.course_id}/curriculum/${row.id}` : ''
            }
            loading={query.isLoading}
            skeletonRows={6}
            empty={
              anyFilter ? (
                <EmptyState
                  icon={<ListChecks size={20} />}
                  title="Nothing matches"
                  description="No scheme of work matches these filters."
                  action={
                    <Button
                      onClick={() => {
                        setCourseId('')
                        setGroupId('')
                        setSessionId('')
                        setPeriodId('')
                        setStatus('')
                        setPage(1)
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<ListChecks size={20} />}
                  title="No schemes of work yet"
                  description={`A curriculum is written for one ${t('group').toLowerCase()} taking one ${t('course').toLowerCase()}. Open a ${t('course').toLowerCase()} and start one from the ${t('group').toLowerCase()} that needs it.`}
                />
              )
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}
    </PageStack>
  )
}
