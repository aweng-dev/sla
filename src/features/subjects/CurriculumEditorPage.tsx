import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowUUpLeft,
  Copy,
  Eye,
  ListChecks,
  PencilSimple,
  UploadSimple,
} from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Skeleton,
  StatusBadge,
  type MenuItemSpec,
} from '@/shared/ui'
import { useModules, usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { reportError } from '@/features/academics/components/useServerErrors'
import { PER_PAGE_MAX } from '@/shared/api/client'
import { offeringsApi } from '@/features/academics/academics.api'
import { academicsKeys } from '@/features/academics/academics.keys'
import {
  curriculumApi,
  curriculumContentApi,
  curriculumKeys,
  type CurriculumModule,
  type CurriculumResource,
  type CurriculumTopic,
} from './curriculum.api'
import { useAutosave } from './useAutosave'
import { useCurriculumActions } from './useCurriculumActions'
import { CurriculumNavigator } from './components/CurriculumNavigator'
import { DocumentSurface } from './components/DocumentSurface'
import { SaveIndicator } from './components/SaveIndicator'
import { CurriculumPreview } from './components/CurriculumPreview'
import { ObjectiveList, ResourceList } from './components/LessonLists'
import { DuplicateCurriculumDialog } from './components/CurriculumDialogs'
import type { SubjectClass } from './useSubjectWorkspace'

/**
 * One class's scheme of work, open.
 *
 * ── The header says which class, every time ────────────────────────────────
 *
 * "Mathematics — 3A · First term · 2026" is not decoration. Two of these
 * documents are open in two tabs on the day somebody duplicates one, and the
 * only thing distinguishing them is that line. It is the first thing rendered
 * and it never scrolls away.
 *
 * ── Contents on the left, one lesson on the right ──────────────────────────
 *
 * Squarespace's Course Content rail and Craft's document canvas. A scheme of
 * work is written a lesson at a time, so the lesson gets the width; the
 * structure stays visible beside it so somebody can see where they are in the
 * term without leaving the paragraph they are in.
 *
 * ── Saving is not a button ─────────────────────────────────────────────────
 *
 * Every change is written within a second, and the header says which of the
 * five states it is in. The only manual write is publishing, which is a
 * different act — it freezes the document by database trigger, and the button
 * flushes any pending save before asking for it, so nothing published is
 * missing the last sentence.
 *
 * ── Published means read-only, and the server decides that ─────────────────
 *
 * `is_editable` comes off the API. A trigger refuses content writes to anything
 * that is not a draft, so a client that let somebody type into a published
 * document would be collecting text it cannot store. The surface goes read-only
 * and "Back to draft" is offered instead.
 */

/** Everything a lesson holds, as one editable value. One record, one save. */
interface LessonDraft {
  title: string
  notes: unknown[]
  objectives: string[]
  resources: CurriculumResource[]
}

export function CurriculumEditorPage() {
  const { courseId, curriculumId } = useParams({
    from: '/app/courses/$courseId/curriculum/$curriculumId',
  })
  const t = useTerminology()
  const perms = usePermissions()
  const installed = useModules()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  /* Both are needed, and they answer different questions: the module is
   * whether this INSTITUTION runs curricula at all — every route below carries
   * `module:curriculum` — and the permission is whether this READER may write
   * one. A reader with `curriculum.view` and no manage opens the document
   * read-only, which is the right outcome, not an error. */
  const hasModule = installed.has('curriculum')
  /* Narrowed to this document once it has loaded — see `canWrite` below. */
  const mayWriteSomewhere = hasModule && perms.has('curriculum.manage')

  const document = useQuery({
    queryKey: curriculumKeys.detail(curriculumId),
    queryFn: () => curriculumApi.detail(curriculumId),
    enabled: hasModule,
  })

  const data = document.data
  const modules = useMemo(() => data?.modules ?? [], [data])

  /* The server's answer for THIS document. A subject lead reading a class they
   * do not take gets the document read-only rather than buttons that 403. */
  const canWrite = mayWriteSomewhere && (data?.can_manage ?? false)
  const editable = Boolean(data?.is_editable) && canWrite

  const actions = useCurriculumActions({
    onDiscarded: () => void navigate({ to: '/courses/$courseId', params: { courseId } }),
  })

  /* Every lesson in reading order, so "the next one" and "the first one" are
   * the same list the rail draws. */
  const topics = useMemo(
    () => modules.flatMap((unit) => (unit.topics ?? []).map((topic) => ({ topic, unit }))),
    [modules],
  )

  const selected = useMemo(
    () => topics.find((entry) => entry.topic.id === selectedTopicId) ?? null,
    [topics, selectedTopicId],
  )

  /* Open the first lesson on arrival, and recover when the open one is deleted
   * or the document is refetched with it gone. */
  useEffect(() => {
    if (topics.length === 0) {
      setSelectedTopicId(null)
      return
    }

    if (!selectedTopicId || !topics.some((entry) => entry.topic.id === selectedTopicId)) {
      setSelectedTopicId(topics[0].topic.id)
    }
  }, [topics, selectedTopicId])

  /* ── Saving the open lesson ───────────────────────────────────────────── */

  /* The id the autosave is FOR. Read inside the save so a write that started
   * before a lesson switch still lands on the lesson it was typed into. */
  const savingFor = useRef<string | null>(null)
  savingFor.current = selectedTopicId

  const autosave = useAutosave<LessonDraft & { topicId: string }>({
    enabled: editable,
    save: async ({ topicId, title, notes, objectives, resources }) => {
      await curriculumContentApi.updateTopic(topicId, {
        title,
        notes,
        /* Blank rows are how somebody types a list — an empty one is a row they
         * have not filled in yet, not an objective. Dropped on the way out so
         * the stored list is what they meant, and kept in the editor so the
         * cursor stays where they left it. */
        objectives: objectives.map((line) => line.trim()).filter(Boolean),
        resources: resources
          .map((entry) => ({ label: entry.label.trim(), url: entry.url?.trim() || null }))
          .filter((entry) => entry.label !== ''),
      })

      /* The rail's "written up" marker and the title both come from the
       * document query, so it has to hear about the save — but refetching on
       * every keystroke would fight the editor. Patch the cache instead, and
       * let the next real fetch reconcile. */
      queryClient.setQueryData(
        curriculumKeys.detail(curriculumId),
        (current: typeof data | undefined) => {
          if (!current?.modules) return current

          return {
            ...current,
            modules: current.modules.map((unit) => ({
              ...unit,
              topics: (unit.topics ?? []).map((topic) =>
                topic.id === topicId
                  ? { ...topic, title, notes, objectives, resources, has_notes: notes.length > 0 }
                  : topic,
              ),
            })),
          }
        },
      )
    },
  })

  /* Leaving a lesson writes it before the next one loads. Without this, a
   * switch inside the debounce window drops the last thing typed. */
  const previousTopic = useRef<string | null>(null)
  useEffect(() => {
    if (previousTopic.current && previousTopic.current !== selectedTopicId) {
      void autosave.flush()
    }

    previousTopic.current = selectedTopicId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopicId])

  /* ── Structure ────────────────────────────────────────────────────────── */

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: curriculumKeys.detail(curriculumId) })
  }

  const structure = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; select?: (result: unknown) => void }) =>
      run(),
    onSuccess: async (result, variables) => {
      await refresh()
      variables.select?.(result)
      queryClient.invalidateQueries({ queryKey: curriculumKeys.root })
    },
    onError: (error) => reportError(error),
  })

  function addModule() {
    const title = window.prompt('Name this unit', `Unit ${modules.length + 1}`)
    if (!title?.trim()) return

    structure.mutate({
      run: () => curriculumContentApi.createModule(curriculumId, { title: title.trim() }),
    })
  }

  function renameModule(unit: CurriculumModule) {
    const title = window.prompt('Rename this unit', unit.title)
    if (!title?.trim() || title.trim() === unit.title) return

    structure.mutate({ run: () => curriculumContentApi.updateModule(unit.id, { title: title.trim() }) })
  }

  function deleteModule(unit: CurriculumModule) {
    const count = unit.topics?.length ?? 0
    const warning =
      count === 0
        ? `Delete “${unit.title}”?`
        : `Delete “${unit.title}” and its ${count} lesson${count === 1 ? '' : 's'}? This cannot be undone.`

    if (!window.confirm(warning)) return

    structure.mutate({ run: () => curriculumContentApi.deleteModule(unit.id) })
  }

  function moveModule(unit: CurriculumModule, direction: -1 | 1) {
    const order = reorder(modules.map((entry) => entry.id), unit.id, direction)
    if (!order) return

    structure.mutate({ run: () => curriculumContentApi.reorderModules(curriculumId, order) })
  }

  function addTopic(unit: CurriculumModule) {
    const title = window.prompt(
      'Name this lesson',
      `Lesson ${(unit.topics?.length ?? 0) + 1}`,
    )
    if (!title?.trim()) return

    structure.mutate({
      run: () => curriculumContentApi.createTopic(unit.id, { title: title.trim() }),
      /* Open what was just created — otherwise adding a lesson leaves the
       * reader looking at the one they were already on. */
      select: (created) => {
        const topic = created as CurriculumTopic
        if (topic?.id) setSelectedTopicId(topic.id)
      },
    })
  }

  function deleteTopic(topic: CurriculumTopic) {
    if (!window.confirm(`Delete “${topic.title}”? This cannot be undone.`)) return

    structure.mutate({ run: () => curriculumContentApi.deleteTopic(topic.id) })
  }

  function moveTopic(topic: CurriculumTopic, unit: CurriculumModule, direction: -1 | 1) {
    const order = reorder((unit.topics ?? []).map((entry) => entry.id), topic.id, direction)
    if (!order) return

    structure.mutate({ run: () => curriculumContentApi.reorderTopics(unit.id, order) })
  }

  /* ── Classes this could be copied onto ────────────────────────────────── */

  const siblings = useQuery({
    queryKey: academicsKeys.offerings.list({ course_id: data?.course_id, per_page: PER_PAGE_MAX }),
    queryFn: () =>
      offeringsApi.list({ course_id: data?.course_id ?? undefined, per_page: PER_PAGE_MAX }),
    enabled: duplicating && Boolean(data?.course_id),
  })

  const duplicateTargets = useMemo<SubjectClass[]>(
    () =>
      (siblings.data?.rows ?? []).map((offering) => ({
        offering,
        curricula: [],
        headline: null,
      })),
    [siblings.data],
  )

  /* ── Render ───────────────────────────────────────────────────────────── */

  /* A deep link into a module this institution does not run. Said plainly
   * rather than left to a 403 rendered as "something went wrong". */
  if (!hasModule) {
    return (
      <PageStack>
        <BackLink courseId={courseId} label={t('course')} />
        <Card>
          <EmptyState
            icon={<ListChecks size={20} />}
            title="This institution does not run curricula"
            description="Schemes of work are part of the curriculum module. An administrator can enable it."
          />
        </Card>
      </PageStack>
    )
  }

  if (document.isError) {
    return (
      <PageStack>
        <BackLink courseId={courseId} label={t('course')} />
        <Card>
          <ErrorState error={document.error} onRetry={() => document.refetch()} />
        </Card>
      </PageStack>
    )
  }

  if (document.isLoading || !data) {
    return (
      <PageStack>
        <BackLink courseId={courseId} label={t('course')} />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-[28rem] w-full" />
      </PageStack>
    )
  }

  const context = [
    data.learning_group_name,
    data.academic_period_name,
    data.academic_session_name,
  ].filter(Boolean)

  return (
    <PageStack>
      <BackLink courseId={courseId} label={data.course_title ?? t('course')} />

      {/* The document's own header. Not `PageHeader`: this page has a fixed
        * two-pane body below it and needs the bar to be part of the same
        * frame, so the contents rail lines up with the canvas. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900">
            {data.title}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-600">
            <span className="font-medium text-gray-900">{context.join(' · ')}</span>
            <span aria-hidden>·</span>
            <span className="rounded border border-gray-300 px-1 text-2xs">{data.version}</span>
            <span aria-hidden>·</span>
            <StatusBadge status={data.status} />
            {data.source_curriculum_id && (
              <>
                <span aria-hidden>·</span>
                <span>duplicated from another class</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SaveIndicator
            state={autosave.state}
            lastSavedAt={autosave.lastSavedAt}
            editable={editable}
            onRetry={autosave.retry}
          />

          <Button
            icon={previewing ? <PencilSimple size={15} /> : <Eye size={15} />}
            onClick={() => setPreviewing((value) => !value)}
          >
            {previewing ? 'Back to editing' : 'Preview'}
          </Button>

          {canWrite && data.status === 'draft' && (
            <Button
              variant="primary"
              icon={<UploadSimple size={15} />}
              loading={actions.publish.isPending}
              disabled={topics.length === 0 || actions.busy}
              onClick={async () => {
                /* Flush first: publishing freezes the content, and a document
                 * frozen without the last paragraph is the one bug nobody
                 * forgives. */
                await autosave.flush()
                actions.publish.mutate(data)
              }}
            >
              Publish
            </Button>
          )}

          {canWrite && data.status === 'published' && (
            <Button
              icon={<ArrowUUpLeft size={15} />}
              loading={actions.withdraw.isPending}
              disabled={actions.busy}
              onClick={() => actions.withdraw.mutate(data)}
            >
              Back to draft
            </Button>
          )}

          {canWrite && (
            <Menu
              items={documentMenu()}
              trigger={({ toggle, ref }) => (
                <button
                  ref={ref as never}
                  type="button"
                  onClick={toggle}
                  aria-label="More actions"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                >
                  &#8942;
                </button>
              )}
            />
          )}
        </div>
      </div>

      {data.summary && !previewing && (
        <p className="max-w-3xl text-sm leading-6 text-gray-700">{data.summary}</p>
      )}

      {!editable && canWrite && data.status === 'published' && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          This is published, so its content is frozen. Put it back to draft to change it — the
          class keeps reading the published version until you publish again.
        </p>
      )}

      {previewing ? (
        <CurriculumPreview curriculum={data} />
      ) : (
        <div className="grid min-h-[32rem] gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[15rem_minmax(0,1fr)]">
          {/* Stacked below the large breakpoint, where the contents would
            * otherwise push the lesson off the screen on a long scheme of
            * work. Capped and scrollable there; full height beside the canvas
            * once there is room for two columns. */}
          <div className="max-h-72 overflow-hidden border-b border-gray-200 lg:max-h-none lg:border-b-0 lg:border-r">
            <CurriculumNavigator
              modules={modules}
              selectedTopicId={selectedTopicId}
              onSelectTopic={(topic) => setSelectedTopicId(topic.id)}
              editable={editable}
              busy={structure.isPending}
              onAddModule={addModule}
              onRenameModule={renameModule}
              onDeleteModule={deleteModule}
              onMoveModule={moveModule}
              onAddTopic={addTopic}
              onDeleteTopic={deleteTopic}
              onMoveTopic={moveTopic}
            />
          </div>

          <div className="min-w-0">
            {topics.length === 0 ? (
              <EmptyState
                icon={<ListChecks size={20} />}
                title="Nothing in this curriculum yet"
                description={
                  editable
                    ? 'Add a unit — a term, a module, a topic block — and put lessons in it.'
                    : 'No units have been written.'
                }
                action={
                  editable ? (
                    <Button variant="primary" onClick={addModule}>
                      Add the first unit
                    </Button>
                  ) : undefined
                }
              />
            ) : selected ? (
              <LessonPane
                key={selected.topic.id}
                topic={selected.topic}
                unitTitle={selected.unit.title}
                editable={editable}
                onChange={(draft) =>
                  autosave.schedule({ topicId: selected.topic.id, ...draft })
                }
              />
            ) : null}
          </div>
        </div>
      )}

      <DuplicateCurriculumDialog
        open={duplicating}
        onClose={() => setDuplicating(false)}
        pending={actions.duplicate.isPending}
        error={actions.duplicateError}
        source={data}
        targets={duplicateTargets}
        onSubmit={(values) => {
          actions.duplicate.mutate(
            {
              id: data.id,
              input: {
                course_offering_id: values.course_offering_id,
                title: values.title?.trim() || undefined,
                version: values.version?.trim() || undefined,
              },
            },
            {
              onSuccess: (copy) => {
                setDuplicating(false)
                void navigate({
                  to: '/courses/$courseId/curriculum/$curriculumId',
                  params: { courseId, curriculumId: copy.id },
                })
              },
            },
          )
        }}
      />
    </PageStack>
  )

  function documentMenu(): MenuItemSpec[] {
    const items: MenuItemSpec[] = [
      {
        key: 'rename',
        label: 'Rename this curriculum',
        icon: <PencilSimple size={15} />,
        disabled: !editable,
        onSelect: () => {
          const title = window.prompt('Rename this curriculum', data!.title)
          if (!title?.trim() || title.trim() === data!.title) return

          structure.mutate({
            run: () => curriculumApi.update(data!.id, { title: title.trim() }),
          })
        },
      },
      {
        key: 'duplicate',
        label: 'Copy to another class',
        icon: <Copy size={15} />,
        onSelect: () => setDuplicating(true),
      },
    ]

    if (data!.status !== 'archived') {
      items.push({
        key: 'archive',
        label: 'Archive',
        separated: true,
        disabled: actions.busy,
        onSelect: () => actions.archive.mutate(data!),
      })
    }

    if (data!.status === 'draft' && modules.length === 0) {
      items.push({
        key: 'discard',
        label: 'Discard this draft',
        destructive: true,
        disabled: actions.busy,
        onSelect: () => {
          if (window.confirm('Discard this draft? It has nothing in it.')) {
            actions.discard.mutate(data!)
          }
        },
      })
    }

    return items
  }
}

