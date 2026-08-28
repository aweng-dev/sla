import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  BellSlash,
  Bell,
  ChatsCircle,
  DotsThree,
  DownloadSimple,
  PaperPlaneTilt,
  Plus,
  UserPlus,
  X,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Segmented,
  Skeleton,
  Textarea,
  Tooltip,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDayHeading, formatRelative, formatTime } from '@/shared/lib/format'
import { useTenant } from '@/features/tenant/TenantProvider'
import {
  communicationKeys,
  communicationsApi,
  type AttachmentRow,
  type MessageRow,
  type ThreadDetail,
  type ThreadRow,
} from '../communications.api'
import { ComposeThreadDialog } from './ComposeThreadDialog'
import { AddParticipantDialog } from './AddParticipantDialog'

/**
 * The inbox and the conversation, side by side.
 *
 * ── Why two panes and not a list that navigates ────────────────────────────
 *
 * Reading a conversation is nearly always followed by reading the next one —
 * a form tutor answers six parents in a sitting — and a list-then-detail route
 * makes that a round trip through a back button and a scroll position. The
 * thread rail keeps the queue in view and the unread counts update under it as
 * each is opened. Below `md` there is no room for both, so the rail gives way
 * to the open conversation and a Back control returns to it.
 *
 * ── The read watermark is written on open, once ────────────────────────────
 *
 * `POST /threads/{id}/read` moves this participant's `last_read_at`. It fires
 * when a thread with unread messages is opened, not on every render and not on
 * a timer, and the row's badge is cleared optimistically so opening a thread
 * does not leave a count sitting on a conversation you are looking at.
 *
 * ── There is no administrative way in ──────────────────────────────────────
 *
 * The API answers 404 to a non-participant, including the institution's owner,
 * and offers no `communications.manage` route into a thread. So this screen has
 * no "all conversations" view to build: somebody who needs to read a thread is
 * added to it, which the people in it can see.
 */
