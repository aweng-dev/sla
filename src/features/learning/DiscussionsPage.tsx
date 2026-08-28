import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, ChatsCircle, Lock, PushPin, Plus } from '@phosphor-icons/react'
import { formatRelative } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/shared/ui'
import { FormDialog } from '@/features/academics/components/FormDialog'
import { reportError, useServerErrors } from '@/features/academics/components/useServerErrors'
import { useOfferingCatalog } from '@/features/academics/components/pickers'
import { Select } from '@/shared/ui'
import { portalLearningApi, teachingApi } from './learning.api'
import { learningKeys } from './learning.keys'
import type { Forum, Thread } from './learning.types'

/**
 * Course discussion: forums, the threads in them, and the replies.
 *
 * ── One screen, three levels, no route per level ───────────────────────────
 *
 * Forums → threads → posts is a shallow hierarchy that people move up and down
 * constantly, and giving each level a route means a full page transition to
 * read a two-line reply. So the forum list is a column, the selected forum's
 * threads sit beside it, and opening a thread swaps the right column for the
 * conversation with a way back. Sprig does the same with its Responses tab.
 *
 * ── Reading and writing are different endpoints ────────────────────────────
 *
 * Staff manage forums through `/teaching/forums` — creating, locking,
 * moderating — but everybody, staff included, READS and POSTS through
 * `/portal/discussions/*`. A teacher replying to a learner is doing the same
 * thing the learner is, so the reply path is the portal one for both.
 */
