import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowSquareOut,
  Archive,
  Copy,
  ListChecks,
  PencilSimple,
  Plus,
  UsersThree,
} from '@phosphor-icons/react'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { formatNumber } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { actionsColumn } from '@/features/academics/components/RowActions'
import type { Course } from '@/features/academics/academics.types'
import { CurriculumStatusBadge } from './CurriculumStatusBadge'
import { CreateCurriculumDialog, DuplicateCurriculumDialog } from './CurriculumDialogs'
import { useCurriculumActions } from '../useCurriculumActions'
import type { SubjectClass } from '../useSubjectWorkspace'

/**
 * Every class taking this subject, and what each one has been given to learn.
 *
 * ── This table is the argument for the whole feature ───────────────────────
 *
 * One row per class, one curriculum column. Two classes taking Mathematics can
 * show "Published · 8 units" and "Not started" side by side, which is exactly
 * true and impossible to represent if a subject has one curriculum. The column
 * is the reason a head of department comes here: they are looking for the
 * blanks.
 *
 * ── Starting one is done from the class's own row ──────────────────────────
 *
 * There is no "new curriculum" button on the page, because the first question
 * such a button asks is "for which class?" and the row already answers it. It
 * is also the guard against the mistake this design exists to prevent: writing
 * one document and assuming every class got it.
 */
