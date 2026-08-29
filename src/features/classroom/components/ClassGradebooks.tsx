import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Books, LockSimple } from '@phosphor-icons/react'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Pagination,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { formatNumber } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { classroomApi, classroomKeys } from '../classroom.api'

/**
 * The class's mark books, one per subject.
 *
 * ── Reached by filtering, not by a nested route ────────────────────────────
 *
 * `GET /teaching/gradebooks?learning_group_id=` narrows the same listing the
 * gradebook screen uses, inside the same reader scoping. A nested route would
 * be a second place for "whose class is this" to be decided, and the second one
 * is always the one that forgets a branch.
 *
 * ── This panel points, it does not mark ────────────────────────────────────
 *
 * Entering marks is the gradebook's own screen, which is a full grid with a
 * roster and a column at a time. Rebuilding a smaller version of it here would
 * be a second marking surface with its own bugs — so each row is a link.
 */
export function ClassGradebooks({ groupId }: { groupId: string }) {
  const t = useTerminology()
  const [page, setPage] = useState(1)

  const books = useQuery({
    queryKey: classroomKeys.gradebooks(groupId, page),
    queryFn: () => classroomApi.gradebooks(groupId, page),
    placeholderData: (previous) => previous,
  })

  if (books.isError) {
    return (
      <Card>
        <ErrorState error={books.error} onRetry={() => books.refetch()} />
      </Card>
    )
  }

  if (books.isLoading) {
    return (
      <Card className="space-y-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    )
  }

  const rows = books.data?.rows ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Books size={20} />}
          title="No mark books yet"
          description={`A mark book is created per ${t('course').toLowerCase()} offering. Add ${t('courses').toLowerCase()} to this ${t('group').toLowerCase()} and they appear here.`}
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Mark books"
        subtitle="One per subject. Marks are entered on the gradebook itself."
      />
      <ul className="divide-y divide-gray-200">
        {rows.map((book) => (
          <li key={book.id}>
            <Link
              to="/gradebook"
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {book.course_title ?? book.course_offering_code ?? 'Mark book'}
                  </span>
                  {book.is_locked && <LockSimple size={12} className="shrink-0 text-gray-500" />}
                  {book.is_published && <Badge tone="success">Released</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-gray-600">
                  {book.academic_period_name}
                  {book.assessments_count !== undefined &&
                    ` · ${formatNumber(book.assessments_count)} assessment(s)`}
                </span>
              </span>

              <StatusBadge status={book.status} />
              <ArrowRight size={15} className="shrink-0 text-gray-500" />
            </Link>
          </li>
        ))}
      </ul>

      {books.data && books.data.pagination.total > 0 && (
        <Pagination
          className="px-4"
          pagination={books.data.pagination}
          onPageChange={setPage}
        />
      )}
    </Card>
  )
}