export function MessagesPanel() {
  const { account } = useTenant()
  const queryClient = useQueryClient()

  const [scope, setScope] = useState<'open' | 'archived'>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const threads = useQuery({
    queryKey: communicationKeys.threads(),
    queryFn: communicationsApi.threads,
  })

  /* Stable, because `Conversation` lists it as an effect dependency: an inline
   * arrow would re-run the read-watermark effect on every render of the pane. */
  const refreshQueue = useCallback(
    () => queryClient.invalidateQueries({ queryKey: communicationKeys.threadsRoot }),
    [queryClient],
  )

  const rows = useMemo(
    () => (threads.data ?? []).filter((row) => row.status === scope),
    [threads.data, scope],
  )

  const openCount = useMemo(
    () => (threads.data ?? []).filter((row) => row.status === 'open').length,
    [threads.data],
  )
  const unreadTotal = useMemo(
    () =>
      (threads.data ?? [])
        .filter((row) => row.status === 'open')
        .reduce((sum, row) => sum + row.unread_count, 0),
    [threads.data],
  )

  /* Derived rather than corrected in an effect: the selection has to survive a
   * refetch that reorders the list, and has to fall away on its own when the
   * scope changes or the thread it named is archived. */
  const selected = rows.some((row) => row.id === selectedId) ? selectedId : null

  if (threads.isError) {
    return (
      <Card>
        <ErrorState error={threads.error} onRetry={() => threads.refetch()} />
      </Card>
    )
  }

  return (
    <>
      <Card className="flex h-[calc(100dvh-13rem)] min-h-[26rem] overflow-hidden">
        {/* ── The queue ────────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex w-full shrink-0 flex-col border-gray-200 md:w-80 md:border-r',
            selected && 'hidden md:flex',
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
            <Segmented
              label="Which conversations to show"
              value={scope}
              onChange={(value) => {
                setScope(value as 'open' | 'archived')
                setSelectedId(null)
              }}
              options={[
                { value: 'open', label: 'Inbox', count: unreadTotal },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <Tooltip content="New conversation" side="bottom">
              <Button
                size="icon"
                variant="primary"
                aria-label="New conversation"
                onClick={() => setComposing(true)}
              >
                <Plus size={15} weight="bold" />
              </Button>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {threads.isLoading && <QueueSkeleton />}

            {!threads.isLoading && rows.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-gray-500">
                {scope === 'open'
                  ? openCount === 0
                    ? 'No conversations yet.'
                    : 'Nothing in the inbox.'
                  : 'Nothing archived.'}
              </p>
            )}

            <ul className="flex flex-col gap-0.5">
              {rows.map((row) => (
                <li key={row.id}>
                  <ThreadRowButton
                    row={row}
                    active={row.id === selected}
                    onOpen={() => setSelectedId(row.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── The conversation ─────────────────────────────────────────── */}
        <div className={cn('min-w-0 flex-1', selected ? 'flex flex-col' : 'hidden md:flex')}>
          {selected ? (
            <Conversation
              key={selected}
              threadId={selected}
              accountName={account?.name ?? null}
              onBack={() => setSelectedId(null)}
              onChanged={refreshQueue}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<ChatsCircle size={20} />}
                title={openCount === 0 ? 'No conversations yet' : 'Pick a conversation'}
                description={
                  openCount === 0
                    ? 'A conversation here reaches the people in it and nobody else — not an administrator, not the institution owner.'
                    : 'Choose one on the left to read it.'
                }
                action={
                  openCount === 0 ? (
                    <Button variant="primary" onClick={() => setComposing(true)}>
                      Start one
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </div>
      </Card>

      <ComposeThreadDialog
        open={composing}
        onClose={() => setComposing(false)}
        onStarted={(thread) => {
          setComposing(false)
          setScope('open')
          setSelectedId(thread.id)
        }}
      />
    </>
  )
}

/** One row in the queue. Sprig's density: subject, a muted second line, a time
 *  right, and the unread count as the only weight. */
function ThreadRowButton({
  row,
  active,
  onOpen,
}: {
  row: ThreadRow
  active: boolean
  onOpen: () => void
}) {
  const unread = row.unread_count > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
        active ? 'bg-rail-active' : 'hover:bg-gray-50',
      )}
    >
      <span className="mt-1.5 flex w-1.5 shrink-0 justify-center" aria-hidden>
        {unread && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              unread ? 'font-semibold text-gray-900' : 'text-gray-800',
            )}
          >
            {row.subject}
          </span>
          <span className="shrink-0 whitespace-nowrap text-2xs text-gray-500 tabular">
            {row.last_message_at ? formatRelative(row.last_message_at) : '—'}
          </span>
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-2xs font-medium text-gray-500">
          <span>
            {row.participant_user_ids.length === 1
              ? 'Just you'
              : `${row.participant_user_ids.length} people`}
          </span>
          {row.is_muted && (
            <>
              <span aria-hidden>·</span>
              <BellSlash size={11} aria-label="Muted" />
            </>
          )}
          {unread && (
            <span className="ml-auto shrink-0 rounded-full bg-gray-900 px-1.5 text-2xs font-medium leading-4 text-white tabular">
              {row.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function Conversation({
  threadId,
  accountName,
  onBack,
  onChanged,
}: {
  threadId: string
  accountName: string | null
  onBack: () => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const foot = useRef<HTMLDivElement>(null)

  const thread = useQuery({
    queryKey: communicationKeys.thread(threadId),
    queryFn: () => communicationsApi.thread(threadId),
  })

  const unread = thread.data?.unread_count ?? 0

  /*
   * The watermark, written once when a thread that HAS unread messages is
   * opened. Keyed on the thread id rather than on the count, so a reply
   * arriving while the conversation is open does not fire a second write
   * before the reader has seen it.
   */
  const marked = useRef<string | null>(null)
  useEffect(() => {
    if (unread === 0 || marked.current === threadId) return
    marked.current = threadId

    communicationsApi
      .markThreadRead(threadId)
      .then(() => {
        /* Cleared locally as well as refetched: the badge sitting on a
         * conversation you are reading is the thing this is for. */
        queryClient.setQueryData<ThreadRow[]>(communicationKeys.threads(), (rows) =>
          rows?.map((row) => (row.id === threadId ? { ...row, unread_count: 0 } : row)),
        )
        onChanged()
      })
      .catch(() => {
        /* A watermark that did not save is not worth a toast — the messages are
         * on screen either way, and the next open will try again. */
        marked.current = null
      })
  }, [threadId, unread, queryClient, onChanged])

  /* Newest message into view on open and after each send. */
  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [thread.data?.messages.length])

  const send = useMutation({
    mutationFn: (body: string) => communicationsApi.sendMessage(threadId, body),
    onSuccess: (message) => {
      setDraft('')
      /* Appended rather than refetched: the 201 carries the whole message with
       * its sender loaded, and a refetch would blank the composer for a round
       * trip on the one action people repeat most. */
      queryClient.setQueryData<ThreadDetail>(communicationKeys.thread(threadId), (current) =>
        current ? { ...current, messages: [...current.messages, message] } : current,
      )
      onChanged()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That message was not sent.')
    },
  })

  const mute = useMutation({
    mutationFn: (muted: boolean) => communicationsApi.muteThread(threadId, muted),
    onSuccess: (_result, muted) => {
      queryClient.setQueryData<ThreadDetail>(communicationKeys.thread(threadId), (current) =>
        current ? { ...current, is_muted: muted } : current,
      )
      onChanged()
      toast.success(muted ? 'Muted. You will not be notified.' : 'Unmuted.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const archive = useMutation({
    mutationFn: () => communicationsApi.archiveThread(threadId),
    onSuccess: () => {
      onChanged()
      onBack()
      toast.success('Conversation archived.')
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That could not be archived.',
      )
    },
  })

  if (thread.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <ErrorState error={thread.error} onRetry={() => thread.refetch()} />
      </div>
    )
  }

  if (thread.isLoading || !thread.data) {
    return (
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-2/3" />
        <Skeleton className="h-16 w-1/2" />
      </div>
    )
  }

  const detail = thread.data
  const canManage = detail.role === 'owner'

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Back to conversations"
            className="md:hidden"
            onClick={onBack}
          >
            <X size={15} />
          </Button>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">{detail.subject}</h3>
            <p className="truncate text-2xs font-medium text-gray-500">
              {detail.participant_user_ids.length === 1
                ? 'Just you'
                : `${detail.participant_user_ids.length} people`}
              {detail.status === 'archived' && ' · Archived'}
              {detail.is_muted && ' · Muted'}
            </p>
          </div>

          <Menu
            align="end"
            className="w-56"
            items={[
              {
                key: 'mute',
                label: detail.is_muted ? 'Unmute' : 'Mute notifications',
                icon: detail.is_muted ? <Bell size={15} /> : <BellSlash size={15} />,
                onSelect: () => mute.mutate(!detail.is_muted),
              },
              ...(canManage
                ? [
                    {
                      key: 'add',
                      label: 'Add someone',
                      icon: <UserPlus size={15} />,
                      onSelect: () => setAddingParticipant(true),
                    },
                  ]
                : []),
              ...(canManage && detail.status === 'open'
                ? [
                    {
                      key: 'archive',
                      label: 'Archive conversation',
                      icon: <Archive size={15} />,
                      separated: true,
                      onSelect: () => archive.mutate(),
                    },
                  ]
                : []),
            ]}
            trigger={({ toggle, ref }) => (
              <Button
                ref={ref as never}
                size="icon"
                variant="ghost"
                aria-label="Conversation options"
                onClick={toggle}
              >
                <DotsThree size={16} weight="bold" />
              </Button>
            )}
          />
        </div>

        {/* ── Messages ────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <MessageStream
            messages={detail.messages}
            threadId={threadId}
            accountName={accountName}
          />
          <div ref={foot} />
        </div>

        {/* ── Composer ────────────────────────────────────────────────── */}
        {detail.can_reply ? (
          <form
            className="shrink-0 border-t border-gray-200 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              const body = draft.trim()
              if (body) send.mutate(body)
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                aria-label="Your reply"
                rows={2}
                value={draft}
                maxLength={20000}
                placeholder="Write a reply…"
                onChange={(event) => setDraft(event.currentTarget.value)}
                /* Enter sends, Shift+Enter breaks the line. The reverse is the
                 * behaviour of a document, and this is a conversation. */
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    const body = draft.trim()
                    if (body) send.mutate(body)
                  }
                }}
              />
              <Button
                type="submit"
                variant="primary"
                icon={<PaperPlaneTilt size={15} weight="fill" />}
                loading={send.isPending}
                disabled={draft.trim() === ''}
              >
                Send
              </Button>
            </div>
          </form>
        ) : (
          <p className="shrink-0 border-t border-gray-200 px-3 py-3 text-xs text-gray-500">
            {detail.status === 'archived'
              ? 'This conversation is archived. Nobody can add to it.'
              : 'You are an observer here and cannot reply.'}
          </p>
        )}
      </div>

      <AddParticipantDialog
        open={addingParticipant}
        threadId={threadId}
        existing={detail.participant_user_ids}
        onClose={() => setAddingParticipant(false)}
        onAdded={() => {
          setAddingParticipant(false)
          queryClient.invalidateQueries({ queryKey: communicationKeys.thread(threadId) })
          onChanged()
        }}
      />
    </>
  )
}

