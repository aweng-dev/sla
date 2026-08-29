import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ArrowUUpLeft,
  CaretRight,
  Copy,
  ListChecks,
  PencilSimple,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  type MenuItemSpec,
} from '@/shared/ui'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { RowActions } from '@/features/academics/components/RowActions'
import type { Course } from '@/features/academics/academics.types'
import { CurriculumStatusBadge } from './CurriculumStatusBadge'
import { DuplicateCurriculumDialog } from './CurriculumDialogs'
import { useCurriculumActions } from '../useCurriculumActions'
import type { OfferingCurriculum } from '../curriculum.api'
import type { SubjectClass } from '../useSubjectWorkspace'

/**
 * The documents, grouped by the class each one belongs to.
 *
 * ── Grouped by class rather than listed flat ───────────────────────────────
 *
 * A flat list of "Mathematics — 3A v1, Mathematics — 3A v2, Mathematics — 3C
 * v1" reads as one subject's several documents, which is the misunderstanding
 * this whole feature exists to correct. Under a class heading it reads as what
 * it is: 3A's two versions, and 3C's one.
 *
 * ── Classes with nothing are shown, not omitted ────────────────────────────
 *
 * The heading appears whether or not anything is under it. A class that has
 * been given a subject and no scheme of work is the finding somebody wants.
 *
 * ── Every version, not just the current one ────────────────────────────────
 *
 * The Classes tab shows one line per class and picks the published document to
 * put on it. This is where the others are: last term's, the archived one, the
 * draft somebody is preparing for next year.
 */
export function SubjectCurriculum({
  subject,
  classes,
  documents,
  loading,
  error,
  onRetry,
  canWriteCurriculum,
}: {
  subject: Course
  classes: SubjectClass[]
  documents: OfferingCurriculum[]
  loading: boolean
  error: unknown
  onRetry: () => void
  canWriteCurriculum: boolean
}) {
  const t = useTerminology()
  const navigate = useNavigate()
  const actions = useCurriculumActions()
  const [duplicating, setDuplicating] = useState<OfferingCurriculum | null>(null)

  /* Any document whose offering is not among the classes above — impossible
   * while both lists carry the same filters, but a listing that silently drops
   * rows is worse than one with an "Other" heading nobody ever sees. */
  const orphans = useMemo(() => {
    const known = new Set(classes.map((entry) => entry.offering.id))
    return documents.filter((document) => !known.has(document.course_offering_id))
  }, [classes, documents])

  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    )
  }

  if (classes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks size={20} />}
          title="Nothing to write against yet"
          description={`A curriculum belongs to a ${t('group').toLowerCase()} taking ${subject.title}. Assign the subject to a ${t('group').toLowerCase()} and it will appear here.`}
        />
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {classes.map((entry) => (
          <Card key={entry.offering.id}>
            <CardHeader
              title={entry.offering.learning_group_name ?? entry.offering.code}
              subtitle={[
                entry.offering.academic_period_name,
                entry.offering.academic_session_name,
                `${formatNumber(entry.offering.registered_count)} ${t('learners').toLowerCase()}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />

            {entry.curricula.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-600">
                  This {t('group').toLowerCase()} has no scheme of work for {subject.title}.
                </p>
                {canWriteCurriculum && (
                  <p className="mt-1 text-xs text-gray-500">
                    Start one from the {t('groups').toLowerCase()} tab.
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {entry.curricula.map((document) => (
                  <DocumentRow
                    key={document.id}
                    courseId={subject.id}
                    document={document}
                    items={menuFor(document)}
                  />
                ))}
              </ul>
            )}
          </Card>
        ))}

        {orphans.length > 0 && (
          <Card>
            <CardHeader
              title="Other terms"
              subtitle={`Written against a ${t('group').toLowerCase()} outside the current filter.`}
            />
            <ul className="divide-y divide-gray-200">
              {orphans.map((document) => (
                <DocumentRow
                  key={document.id}
                  courseId={subject.id}
                  document={document}
                  items={menuFor(document)}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>

      <DuplicateCurriculumDialog
        open={duplicating !== null}
        onClose={() => setDuplicating(null)}
        pending={actions.duplicate.isPending}
        error={actions.duplicateError}
        source={duplicating}
        targets={classes}
        onSubmit={(values) => {
          if (!duplicating) return

          actions.duplicate.mutate(
            {
              id: duplicating.id,
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

  function menuFor(document: OfferingCurriculum): MenuItemSpec[] {
    const items: MenuItemSpec[] = [
      {
        key: 'open',
        label: document.is_editable ? 'Open' : 'Read',
        icon: document.is_editable ? <PencilSimple size={15} /> : <ListChecks size={15} />,
        onSelect: () =>
          void navigate({
            to: '/courses/$courseId/curriculum/$curriculumId',
            params: { courseId: subject.id, curriculumId: document.id },
          }),
      },
    ]

    /* Per row, because a teacher reaches their own classes and not a
     * colleague's, and this listing shows both when a subject lead is reading. */
    if (!canWriteCurriculum || !document.can_manage) return items

    items.push({
      key: 'duplicate',
      label: 'Copy to another class',
      icon: <Copy size={15} />,
      onSelect: () => setDuplicating(document),
    })

    if (document.status === 'draft') {
      items.push({
        key: 'publish',
        label: 'Publish',
        icon: <UploadSimple size={15} />,
        separated: true,
        disabled: actions.busy,
        onSelect: () => actions.publish.mutate(document),
      })
    }

    if (document.status === 'published') {
      items.push({
        key: 'withdraw',
        label: 'Back to draft',
        icon: <ArrowUUpLeft size={15} />,
        separated: true,
        disabled: actions.busy,
        onSelect: () => actions.withdraw.mutate(document),
      })
    }

    if (document.status !== 'archived') {
      items.push({
        key: 'archive',
        label: 'Archive',
        icon: <Archive size={15} />,
        disabled: actions.busy,
        onSelect: () => actions.archive.mutate(document),
      })
    }

    /* Only a draft, and only an empty one — the server refuses the rest, and an
     * item that always fails is worse than one that is not there. */
    if (document.status === 'draft' && (document.module_count ?? 0) === 0) {
      items.push({
        key: 'discard',
        label: 'Discard',
        icon: <Trash size={15} />,
        destructive: true,
        disabled: actions.busy,
        onSelect: () => actions.discard.mutate(document),
      })
    }

    return items
  }
}

function DocumentRow({
  courseId,
  document,
  items,
}: {
  courseId: string
  document: OfferingCurriculum
  items: MenuItemSpec[]
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link
        to="/courses/$courseId/curriculum/$curriculumId"
        params={{ courseId, curriculumId: document.id }}
        className="group flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-gray-900 group-hover:text-accent-700">
              {document.title}
            </span>
            <span className="shrink-0 rounded border border-gray-300 px-1 text-2xs text-gray-600">
              {document.version}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-600">
            {formatNumber(document.module_count ?? 0)} unit
            {(document.module_count ?? 0) === 1 ? '' : 's'}
            {document.published_at
              ? ` · published ${formatDateTime(document.published_at)}`
              : document.updated_at
                ? ` · edited ${formatDateTime(document.updated_at)}`
                : ''}
            {document.source_curriculum_id && ' · duplicated'}
          </span>
        </span>

        <CurriculumStatusBadge status={document.status} />

        <CaretRight size={13} className="shrink-0 text-gray-400 group-hover:text-gray-700" aria-hidden />
      </Link>

      <RowActions label={document.title} items={items} />
    </li>
  )
}