export function DiscussionsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { portal } = useTenant()
  const queryClient = useQueryClient()

  const isStaff = portal !== 'student' && portal !== 'guardian'
  const canManage = isStaff && perms.has('discussions.manage')

  const [forumId, setForumId] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [creatingForum, setCreatingForum] = useState(false)
  const [creatingThread, setCreatingThread] = useState(false)

  const offerings = useOfferingCatalog(canManage)

  /* Everybody reads the portal list — it is narrowed to what the caller may
   * see. The teaching list exists to manage, not to browse. */
  const forums = useQuery({
    queryKey: learningKeys.forums.portal(),
    queryFn: portalLearningApi.forums,
  })

  const rows = forums.data ?? []
  const selected = rows.find((f) => f.id === forumId) ?? rows[0] ?? null

  const threads = useQuery({
    queryKey: learningKeys.forums.threads(selected?.id ?? ''),
    queryFn: () => portalLearningApi.threads(selected!.id, { per_page: 50 }),
    enabled: Boolean(selected) && threadId === null,
  })

  const thread = useQuery({
    queryKey: learningKeys.threads.detail(threadId ?? ''),
    queryFn: () => portalLearningApi.thread(threadId!),
    enabled: Boolean(threadId),
  })

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: learningKeys.forums.all })
    queryClient.invalidateQueries({ queryKey: learningKeys.threads.all })
    toast.success(message)
  }

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  return (
    <PageStack>
      <PageHeader
        title="Discussion"
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setCreatingForum(true)}
            >
              New forum
            </Button>
          ) : undefined
        }
      />

      {forums.isError ? (
        <ErrorState error={forums.error} onRetry={() => forums.refetch()} />
      ) : rows.length === 0 && !forums.isLoading ? (
        <Card>
          <EmptyState
            icon={<ChatsCircle size={20} />}
            title="No forums yet"
            description={
              canManage
                ? `A forum belongs to one offering — a ${t('course').toLowerCase()} taught to one ${t('group').toLowerCase()}. Open one and ${t('learners').toLowerCase()} can start asking.`
                : `When a ${t('teacher').toLowerCase()} opens a forum for one of your ${t('courses').toLowerCase()}, it appears here.`
            }
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setCreatingForum(true)}>
                  New forum
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
          <Card className="h-fit">
            <CardHeader title="Forums" />
            {forums.isLoading && <Skeleton className="m-4 h-16" />}
            <ul className="divide-y divide-gray-200">
              {rows.map((forum) => (
                <li key={forum.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setForumId(forum.id)
                      setThreadId(null)
                    }}
                    aria-current={selected?.id === forum.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50',
                      selected?.id === forum.id && 'bg-gray-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {forum.title}
                      </span>
                      {forum.status !== 'open' && <Lock size={12} className="text-gray-500" />}
                    </span>
                    <span className="truncate text-xs text-gray-600">
                      {forum.course_title ?? t('course')} · {forum.thread_count}{' '}
                      {forum.thread_count === 1 ? 'thread' : 'threads'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="min-w-0">
            {selected && threadId === null && (
              <ThreadList
                forum={selected}
                threads={threads.data?.rows ?? []}
                loading={threads.isLoading}
                error={threads.error}
                onRetry={() => threads.refetch()}
                onOpen={setThreadId}
                onStart={() => setCreatingThread(true)}
                canManage={canManage}
                onSetStatus={(status) =>
                  act.mutate({
                    run: () => teachingApi.setForumStatus(selected.id, status),
                    message: `${selected.title} ${status}`,
                  })
                }
              />
            )}

            {threadId !== null && (
              <ThreadView
                threadId={threadId}
                thread={thread.data}
                loading={thread.isLoading}
                error={thread.error}
                onRetry={() => thread.refetch()}
                onBack={() => setThreadId(null)}
                canManage={canManage}
                onReplied={() => settle('Reply posted')}
                onPin={(pinned) =>
                  act.mutate({
                    run: () => teachingApi.setThreadState(threadId, { is_pinned: pinned }),
                    message: pinned ? 'Thread pinned' : 'Thread unpinned',
                  })
                }
                onLock={(locked) =>
                  act.mutate({
                    run: () =>
                      teachingApi.setThreadState(threadId, { status: locked ? 'locked' : 'open' }),
                    message: locked ? 'Thread locked' : 'Thread reopened',
                  })
                }
              />
            )}
          </div>
        </div>
      )}

      <NewForumDialog
        open={creatingForum}
        onClose={() => setCreatingForum(false)}
        offerings={offerings.options}
        onCreated={(created) => {
          settle('Forum opened')
          setForumId(created.id)
          setCreatingForum(false)
        }}
      />

      {selected && (
        <NewThreadDialog
          open={creatingThread}
          forumId={selected.id}
          onClose={() => setCreatingThread(false)}
          onCreated={(created) => {
            settle('Thread started')
            setCreatingThread(false)
            setThreadId(created.id)
          }}
        />
      )}
    </PageStack>
  )
}

function ThreadList({
  forum,
  threads,
  loading,
  error,
  onRetry,
  onOpen,
  onStart,
  canManage,
  onSetStatus,
}: {
  forum: Forum
  threads: Thread[]
  loading: boolean
  error: unknown
  onRetry: () => void
  onOpen: (id: string) => void
  onStart: () => void
  canManage: boolean
  onSetStatus: (status: string) => void
}) {
  return (
    <Card>
      <CardHeader
        title={forum.title}
        subtitle={forum.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={forum.status} />
            {canManage && (
              <Button size="sm" onClick={() => onSetStatus(forum.status === 'open' ? 'locked' : 'open')}>
                {forum.status === 'open' ? 'Lock' : 'Unlock'}
              </Button>
            )}
            {/* `can_start_thread_now` folds in the forum's status AND whether
              * learners may open threads at all — never re-derive it. */}
            {forum.can_start_thread_now && (
              <Button variant="primary" size="sm" icon={<Plus size={13} weight="bold" />} onClick={onStart}>
                New thread
              </Button>
            )}
          </div>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<ChatsCircle size={20} />}
          title="No threads yet"
          description={
            forum.can_start_thread_now
              ? 'Start the first one — a question, or something worth discussing.'
              : 'This forum is not accepting new threads.'
          }
        />
      ) : (
        <ul className="divide-y divide-gray-200">
          {threads.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    {row.is_pinned && <PushPin size={12} weight="fill" className="text-gray-500" />}
                    <span className="truncate">{row.title}</span>
                    {row.status === 'locked' && <Lock size={12} className="text-gray-500" />}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-600">
                    {row.author_name ?? 'Someone'} · {formatRelative(row.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {row.has_unread && <Badge tone="accent">New</Badge>}
                  <span className="text-xs text-gray-600 tabular">
                    {row.reply_count} {row.reply_count === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const replySchema = z.object({ body: z.string().trim().min(1, 'Write a reply') })
type ReplyValues = z.infer<typeof replySchema>

function ThreadView({
  threadId,
  thread,
  loading,
  error,
  onRetry,
  onBack,
  canManage,
  onReplied,
  onPin,
  onLock,
}: {
  threadId: string
  thread: Thread | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  onBack: () => void
  canManage: boolean
  onReplied: () => void
  onPin: (pinned: boolean) => void
  onLock: (locked: boolean) => void
}) {
  const form = useForm<ReplyValues>({ resolver: zodResolver(replySchema), defaultValues: { body: '' } })
  const applyServerErrors = useServerErrors(form)

  const reply = useMutation({
    mutationFn: (values: ReplyValues) => portalLearningApi.reply(threadId, { body: values.body }),
    onSuccess: () => {
      form.reset({ body: '' })
      onReplied()
    },
    onError: applyServerErrors,
  })

  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (loading || !thread) {
    return (
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>
    )
  }

  /* `opening_post` is also the first entry of `posts` on a detail read, so
   * rendering both would show the question twice. */
  const posts = thread.posts ?? (thread.opening_post ? [thread.opening_post] : [])

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={13} />
        Back to threads
      </button>

      <Card>
        <CardHeader
          title={thread.title}
          subtitle={`${thread.author_name ?? 'Someone'} · ${formatRelative(thread.created_at)}`}
          actions={
            canManage ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => onPin(!thread.is_pinned)}>
                  {thread.is_pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button size="sm" onClick={() => onLock(thread.status === 'open')}>
                  {thread.status === 'open' ? 'Lock' : 'Reopen'}
                </Button>
              </div>
            ) : (
              thread.status === 'locked' && <StatusBadge status="locked" />
            )
          }
        />

        <ul className="divide-y divide-gray-200">
          {posts.map((post) => (
            <li key={post.id} className="px-4 py-3">
              {post.was_removed ? (
                <p className="text-sm italic text-gray-500">
                  This post was removed{post.removed_reason ? ` — ${post.removed_reason}` : ''}.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Avatar name={post.author_name} size="sm" />
                    <span className="text-sm font-medium text-gray-900">
                      {post.author_name ?? 'Someone'}
                    </span>
                    <span className="text-xs text-gray-600">{formatRelative(post.created_at)}</span>
                    {post.was_edited && <span className="text-xs text-gray-500">· edited</span>}
                    {post.awaiting_approval && <Badge tone="warning">Awaiting approval</Badge>}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-800">{post.body}</p>
                </>
              )}
            </li>
          ))}
        </ul>

        {thread.can_post_now ? (
          <form
            onSubmit={form.handleSubmit((values) => reply.mutate(values))}
            className="border-t border-gray-200 p-4"
          >
            <Field label="Reply" error={form.formState.errors.body?.message}>
              {(props) => (
                <Textarea {...props} rows={3} placeholder="Write a reply…" {...form.register('body')} />
              )}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={reply.isPending}>
                Post reply
              </Button>
            </div>
          </form>
        ) : (
          <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            This thread is closed to new replies.
          </p>
        )}
      </Card>
    </div>
  )
}

const forumSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  description: z.string().optional(),
  course_offering_id: z.string().optional(),
  is_moderated: z.boolean().optional(),
  allows_learner_threads: z.boolean().optional(),
})
type ForumValues = z.infer<typeof forumSchema>

function NewForumDialog({
  open,
  onClose,
  offerings,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  offerings: { value: string; label: string }[]
  onCreated: (forum: Forum) => void
}) {
  const form = useForm<ForumValues>({
    resolver: zodResolver(forumSchema),
    defaultValues: {
      title: '',
      description: '',
      course_offering_id: '',
      is_moderated: false,
      allows_learner_threads: true,
    },
  })
  const applyServerErrors = useServerErrors(form)

  const save = useMutation({
    mutationFn: (values: ForumValues) =>
      teachingApi.createForum({
        title: values.title.trim(),
        description: values.description?.trim() || null,
        course_offering_id: values.course_offering_id || null,
        is_moderated: values.is_moderated ?? false,
        allows_learner_threads: values.allows_learner_threads ?? true,
      }),
    onSuccess: onCreated,
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Open a forum"
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      submitLabel="Open forum"
    >
      <Field label="Title" required error={form.formState.errors.title?.message}>
        {(props) => (
          <Input {...props} placeholder="Fractions — questions and help" {...form.register('title')} />
        )}
      </Field>
      <Field label="Description" error={form.formState.errors.description?.message}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            placeholder="What this forum is for, and how to use it."
            {...form.register('description')}
          />
        )}
      </Field>
      <Field
        label="For"
        hint="Leave blank for an institution-wide forum"
        error={form.formState.errors.course_offering_id?.message}
      >
        {(props) => (
          <Select
            {...props}
            options={[{ value: '', label: 'Whole institution' }, ...offerings]}
            {...form.register('course_offering_id')}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2 pt-1">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-gray-400 accent-brand-400"
            {...form.register('allows_learner_threads')}
          />
          <span>
            Learners can start threads
            <span className="block text-xs text-gray-600">
              Otherwise only staff open threads and learners reply.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-gray-400 accent-brand-400"
            {...form.register('is_moderated')}
          />
          <span>
            Hold posts for approval
            <span className="block text-xs text-gray-600">
              Nothing is visible to the class until a moderator approves it.
            </span>
          </span>
        </label>
      </div>
    </FormDialog>
  )
}

const threadSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  body: z.string().trim().min(1, 'Write your first post'),
})
type ThreadValues = z.infer<typeof threadSchema>

function NewThreadDialog({
  open,
  forumId,
  onClose,
  onCreated,
}: {
  open: boolean
  forumId: string
  onClose: () => void
  onCreated: (thread: Thread) => void
}) {
  const form = useForm<ThreadValues>({
    resolver: zodResolver(threadSchema),
    defaultValues: { title: '', body: '' },
  })
  const applyServerErrors = useServerErrors(form)

  const save = useMutation({
    mutationFn: (values: ThreadValues) =>
      portalLearningApi.startThread(forumId, { title: values.title.trim(), body: values.body.trim() }),
    onSuccess: onCreated,
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Start a thread"
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      submitLabel="Post"
      size="lg"
    >
      <Field label="Title" required error={form.formState.errors.title?.message}>
        {(props) => (
          <Input {...props} placeholder="Question 12 — improper fractions" {...form.register('title')} />
        )}
      </Field>
      <Field label="Your post" required error={form.formState.errors.body?.message}>
        {(props) => <Textarea {...props} rows={6} {...form.register('body')} />}
      </Field>
    </FormDialog>
  )
}