/**
 * The messages, grouped by day.
 *
 * Own messages sit right and darker; everybody else's sit left. A system line —
 * "X added Y" — is neither, and is centred in muted text: it is the room
 * changing rather than somebody speaking, and giving it a bubble makes an
 * administrative event look like a remark.
 */
function MessageStream({
  messages,
  threadId,
  accountName,
}: {
  messages: MessageRow[]
  threadId: string
  accountName: string | null
}) {
  if (messages.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-500">No messages yet. Say something.</p>
  }

  const groups: { key: string; heading: string; rows: MessageRow[] }[] = []
  for (const message of messages) {
    const stamp = message.sent_at
    const key = stamp ? new Date(stamp).toDateString() : 'undated'
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(message)
    else groups.push({ key, heading: formatDayHeading(stamp), rows: [message] })
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 pb-2 pt-3 first:pt-0">
            <span className="h-px flex-1 bg-gray-200" aria-hidden />
            <span className="shrink-0 text-2xs font-medium text-gray-500">{group.heading}</span>
            <span className="h-px flex-1 bg-gray-200" aria-hidden />
          </div>

          <ul className="flex flex-col gap-2">
            {group.rows.map((message) => (
              <li key={message.id}>
                <MessageBubble
                  message={message}
                  threadId={threadId}
                  own={
                    !message.is_system &&
                    accountName !== null &&
                    message.sender_name === accountName
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function MessageBubble({
  message,
  threadId,
  own,
}: {
  message: MessageRow
  threadId: string
  own: boolean
}) {
  if (message.is_system) {
    return (
      <p className="py-1 text-center text-2xs text-gray-500">
        {message.body}
        <span className="px-1 text-gray-400" aria-hidden>
          ·
        </span>
        {formatTime(message.sent_at)}
      </p>
    )
  }

  /* Absent means the endpoint did not load the sender; null means it did and
   * the institution has no person record. Only the second is "unknown". */
  const name =
    message.sender_name === undefined
      ? null
      : (message.sender_name ?? 'Somebody no longer here')

  return (
    <div className={cn('flex items-end gap-2', own && 'flex-row-reverse')}>
      <Avatar name={name} size="sm" className="mb-4 shrink-0" />

      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-0.5', own && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-xs',
            own ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900',
          )}
        >
          {!own && name && <p className="mb-0.5 text-2xs font-semibold text-gray-700">{name}</p>}
          <p className="whitespace-pre-line break-words">{message.body}</p>

          {message.attachments && message.attachments.length > 0 && (
            <ul className={cn('mt-1.5 flex flex-col gap-1 border-t pt-1.5', own ? 'border-white/20' : 'border-gray-300')}>
              {message.attachments.map((file) => (
                <li key={file.id}>
                  <AttachmentLink file={file} threadId={threadId} own={own} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-2xs text-gray-500 tabular">
          {formatTime(message.sent_at)}
          {message.was_edited && ' · edited'}
        </p>
      </div>
    </div>
  )
}

/**
 * One attachment.
 *
 * A button and not a link, because the API deliberately hands out no URL — the
 * bytes are streamed against the caller's participation in the thread, and a
 * signed link would outlive it. The object URL is revoked as soon as the
 * browser has taken the download.
 */
function AttachmentLink({
  file,
  threadId,
  own,
}: {
  file: AttachmentRow
  threadId: string
  own: boolean
}) {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const blob = await communicationsApi.downloadAttachment(threadId, file.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.file_name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That file could not be downloaded.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={cn(
        'flex w-full items-center gap-1.5 text-left text-2xs underline-offset-2 hover:underline disabled:opacity-60',
        own ? 'text-white/90' : 'text-gray-700',
      )}
    >
      <DownloadSimple size={12} />
      <span className="min-w-0 truncate">{file.file_name}</span>
      <span className="shrink-0 opacity-70 tabular">{formatBytes(file.size_bytes)}</span>
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function QueueSkeleton() {
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden>
      {['w-3/4', 'w-1/2', 'w-2/3', 'w-3/5', 'w-1/2'].map((width, index) => (
        <li key={index} className="flex items-start gap-2 px-2 py-2">
          <span className="w-1.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn('h-3', width)} />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </li>
      ))}
    </ul>
  )
}
