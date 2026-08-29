import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  DotsThree,
  BookOpen,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  Stack,
  Trash,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Modal,
  Pagination,
  SearchInput,
  Segmented,
  Skeleton,
  Tooltip,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { usePermissions, useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { MyLessons } from '@/features/portal/components/MyLessons'
import { LessonDialog } from './components/LessonDialog'
import { UnitDialog } from './components/UnitDialog'
import {
  lessonKeys,
  lessonsApi,
  type ContentStatus,
  type LearningModule,
  type Lesson,
} from './lessons.api'

/**
 * Course material, as the person who writes it works on it.
 *
 * ── Units on the left, their lessons on the right ──────────────────────────
 *
 * Writing material is not a table. It is picking a unit and working through its
 * pages, and the next thing somebody does after publishing lesson four is
 * publish lesson five — so the unit list stays in view and the lesson list
 * updates under it, rather than making each unit a page you navigate to and
 * back from.
 *
 * ── Publish is two decisions, and the screen says so ───────────────────────
 *
 * Opening a unit does not open its lessons. The API refuses a lesson published
 * inside a draft unit with a 409, and this screen refuses to offer the button
 * rather than letting somebody press it and read an error — the unit's own
 * state is shown at the top of the lesson list so the reason is visible before
 * the attempt.
 *
 * Withdrawing a unit DOES withdraw its lessons, which is destructive of a
 * decision somebody made about each one, so it asks first.
 */

export function LessonsPage() {
  const t = useTerminology()
  const viewer = useViewer()

  /*
   * `lms` lists `student_self` among its access profiles, so the rail draws
   * Lessons for a learner — correctly. A screen that spoke only `/teaching/…`
   * would then send them at an endpoint carrying the `staff` middleware, which
   * answers 403. The API has always had the other half.
   */
  const learner = viewer.surface === 'learner'

  return (
    <ModuleGate
      module="lms"
      title="Lessons"
      description={
        learner
          ? `The material your ${t('teachers').toLowerCase()} have published for you.`
          : `Units of material and the lessons inside them, for the ${t('courses').toLowerCase()} you teach.`
      }
      offTitle="This institution does not run course material"
      offDescription="The lessons module is switched off here. An administrator can enable it from the institution's modules."
    >
      {learner ? <MyLessons /> : <Workspace />}
    </ModuleGate>
  )
}

function Workspace() {
  const permissions = usePermissions()
  const canManage = permissions.has('lms.manage')

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [status, setStatus] = useState<ContentStatus | ''>('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composingUnit, setComposingUnit] = useState(false)

  const params = useMemo(() => ({ search, status, page }), [search, status, page])

  const modules = useQuery({
    queryKey: lessonKeys.modules(params),
    queryFn: () => lessonsApi.modules(params),
    placeholderData: (previous) => previous,
  })

  const rows = modules.data?.rows ?? []

  /* Derived rather than corrected in an effect: the selection has to survive a
   * refetch that reorders the list, and fall away on its own when a filter
   * excludes what was open. */
  const selected = rows.some((row) => row.id === selectedId) ? selectedId : null

  if (modules.isError) {
    return (
      <Card>
        <ErrorState error={modules.error} onRetry={() => modules.refetch()} />
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        {/* ── The units ────────────────────────────────────────────────── */}
        <Card className="flex h-fit flex-col">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
            <SearchInput
              value={draft}
              placeholder="Search units"
              className="w-full"
              onChange={(event) => {
                setDraft(event.currentTarget.value)
                setPage(1)
              }}
            />
            {canManage && (
              <Tooltip content="New unit" side="bottom">
                <Button
                  size="icon"
                  variant="primary"
                  aria-label="New unit"
                  onClick={() => setComposingUnit(true)}
                >
                  <Plus size={15} weight="bold" />
                </Button>
              </Tooltip>
            )}
          </div>

          <div className="border-b border-gray-200 px-3 py-2">
            <Segmented
              label="Which units to show"
              value={status || 'all'}
              onChange={(value) => {
                setStatus(value === 'all' ? '' : (value as ContentStatus))
                setPage(1)
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'draft', label: 'Drafts' },
                { value: 'published', label: 'Live' },
              ]}
            />
          </div>

          <div className="max-h-[32rem] overflow-y-auto px-2 py-2">
            {modules.isLoading && <UnitSkeleton />}

            {!modules.isLoading && rows.length === 0 && (
              <EmptyState
                icon={<Stack size={20} />}
                title={search ? 'Nothing matches that' : 'No units yet'}
                description={
                  search
                    ? 'Try part of a title.'
                    : 'A unit is a folder of lessons, written against a course or against one class this session.'
                }
                action={
                  canManage && !search ? (
                    <Button variant="primary" onClick={() => setComposingUnit(true)}>
                      Write one
                    </Button>
                  ) : undefined
                }
              />
            )}

            <ul className="flex flex-col gap-0.5">
              {rows.map((unit) => (
                <li key={unit.id}>
                  <UnitRow
                    unit={unit}
                    active={unit.id === selected}
                    onOpen={() => setSelectedId(unit.id)}
                  />
                </li>
              ))}
            </ul>
          </div>

          {modules.data && modules.data.pagination.total > 0 && (
            <Pagination
              className="border-t border-gray-200 px-3"
              pagination={modules.data.pagination}
              onPageChange={setPage}
            />
          )}
        </Card>

        {/* ── Its lessons ──────────────────────────────────────────────── */}
        {selected ? (
          <UnitDetail key={selected} moduleId={selected} canManage={canManage} />
        ) : (
          <Card className="flex items-center justify-center py-16">
            <EmptyState
              icon={<BookOpen size={20} />}
              title="Pick a unit"
              description="Its lessons appear here, in the order the class works through them."
            />
          </Card>
        )}
      </div>

      <UnitDialog
        open={composingUnit}
        unit={null}
        onClose={() => setComposingUnit(false)}
        onSaved={(saved) => {
          setComposingUnit(false)
          setSelectedId(saved.id)
          void modules.refetch()
        }}
      />
    </>
  )
}

function UnitRow({
  unit,
  active,
  onOpen,
}: {
  unit: LearningModule
  active: boolean
  onOpen: () => void
}) {
  const total = unit.lesson_count ?? 0
  const live = unit.published_lesson_count ?? 0

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
        active ? 'bg-rail-active' : 'hover:bg-gray-50',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
          {unit.title}
        </span>
        {unit.is_published ? (
          <Badge tone="success">Live</Badge>
        ) : (
          <Badge tone="neutral">Draft</Badge>
        )}
      </span>

      <span className="truncate text-2xs text-gray-500">
        {unit.course_title ?? (unit.owner_kind === 'course' ? 'Course material' : 'One class')}
        <span className="px-1 text-gray-400" aria-hidden>
          ·
        </span>
        {/* Two numbers, because "12 lessons" alone does not say where the unit
          * has got to and one count cannot carry both. */}
        {formatNumber(total)} {total === 1 ? 'lesson' : 'lessons'}
        {total > 0 && `, ${formatNumber(live)} live`}
      </span>
    </button>
  )
}

function UnitDetail({ moduleId, canManage }: { moduleId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [editingUnit, setEditingUnit] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [composingLesson, setComposingLesson] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const unit = useQuery({
    queryKey: lessonKeys.module(moduleId),
    queryFn: () => lessonsApi.module(moduleId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: lessonKeys.root })
  }

  const publishUnit = useMutation({
    mutationFn: () => lessonsApi.publishModule(moduleId),
    onSuccess: () => {
      refresh()
      toast.success('Unit is open. Publish its lessons as the class reaches them.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be published.')
    },
  })

  const withdrawUnit = useMutation({
    mutationFn: () => lessonsApi.unpublishModule(moduleId),
    onSuccess: () => {
      refresh()
      setWithdrawing(false)
      toast.success('Unit withdrawn. Its lessons came back with it.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be withdrawn.')
    },
  })

  const toggleLesson = useMutation({
    mutationFn: (lesson: Lesson) =>
      lesson.is_published
        ? lessonsApi.unpublishLesson(moduleId, lesson.id)
        : lessonsApi.publishLesson(moduleId, lesson.id),
    onSuccess: (_result, lesson) => {
      refresh()
      toast.success(lesson.is_published ? 'Taken off the class.' : 'Published to the class.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const removeLesson = useMutation({
    mutationFn: (lesson: Lesson) => lessonsApi.deleteLesson(moduleId, lesson.id),
    onSuccess: () => {
      refresh()
      toast.success('Lesson removed.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be removed.')
    },
  })

  /**
   * Moving one lesson sends the WHOLE order, because that is what the endpoint
   * takes — and it takes the whole order because a reorder is one decision.
   * The server answers with the unit, so the sequence drawn afterwards is the
   * one it settled on rather than the one this array guessed.
   */
  const reorder = useMutation({
    mutationFn: (ids: string[]) => lessonsApi.reorderLessons(moduleId, ids),
    onSuccess: () => refresh(),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That order was not saved.')
    },
  })

  if (unit.isError) {
    return (
      <Card>
        <ErrorState error={unit.error} onRetry={() => unit.refetch()} />
      </Card>
    )
  }

  if (unit.isLoading || !unit.data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-3 w-96" />
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }

  const data = unit.data
  const lessons = data.lessons ?? []

  function move(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= lessons.length) return

    const ids = lessons.map((lesson) => lesson.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <>
      <Card className="flex flex-col">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-gray-900">{data.title}</h2>
              {data.is_published ? (
                <Badge tone="success">Live</Badge>
              ) : (
                <Badge tone="neutral">Draft</Badge>
              )}
            </div>
            <p className="mt-0.5 text-2xs text-gray-600">
              {data.course_title ?? 'No course name'}
              {data.course_code && ` · ${data.course_code}`}
              <span className="px-1 text-gray-400" aria-hidden>
                ·
              </span>
              {data.owner_kind === 'course'
                ? 'Shared with every running of this course'
                : 'This class, this session'}
            </p>
            {data.description && (
              <p className="mt-1 max-w-2xl text-xs text-gray-600">{data.description}</p>
            )}
          </div>

          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              {data.is_published ? (
                <Button
                  icon={<EyeSlash size={15} />}
                  loading={withdrawUnit.isPending}
                  onClick={() => setWithdrawing(true)}
                >
                  Withdraw
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Eye size={15} />}
                  loading={publishUnit.isPending}
                  onClick={() => publishUnit.mutate()}
                >
                  Open to the class
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Rename unit"
                onClick={() => setEditingUnit(true)}
              >
                <PencilSimple size={15} />
              </Button>
            </div>
          )}
        </div>

        {/* ── Why lessons cannot be published yet ─────────────────────── */}
        {!data.is_published && (
          <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-2xs text-gray-600">
            This unit is a draft, so nothing inside it can be published. Open it to the class
            first — its lessons stay as they are.
          </p>
        )}

        {/* ── Lessons ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <p className="text-xs font-medium text-gray-900">
            {formatNumber(lessons.length)} {lessons.length === 1 ? 'lesson' : 'lessons'}
            {lessons.length > 0 && (
              <span className="font-normal text-gray-500">
                {' '}
                · {formatNumber(data.published_lesson_count ?? 0)} live
              </span>
            )}
          </p>
          {canManage && (
            <Button
              size="sm"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setComposingLesson(true)}
            >
              Add lesson
            </Button>
          )}
        </div>

        {lessons.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={20} />}
            title="No lessons yet"
            description="Lessons are added at the end of the unit and published one at a time."
          />
        ) : (
          <ol className="divide-y divide-gray-200 border-t border-gray-200">
            {lessons.map((lesson, index) => (
              <li key={lesson.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-right text-2xs text-gray-500 tabular">
                  {lesson.sequence}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-900">{lesson.title}</span>
                  <span className="block text-2xs text-gray-500">
                    {lesson.is_published ? 'Live to the class' : 'Draft'}
                  </span>
                </span>

                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={index === lessons.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      /* Not offered while the unit is shut — the API refuses it
                       * with a 409, and a button that always errors is worse
                       * than one that is not there. */
                      disabled={!data.is_published && !lesson.is_published}
                      title={
                        !data.is_published && !lesson.is_published
                          ? 'Open the unit to the class first.'
                          : undefined
                      }
                      loading={toggleLesson.isPending && toggleLesson.variables?.id === lesson.id}
                      onClick={() => toggleLesson.mutate(lesson)}
                    >
                      {lesson.is_published ? 'Withdraw' : 'Publish'}
                    </Button>

                    <Menu
                      align="end"
                      className="w-48"
                      items={[
                        {
                          key: 'edit',
                          label: 'Edit lesson',
                          icon: <PencilSimple size={15} />,
                          onSelect: () => setEditingLesson(lesson),
                        },
                        {
                          key: 'delete',
                          label: 'Remove lesson',
                          icon: <Trash size={15} />,
                          destructive: true,
                          separated: true,
                          onSelect: () => removeLesson.mutate(lesson),
                        },
                      ]}
                      trigger={({ toggle, ref }) => (
                        <Button ref={ref} size="icon" variant="ghost" aria-label="Lesson options" onClick={toggle}>
                          <DotsThree size={16} weight="bold" />
                        </Button>
                      )}
                    />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <UnitDialog
        open={editingUnit}
        unit={data}
        onClose={() => setEditingUnit(false)}
        onSaved={() => {
          setEditingUnit(false)
          refresh()
        }}
      />

      <LessonDialog
        open={composingLesson || editingLesson !== null}
        moduleId={moduleId}
        lesson={editingLesson}
        onClose={() => {
          setComposingLesson(false)
          setEditingLesson(null)
        }}
        onSaved={() => {
          setComposingLesson(false)
          setEditingLesson(null)
          refresh()
        }}
      />

      {/*
        * A plain confirmation, not a reason prompt: the API's unpublish takes
        * no reason, and asking for one it then discards teaches people that
        * what this product asks for does not matter.
        */}
      <Modal
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this unit"
        description="Nothing is deleted. Publishing the unit again puts back exactly what was there."
        footer={
          <>
            <Button onClick={() => setWithdrawing(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={withdrawUnit.isPending}
              onClick={() => withdrawUnit.mutate()}
            >
              Withdraw unit
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Every published lesson inside it comes off the class too — a page whose folder is shut
          would otherwise still be served.
        </p>
      </Modal>
    </>
  )
}

function UnitSkeleton() {
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden>
      {['w-3/4', 'w-1/2', 'w-2/3', 'w-3/5'].map((width, index) => (
        <li key={index} className="space-y-1.5 px-2 py-2">
          <Skeleton className={cn('h-3', width)} />
          <Skeleton className="h-2.5 w-24" />
        </li>
      ))}
    </ul>
  )
}