/* ── One lesson ──────────────────────────────────────────────────────────── */

/**
 * One lesson, and everything that is written about it.
 *
 * ── One draft, one save ────────────────────────────────────────────────────
 *
 * Title, objectives, notes and resources are four controls and ONE record, so
 * they share one piece of state and one autosave. Saving each on its own would
 * be four requests per keystroke-burst and four chances to land half of a
 * lesson — a title that saved beside objectives that did not.
 *
 * ── The order on the page is the order they are used ───────────────────────
 *
 * Objectives above the notes because they set the lesson up, resources below
 * because they are what you reach for while teaching it. Craft's document
 * canvas in the middle, at the width that keeps a line readable.
 */
function LessonPane({
  topic,
  unitTitle,
  editable,
  onChange,
}: {
  topic: CurriculumTopic
  unitTitle: string
  editable: boolean
  onChange: (draft: LessonDraft) => void
}) {
  const [draft, setDraft] = useState<LessonDraft>(() => ({
    title: topic.title,
    notes: topic.notes ?? [],
    objectives: topic.objectives ?? [],
    resources: topic.resources ?? [],
  }))

  /*
   * The single place a change leaves this component.
   *
   * The ref, not the state, is what the next patch is merged onto: two edits in
   * the same tick — an objective typed while the editor emits a change — would
   * otherwise both read the pre-render value and the second would undo the
   * first. And `onChange` runs here rather than inside the state updater,
   * because an updater must be pure; React calls it twice in development and a
   * side effect in it fires twice with it.
   */
  const latest = useRef(draft)

  function edit(patch: Partial<LessonDraft>) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setDraft(next)
    onChange(next)
  }

  return (
    <article className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 px-5 pb-3 pt-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-gray-500">{unitTitle}</p>

        {editable ? (
          <input
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            aria-label="Lesson title"
            placeholder="Untitled lesson"
            className="mt-1 w-full border-0 p-0 text-lg font-semibold tracking-tight text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
        ) : (
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900">{topic.title}</h2>
        )}

        {topic.duration_minutes !== null && (
          <p className="mt-0.5 text-xs text-gray-600">{topic.duration_minutes} minutes</p>
        )}
      </div>

      <ObjectiveList
        objectives={draft.objectives}
        editable={editable}
        onChange={(objectives) => edit({ objectives })}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        <DocumentSurface
          documentKey={topic.id}
          initialContent={topic.notes}
          editable={editable}
          onChange={(notes) => edit({ notes: notes as unknown[] })}
          placeholder="Type to write. Markdown works — # for a heading, - for a bullet."
        />
      </div>

      <ResourceList
        resources={draft.resources}
        editable={editable}
        onChange={(resources) => edit({ resources })}
      />
    </article>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** The whole order with one id moved a step. Null when it cannot move, so the
 *  caller sends nothing rather than sending the order unchanged. */
function reorder(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id)
  const to = from + direction

  if (from < 0 || to < 0 || to >= ids.length) return null

  const next = [...ids]
  next.splice(to, 0, next.splice(from, 1)[0])

  return next
}

function BackLink({ courseId, label }: { courseId: string; label: string }) {
  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId }}
      className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={13} />
      Back to {label}
    </Link>
  )
}
