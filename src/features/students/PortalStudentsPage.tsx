import { Link } from '@tanstack/react-router'
import { ArrowLeft, Student as StudentIcon } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'
import { PortalRecordCard, PortalRecordView, useMyRecords } from './PortalRecordView'
import { StudentRecordSkeleton } from './StudentPanels'

/**
 * `/students` for the two readers who are not staff.
 *
 * The server-driven rail puts a "Student Management" item in a learner's and a
 * guardian's own sidebar, and the dashboard offers the same route as a tile —
 * so this screen is reached, and the roster behind it is four `/admin` calls
 * that answer 403 to both. What each of them actually means by the item is
 * different, and neither of them means "the roll":
 *
 *   • a learner has exactly one record and it is their own, so the list of one
 *     is skipped and the record IS the screen;
 *   • a guardian has one per child, so the screen is the choice between them,
 *     and each card is the way into the record behind it.
 */
export function PortalStudentsPage() {
  const { portal } = useTenant()
  const t = useTerminology()
  const records = useMyRecords()

  if (records.isError) {
    return (
      <PageStack>
        <PageHeader title={t('learners')} />
        <ErrorState error={records.error} onRetry={() => records.refetch()} />
      </PageStack>
    )
  }

  const rows = records.data ?? []

  if (portal === 'student') {
    if (records.isPending) {
      return (
        <PageStack>
          <PageHeader title={<Skeleton className="h-5 w-48" />} />
          <StudentRecordSkeleton />
        </PageStack>
      )
    }

    const mine = rows[0]
    if (!mine) {
      return (
        <PageStack>
          <PageHeader title={`Your ${t('learner').toLowerCase()} record`} />
          <Card>
            <EmptyState
              icon={<StudentIcon size={20} />}
              title="No record is linked to this account"
              description={`Your sign-in is not attached to a ${t('learner').toLowerCase()} record. The office can link it.`}
            />
          </Card>
        </PageStack>
      )
    }

    return (
      <PageStack>
        <PortalRecordView record={mine} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      {/* A list screen is a title and a row of facts, as Sprig's are. The
          sentence this replaces said the records here are the ones linked to
          you — which is the same claim, made in the shape of a count. */}
      <PageHeader
        title={t('learners')}
        meta={
          rows.length > 0 ? (
            <span>
              <span className="tabular">{rows.length}</span>{' '}
              {(rows.length === 1 ? t('learner') : t('learners')).toLowerCase()} linked to you
            </span>
          ) : undefined
        }
      />

      {records.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
              <Skeleton className="mt-2 h-3 w-3/5" />
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<StudentIcon size={20} />}
            title={`No ${t('learners').toLowerCase()} are linked to you`}
            description="The school links a child's record to a guardian account. Ask the office if one is missing."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((record) => (
            <PortalRecordCard key={record.student_id} record={record} />
          ))}
        </div>
      )}
    </PageStack>
  )
}

/**
 * `/students/$studentId` for the same two readers.
 *
 * The id is resolved against `/portal/my-record` rather than fetched, so an id
 * from a search result, a notification or a pasted link can only ever open a
 * record this caller was already entitled to — and one that is not theirs is
 * answered here rather than by a 403 page.
 */
export function PortalStudentDetailPage({ studentId }: { studentId: string }) {
  const { portal } = useTenant()
  const t = useTerminology()
  const records = useMyRecords()

  /* Only a guardian has a list to go back TO — a learner's `/students` is this
   * same record, and a link that returns you to where you already are is
   * furniture. */
  const backLink =
    portal === 'guardian' ? (
      <Link
        to="/students"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={12} weight="bold" />
        All {t('learners').toLowerCase()}
      </Link>
    ) : null

  if (records.isError) {
    return (
      <PageStack>
        {backLink}
        <ErrorState error={records.error} onRetry={() => records.refetch()} />
      </PageStack>
    )
  }

  if (records.isPending) {
    return (
      <PageStack>
        {backLink}
        <PageHeader title={<Skeleton className="h-5 w-48" />} />
        <StudentRecordSkeleton />
      </PageStack>
    )
  }

  const record = (records.data ?? []).find((row) => row.student_id === studentId)

  if (!record) {
    return (
      <PageStack>
        {backLink}
        <Card>
          <EmptyState
            icon={<StudentIcon size={20} />}
            title="That record is not available to you"
            description={`This link points at a ${t('learner').toLowerCase()} record that is not linked to your account.`}
            action={
              /* A `Link` wearing the secondary button's own classes — the
                 destination is a URL, and `Button` renders a `<button>`. */
              <Link
                to="/students"
                className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
              >
                {portal === 'guardian'
                  ? `All ${t('learners').toLowerCase()}`
                  : `Your ${t('learner').toLowerCase()} record`}
              </Link>
            }
          />
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      {backLink}
      <PortalRecordView record={record} />
    </PageStack>
  )
}