export function SubjectClasses({
  subject,
  hasCurriculum,
  classes,
  loading,
  error,
  onRetry,
  canWriteCurriculum,
  sessionId,
  periodId,
}: {
  subject: Course
  /** False when the institution does not run the curriculum module. The column
   *  goes with it — a column of "Not started" that can never be started is a
   *  column about a feature this institution does not have. */
  hasCurriculum: boolean
  classes: SubjectClass[]
  loading: boolean
  error: unknown
  onRetry: () => void
  canWriteCurriculum: boolean
  sessionId: string
  periodId: string
}) {
  const t = useTerminology()
  const navigate = useNavigate()
  const actions = useCurriculumActions()

  const [creatingFor, setCreatingFor] = useState<SubjectClass | null>(null)
  const [duplicating, setDuplicating] = useState<SubjectClass | null>(null)

  const columns = useMemo<Column<SubjectClass>[]>(() => {
    const base: Column<SubjectClass>[] = [
      {
        key: 'class',
        header: t('group'),
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {row.offering.learning_group_name ?? (
                <span className="text-gray-500">Not attached to a {t('group').toLowerCase()}</span>
              )}
            </span>
            <span className="truncate text-xs text-gray-600">{row.offering.code}</span>
          </span>
        ),
      },
      {
        key: 'when',
        header: t('period'),
        width: '11rem',
        cell: (row) => (
          <span className="flex flex-col text-gray-700">
            <span>{row.offering.academic_period_name ?? '—'}</span>
            <span className="text-xs text-gray-600">
              {row.offering.academic_session_name ?? ''}
            </span>
          </span>
        ),
      },
      {
        key: 'teachers',
        header: t('teachers'),
        width: '12rem',
        cell: (row) =>
          row.offering.instructors.length === 0 ? (
            <span className="text-gray-500">Nobody yet</span>
          ) : (
            <span className="truncate text-gray-700">
              {row.offering.instructors[0].name}
              {row.offering.instructors.length > 1 &&
                ` +${row.offering.instructors.length - 1}`}
            </span>
          ),
      },
      {
        key: 'registered',
        header: t('learners'),
        numeric: true,
        width: '6.5rem',
        cell: (row) => formatNumber(row.offering.registered_count),
      },
    ]

    if (hasCurriculum) {
      base.push({
        key: 'curriculum',
        header: 'Curriculum',
        width: '14rem',
        cell: (row) => {
          if (!row.headline) {
            return (
              <span className="flex items-center gap-2">
                <CurriculumStatusBadge status={null} />
                {canWriteCurriculum && (
                  <button
                    type="button"
                    onClick={() => setCreatingFor(row)}
                    className="text-xs text-accent-600 underline-offset-2 hover:underline"
                  >
                    Start one
                  </button>
                )}
              </span>
            )
          }

          return (
            <Link
              to="/courses/$courseId/curriculum/$curriculumId"
              params={{ courseId: subject.id, curriculumId: row.headline.id }}
              className="group flex min-w-0 flex-col gap-0.5"
            >
              <span className="flex items-center gap-2">
                <CurriculumStatusBadge status={row.headline.status} />
                {row.curricula.length > 1 && (
                  <span className="text-2xs text-gray-500">
                    +{row.curricula.length - 1} other version
                    {row.curricula.length > 2 ? 's' : ''}
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-gray-600 group-hover:text-gray-900">
                {row.headline.title}
                {row.headline.module_count !== undefined &&
                  ` · ${formatNumber(row.headline.module_count)} unit${row.headline.module_count === 1 ? '' : 's'}`}
              </span>
            </Link>
          )
        },
      })
    }

    base.push(
      actionsColumn<SubjectClass>(
        (row) => row.offering.learning_group_name ?? row.offering.code,
        (row) => {
          const items: MenuItemSpec[] = []
          const current = row.headline

          if (current) {
            items.push({
              key: 'open',
              label: current.is_editable ? 'Open the curriculum' : 'Read the curriculum',
              icon: current.is_editable ? <PencilSimple size={15} /> : <ListChecks size={15} />,
              onSelect: () =>
                void navigate({
                  to: '/courses/$courseId/curriculum/$curriculumId',
                  params: { courseId: subject.id, curriculumId: current.id },
                }),
            })
          }

          /* The reader's own reach over THIS class, as the server reports it.
           * `canWriteCurriculum` is only "may they write curricula at all". */
          const mayManage = current ? current.can_manage : canWriteCurriculum

          if (mayManage) {
            items.push({
              key: 'create',
              label: current ? 'Start another version' : 'Start a curriculum',
              icon: <Plus size={15} />,
              onSelect: () => setCreatingFor(row),
            })

            if (current) {
              items.push({
                key: 'duplicate',
                label: 'Copy to another class',
                icon: <Copy size={15} />,
                onSelect: () => setDuplicating(row),
              })

              if (current.status === 'draft') {
                items.push({
                  key: 'publish',
                  label: 'Publish',
                  icon: <ListChecks size={15} />,
                  separated: true,
                  disabled: actions.busy,
                  onSelect: () => actions.publish.mutate(current),
                })
              }

              if (current.status === 'published') {
                items.push({
                  key: 'withdraw',
                  label: 'Back to draft',
                  icon: <PencilSimple size={15} />,
                  separated: true,
                  disabled: actions.busy,
                  onSelect: () => actions.withdraw.mutate(current),
                })
              }

              if (current.status !== 'archived') {
                items.push({
                  key: 'archive',
                  label: 'Archive',
                  icon: <Archive size={15} />,
                  disabled: actions.busy,
                  onSelect: () => actions.archive.mutate(current),
                })
              }
            }
          }

          items.push({
            key: 'offering',
            label: `Open the ${t('group').toLowerCase()}`,
            icon: <ArrowSquareOut size={15} />,
            separated: true,
            disabled: !row.offering.learning_group_id,
            onSelect: () => {
              if (row.offering.learning_group_id) {
                void navigate({
                  to: '/learning-groups/$groupId',
                  params: { groupId: row.offering.learning_group_id },
                })
              }
            },
          })

          return items
        },
      ),
    )

    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, canWriteCurriculum, hasCurriculum, subject.id, actions.busy, navigate])

  const filtered = Boolean(sessionId || periodId)

  return (
    <>
      {error ? (
        <Card>
          <ErrorState error={error} onRetry={onRetry} />
        </Card>
      ) : (
        <DataTable
          rows={classes}
          columns={columns}
          rowKey={(row) => row.offering.id}
          loading={loading}
          skeletonRows={4}
          empty={
            <EmptyState
              icon={<UsersThree size={20} />}
              title={`No ${t('groups').toLowerCase()} are taking ${subject.title}`}
              description={
                filtered
                  ? `Nothing in the selected ${t('session').toLowerCase()} and ${t('period').toLowerCase()}. Widen either to see other terms.`
                  : `Assign it to a ${t('group').toLowerCase()} first — a curriculum is written for a ${t('group').toLowerCase()}, so there is nothing to write until one is taking it.`
              }
              action={
                <Button
                  variant="primary"
                  onClick={() => void navigate({ to: '/course-offerings' })}
                >
                  Assign {subject.title} to a {t('group').toLowerCase()}
                </Button>
              }
            />
          }
        />
      )}

      <CreateCurriculumDialog
        open={creatingFor !== null}
        onClose={() => setCreatingFor(null)}
        pending={actions.create.isPending}
        error={actions.createError}
        className={
          creatingFor?.offering.learning_group_name ?? creatingFor?.offering.code ?? ''
        }
        subjectTitle={subject.title}
        suggestedTitle={suggestTitle(subject.title, creatingFor)}
        onSubmit={(values) => {
          if (!creatingFor) return

          actions.create.mutate(
            {
              offeringId: creatingFor.offering.id,
              className:
                creatingFor.offering.learning_group_name ?? creatingFor.offering.code,
              input: {
                title: values.title,
                summary: values.summary?.trim() || null,
                version: values.version?.trim() || undefined,
              },
            },
            { onSuccess: () => setCreatingFor(null) },
          )
        }}
      />

      <DuplicateCurriculumDialog
        open={duplicating !== null}
        onClose={() => setDuplicating(null)}
        pending={actions.duplicate.isPending}
        error={actions.duplicateError}
        source={duplicating?.headline ?? null}
        targets={classes}
        onSubmit={(values) => {
          const source = duplicating?.headline
          if (!source) return

          actions.duplicate.mutate(
            {
              id: source.id,
              input: {
                course_offering_id: values.course_offering_id,
                title: values.title?.trim() || undefined,
                version: values.version?.trim() || undefined,
              },
            },
            { onSuccess: () => setDuplicating(null) },
          )
        }}
      />
    </>
  )
}

/** "Mathematics — 3A, First term". Enough that a list of documents reads
 *  without opening any of them, and still editable before it is created. */
function suggestTitle(subjectTitle: string, entry: SubjectClass | null): string {
  if (!entry) return subjectTitle

  const where = [entry.offering.learning_group_name, entry.offering.academic_period_name]
    .filter(Boolean)
    .join(', ')

  return where ? `${subjectTitle} — ${where}` : subjectTitle
}
