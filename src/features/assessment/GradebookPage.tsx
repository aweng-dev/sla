import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Books, LockSimple, Plus, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { usePermissions, useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { MyResults } from '@/features/portal/components/MyResults'
import {
  gradebookApi,
  gradebookKeys,
  type GradebookDetail,
  type GradebookItem,
  type ScoreInput,
} from './gradebook.api'

/**
 * The marking grid.
 *
 * ── One column at a time, saved together ───────────────────────────────────
 *
 * A teacher marks a class in one sitting, so the grid edits a whole column and
 * sends it as one bulk write. Thirty separate requests is thirty chances for
 * half of them to land, and a grid that saved per keystroke would fight
 * somebody tabbing down a list of thirty names.
 *
 * ── An empty cell is not a zero ────────────────────────────────────────────
 *
 * `score: null` means not yet marked and the API keeps that distinct from a
 * zero — a student who has not handed in and a student who scored nothing are
 * different facts, and only one of them should pull an average down. Clearing a
 * cell sends null; it does not send 0.
 *
 * ── A locked book refuses writes, so the grid stops offering them ──────────
 *
 * `is_locked` comes down on the payload. Rather than letting somebody type
 * thirty marks into a book the server will refuse, the inputs go read-only and
 * the reason is stated once at the top.
 */
export function GradebookPage() {
  const viewer = useViewer()

  /*
   * `gradebook` and `results` both list `student_self` and
   * `guardian_children` among their access profiles, so the rail draws
   * these for a learner and their family. What a learner has is not a
   * marking grid or a publish button — it is the marks that were actually
   * RELEASED to them, which is a different endpoint and a different screen.
   */
  const learner = viewer.surface === 'learner'

  const t = useTerminology()

  return (
    <ModuleGate
      module="gradebook"
      title="Gradebook"
      description={
        learner
          ? 'Your marks, as they were released.'
          : `Marks for the ${t('courses').toLowerCase()} you teach, and what they roll up into.`
      }
      offTitle="This institution does not run a gradebook"
      offDescription="The gradebook module is switched off here. An administrator can enable it from the institution's modules."
    >
      {learner ? (
        <MyResults />
      ) : (
        <>
      <Workspace />
        </>
      )}
    </ModuleGate>
  )
}

function Workspace() {
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const params = useMemo(() => ({ page }), [page])

  const books = useQuery({
    queryKey: gradebookKeys.list(params),
    queryFn: () => gradebookApi.list(params),
    placeholderData: (previous) => previous,
  })

  /* Filtered locally: the listing endpoint takes an offering id and a status,
   * not a free-text search, and inventing a query parameter the API does not
   * have would silently return everything. */
  const rows = useMemo(() => {
    const all = books.data?.rows ?? []
    if (!search) return all
    const needle = search.toLowerCase()
    return all.filter((row) =>
      [row.course_title, row.course_code, row.learning_group_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    )
  }, [books.data, search])

  useEffect(() => {
    if (selectedId !== null || rows.length === 0) return
    setSelectedId(rows[0].id)
  }, [rows, selectedId])

  const selected = rows.some((row) => row.id === selectedId) ? selectedId : null

  if (books.isError) {
    return (
      <Card>
        <ErrorState error={books.error} onRetry={() => books.refetch()} />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Card className="h-fit">
        <div className="border-b border-gray-200 px-3 py-2">
          <SearchInput
            value={draft}
            placeholder="Search on this page"
            className="w-full"
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </div>

        <div className="max-h-[30rem] overflow-y-auto px-2 py-2">
          {books.isLoading && (
            <ul aria-hidden>
              {['w-3/4', 'w-2/3', 'w-1/2'].map((width, index) => (
                <li key={index} className="space-y-1.5 px-2 py-2">
                  <Skeleton className={cn('h-3', width)} />
                  <Skeleton className="h-2.5 w-20" />
                </li>
              ))}
            </ul>
          )}

          {!books.isLoading && rows.length === 0 && (
            <EmptyState
              icon={<Books size={20} />}
              title={search ? 'Nothing matches that' : 'No gradebooks'}
              description={
                search
                  ? 'The search covers this page only.'
                  : 'A gradebook is created for a course offering. You see the ones you teach.'
              }
            />
          )}

          <ul className="flex flex-col gap-0.5">
            {rows.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(book.id)}
                  aria-current={book.id === selected ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                    book.id === selected ? 'bg-rail-active' : 'hover:bg-gray-50',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
                      {book.course_title ?? book.course_offering_code ?? 'Untitled'}
                    </span>
                    {book.is_locked && <LockSimple size={12} className="shrink-0 text-gray-500" />}
                  </span>
                  <span className="truncate text-2xs text-gray-500">
                    {[book.learning_group_name, book.academic_period_name]
                      .filter(Boolean)
                      .join(' · ') || book.course_code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {books.data && books.data.pagination.total > 0 && (
          <Pagination
            className="border-t border-gray-200 px-3"
            pagination={books.data.pagination}
            onPageChange={setPage}
          />
        )}
      </Card>

      {selected ? (
        <MarkingGrid key={selected} gradebookId={selected} />
      ) : (
        <Card className="flex items-center justify-center py-16">
          <EmptyState
            icon={<Books size={20} />}
            title="Pick a gradebook"
            description="Its assessments and the class roster appear here."
          />
        </Card>
      )}
    </div>
  )
}

function MarkingGrid({ gradebookId }: { gradebookId: string }) {
  const t = useTerminology()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const canMark = permissions.hasAny('gradebook.manage', 'grades.enter')

  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [composing, setComposing] = useState(false)

  const book = useQuery({
    queryKey: gradebookKeys.detail(gradebookId),
    queryFn: () => gradebookApi.detail(gradebookId),
  })

  const items = book.data?.items ?? []
  const students = book.data?.students ?? []
  const scores = book.data?.scores ?? []

  useEffect(() => {
    if (activeItemId !== null || items.length === 0) return
    setActiveItemId(items[0].id)
  }, [items, activeItemId])

  const activeItem = items.find((item) => item.id === activeItemId) ?? null

  /* Seeded from the server whenever the column changes, so switching away and
   * back shows what was saved rather than a stale draft. */
  useEffect(() => {
    if (!activeItem) return
    const seeded: Record<string, string> = {}
    for (const student of students) {
      const score = scores.find(
        (entry) => entry.gradebook_item_id === activeItem.id && entry.student_id === student.id,
      )
      seeded[student.id] = score?.score === null || score?.score === undefined ? '' : String(score.score)
    }
    setDrafts(seeded)
  }, [activeItem?.id, book.data])

  const save = useMutation({
    mutationFn: () => {
      const payload: ScoreInput[] = students.map((student) => {
        const raw = (drafts[student.id] ?? '').trim()

        return {
          student_id: student.id,
          /* Empty means not marked. The API keeps that distinct from zero, and
           * so must this — a student who has not handed in and one who scored
           * nothing are different facts. */
          score: raw === '' ? null : Number(raw),
        }
      })

      return gradebookApi.recordScores(gradebookId, activeItem!.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradebookKeys.root })
      toast.success('Marks saved.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Those marks were not saved.')
    },
  })

  if (book.isError) {
    return (
      <Card>
        <ErrorState error={book.error} onRetry={() => book.refetch()} />
      </Card>
    )
  }

  if (book.isLoading || !book.data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-64 w-full" />
      </Card>
    )
  }

  const data = book.data
  const locked = data.is_locked
  const editable = canMark && !locked

  const overMax =
    activeItem === null
      ? []
      : students.filter((student) => {
          const raw = (drafts[student.id] ?? '').trim()
          return raw !== '' && Number(raw) > activeItem.max_score
        })

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-gray-900">
                  {data.course_title ?? data.course_offering_code}
                </h2>
                <StatusBadge status={data.status} />
                {data.is_published && <Badge tone="success">Published</Badge>}
              </div>
              <p className="mt-0.5 text-2xs text-gray-600">
                {[data.learning_group_name, data.academic_session_name, data.academic_period_name]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {canMark && !locked && (
              <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setComposing(true)}>
                Add assessment
              </Button>
            )}
          </div>

          {locked && (
            <p className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-2xs text-gray-600">
              <LockSimple size={13} weight="fill" />
              This gradebook is closed
              {data.locked_at && ` since ${formatDate(data.locked_at)}`}. Marks can be read but not
              changed. Reopening it happens on the Results screen and asks for a reason.
            </p>
          )}

          {/* ── Which column ─────────────────────────────────────────── */}
          {items.length === 0 ? (
            <EmptyState
              icon={<Books size={20} />}
              title="No assessments yet"
              description="An assessment is a column in this book — a test, a project, an exam — with its own maximum."
            />
          ) : (
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === activeItemId}
                  onClick={() => setActiveItemId(item.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                    item.id === activeItemId
                      ? 'bg-rail-active font-semibold text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  {item.title}
                  <span className="ml-1.5 text-gray-500 tabular">/{formatNumber(item.max_score)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ── The column being marked ──────────────────────────────────── */}
        {activeItem && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{activeItem.title}</p>
                <p className="text-2xs text-gray-600">
                  Out of {formatNumber(activeItem.max_score)}
                  {activeItem.due_at && ` · due ${formatDate(activeItem.due_at)}`}
                  {!activeItem.counts_toward_final && ' · does not count toward the final mark'}
                </p>
              </div>

              {editable && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={save.isPending}
                  disabled={overMax.length > 0}
                  onClick={() => save.mutate()}
                >
                  Save column
                </Button>
              )}
            </div>

            {overMax.length > 0 && (
              <p className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-2xs text-danger-600">
                <Warning size={13} weight="fill" />
                {formatNumber(overMax.length)}{' '}
                {overMax.length === 1 ? 'mark is' : 'marks are'} above the maximum of{' '}
                {formatNumber(activeItem.max_score)}. The server refuses those rather than clamping
                them.
              </p>
            )}

            {students.length === 0 ? (
              <EmptyState
                title={`No ${t('learners').toLowerCase()} on this course`}
                description="The roster comes from the registrations on this offering."
              />
            ) : (
              <ul className="divide-y divide-gray-200">
                {students.map((student) => {
                  const raw = (drafts[student.id] ?? '').trim()
                  const above = raw !== '' && Number(raw) > activeItem.max_score

                  return (
                    <li key={student.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-900">
                          {student.display_name}
                        </span>
                        {student.student_number && (
                          <span className="block text-2xs text-gray-500">
                            {student.student_number}
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        <Input
                          aria-label={`Mark for ${student.display_name}`}
                          type="number"
                          inputMode="decimal"
                          value={drafts[student.id] ?? ''}
                          readOnly={!editable}
                          invalid={above}
                          className="w-24 text-right"
                          placeholder="—"
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.id]: event.currentTarget.value,
                            }))
                          }
                        />
                        <span className="w-10 text-2xs text-gray-500 tabular">
                          /{formatNumber(activeItem.max_score)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      <ItemDialog
        open={composing}
        gradebook={data}
        onClose={() => setComposing(false)}
        onSaved={(item) => {
          setComposing(false)
          setActiveItemId(item.id)
          queryClient.invalidateQueries({ queryKey: gradebookKeys.root })
        }}
      />
    </>
  )
}

function ItemDialog({
  open,
  gradebook,
  onClose,
  onSaved,
}: {
  open: boolean
  gradebook: GradebookDetail
  onClose: () => void
  onSaved: (item: GradebookItem) => void
}) {
  const [title, setTitle] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [countsToward, setCountsToward] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setTitle('')
    setMaxScore('100')
    setCountsToward(true)
    setErrors({})
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      gradebookApi.createItem(gradebook.id, {
        title: title.trim(),
        max_score: Number(maxScore),
        counts_toward_final: countsToward,
      }),
    onSuccess: (item) => {
      toast.success('Assessment added.')
      onSaved(item)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That assessment was not added.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an assessment"
      description="A column in this gradebook, with its own maximum."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={title.trim() === ''}
            onClick={() => save.mutate()}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Title" required error={errors.title}>
          {(props) => (
            <Input
              {...props}
              value={title}
              maxLength={255}
              placeholder="Mid-term test"
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Out of" required error={errors.max_score}>
          {(props) => (
            <Input
              {...props}
              type="number"
              value={maxScore}
              onChange={(event) => setMaxScore(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field
          label="Counts toward the final mark"
          hint="Turn this off for practice work you still want to record."
        >
          {(props) => (
            <Select
              {...props}
              value={countsToward ? 'yes' : 'no'}
              onChange={(event) => setCountsToward(event.currentTarget.value === 'yes')}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
