import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, UsersThree } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { classroomApi, classroomKeys } from '../classroom.api'
import { AssignSubjectsDialog } from './AssignSubjectsDialog'

/**
 * What this class is taught.
 *
 * ── A subject here is a course OFFERING, not a course ──────────────────────
 *
 * The course is "Biology"; the offering is Biology as taught to this class this
 * term, with its own roll, its own timetable slots and its own mark book. That
 * is why the count on each row is registrations and not enrolments, and why
 * "everyone takes this" is a button rather than a setting.
 *
 * ── Registering the class is one act ───────────────────────────────────────
 *
 * `POST .../courses/{offering}/registrations` puts the whole roll on the
 * subject in one request. The per-learner route exists and putting thirty
 * through it is thirty requests a registrar has no reason to know to make.
 */
export function ClassSubjects({
  groupId,
  canManage,
  rollSize,
}: {
  groupId: string
  canManage: boolean
  rollSize: number
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()
  const [assigning, setAssigning] = useState(false)
  const [page, setPage] = useState(1)

  const subjects = useQuery({
    queryKey: classroomKeys.subjects(groupId, page),
    queryFn: () => classroomApi.subjects(groupId, page),
    placeholderData: (previous) => previous,
  })

  const registerAll = useMutation({
    mutationFn: (offeringId: string) => classroomApi.registerAll(groupId, offeringId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })

      /* The server distinguishes newly registered from already-registered, and
       * saying so is what stops somebody pressing again. */
      toast.success(
        result.registered === 0
          ? `Everyone was already registered.`
          : `${formatNumber(result.registered)} registered${result.existing > 0 ? `, ${formatNumber(result.existing)} already were` : ''}.`,
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be done.')
    },
  })

  const rows = subjects.data?.rows ?? []
  const total = subjects.data?.pagination.total ?? 0

  return (
    <>
      {/* On the canvas, not boxed inside the panel — see ClassRoster. */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        {/* The total, not the page — see CLASS_PAGE_SIZE. */}
        <p className="text-xs text-gray-600">
          {total === 0
            ? `No ${t('courses').toLowerCase()} yet`
            : `${formatNumber(total)} ${total === 1 ? t('course').toLowerCase() : t('courses').toLowerCase()}`}
        </p>
        {canManage && (
          <Button
            variant="primary"
            icon={<Plus size={15} weight="bold" />}
            onClick={() => setAssigning(true)}
          >
            Add {t('courses').toLowerCase()}
          </Button>
        )}
      </div>

      <Card>

        {subjects.isError ? (
          <ErrorState error={subjects.error} onRetry={() => subjects.refetch()} />
        ) : subjects.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={20} />}
            title={`This ${t('group').toLowerCase()} takes nothing yet`}
            description={`Choosing ${t('courses').toLowerCase()} creates one offering each — the ${t('course').toLowerCase()} as taught to this ${t('group').toLowerCase()} this term, with its own register and mark book.`}
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setAssigning(true)}>
                  Choose {t('courses').toLowerCase()}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((offering) => {
              const everyone = offering.registered_count >= rollSize && rollSize > 0

              return (
                <li
                  key={offering.id}
                  className="group flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {offering.course_title}
                      </span>
                      {offering.is_elective && <Badge tone="neutral">Elective</Badge>}
                      <StatusBadge status={offering.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-gray-600">
                      {offering.code}
                      {offering.academic_period_name && ` · ${offering.academic_period_name}`}
                      {offering.instructors.length > 0 &&
                        ` · ${offering.instructors.map((i) => i.name).filter(Boolean).join(', ')}`}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm text-gray-900 tabular">
                      {formatNumber(offering.registered_count)}
                    </span>
                    <span className="block text-2xs text-gray-500">registered</span>
                  </span>

                  {canManage && !everyone && rollSize > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<UsersThree size={14} />}
                      loading={registerAll.isPending && registerAll.variables === offering.id}
                      onClick={() => registerAll.mutate(offering.id)}
                      /* Revealed on hover, like the row menu on the roll: an
                       * action repeated down every row competes with the rows. */
                      className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      Register the {t('group').toLowerCase()}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {subjects.data && total > 0 && (
          <Pagination
            className="px-4"
            pagination={subjects.data.pagination}
            onPageChange={setPage}
          />
        )}
      </Card>

      <AssignSubjectsDialog
        open={assigning}
        groupId={groupId}
        onClose={() => setAssigning(false)}
        onAssigned={() => {
          setAssigning(false)
          setPage(1)
          queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
        }}
      />
    </>
  )
}
