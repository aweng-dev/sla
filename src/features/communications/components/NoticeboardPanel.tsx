import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Check,
  Megaphone,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  PushPin,
  Trash,
  Users,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Segmented,
  Select,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import type { AnnouncementRow } from '@/features/notifications/notifications.api'
import type { TerminologyKey } from '@/shared/types/tenant.types'
import {
  audienceLabel,
  communicationKeys,
  communicationsApi,
  recipientLabel,
  type AnnouncementStatus,
  type ManagedAnnouncement,
} from '../communications.api'
import { AnnouncementDialog } from './AnnouncementDialog'

/**
 * The noticeboard, from both ends.
 *
 * ── Received and Sent are different lists, not one list filtered ───────────
 *
 * `GET /portal/announcements` is a join against the caller's own RECEIPTS — the
 * rows written when the audience was resolved at publication. `GET
 * /admin/communications/announcements` is everything this institution has
 * written, drafts included, and is gated on `communications.manage` and the
 * staff stack. A sender is usually not in the audience of their own broadcast,
 * so the two lists genuinely differ and merging them would misreport both.
 *
 * Sent is only offered to somebody who holds the permission — a tab that 403s
 * is worse than a tab that was never drawn.
 *
 * ── Why published announcements cannot be edited here ──────────────────────
 *
 * Because the API refuses, and it is right to. A published announcement has
 * been delivered: its audience is frozen into receipts and hundreds of people
 * have read the words. Editing would leave the receipts pointing at text nobody
 * received. The way to correct a sent broadcast is to archive it and publish
 * another, and that is the only pair of actions this screen offers on one.
 */
export function NoticeboardPanel() {
  const permissions = usePermissions()
  const canManage = permissions.has('communications.manage')

  const [view, setView] = useState<'received' | 'sent'>('received')

  if (!canManage) return <ReceivedList />

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Which noticeboard to show"
        value={view}
        onChange={(value) => setView(value as 'received' | 'sent')}
        options={[
          { value: 'received', label: 'Received' },
          { value: 'sent', label: 'Sent' },
        ]}
      />

      {view === 'received' ? <ReceivedList /> : <SentList />}
    </div>
  )
}

/* ── What was sent to me ─────────────────────────────────────────────────── */

/**
 * These rows carry no unread dot, because the listing does not say.
 *
 * `AnnouncementResource` emits the broadcast and nothing about the caller's own
 * receipt, so there is no `read_at` to render. A dot drawn from a guess would be
 * a lie in the one place a reader trusts implicitly, so acknowledgement is an
 * explicit button and the row says only what the API said.
 */
function ReceivedList() {
  const t = useTerminology()
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const query = useQuery({
    queryKey: communicationKeys.received,
    queryFn: communicationsApi.received,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => communicationsApi.markAnnouncementRead(id),
    onSuccess: (_result, id) => setAcknowledged((current) => new Set(current).add(id)),
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That could not be marked as read.',
      )
    },
  })

  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    )
  }

  if (query.isLoading) return <ListSkeleton />

  const rows = query.data ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Megaphone size={20} />}
          title="Nothing has been posted to you"
          description="This list is your own delivery record: the broadcasts you were in the audience for at the moment they were published."
        />
      </Card>
    )
  }

  return (
    <Card>
      <ul className="divide-y divide-gray-200">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <article className="flex items-start gap-3">
              <span
                className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600"
                aria-hidden
              >
                {row.is_pinned ? <PushPin size={14} weight="fill" /> : <Megaphone size={14} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{row.title}</h3>
                  {row.is_pinned && <Badge tone="neutral">Pinned</Badge>}
                  {row.has_expired && <Badge tone="neutral">Expired</Badge>}
                </div>

                {row.body && (
                  <p className="mt-0.5 max-w-2xl whitespace-pre-line text-sm text-gray-600">
                    {row.body}
                  </p>
                )}

                <Meta row={row} t={t} />
              </div>

              <div className="shrink-0">
                {acknowledged.has(row.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Check size={13} weight="bold" />
                    Read
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={markRead.isPending && markRead.variables === row.id}
                    onClick={() => markRead.mutate(row.id)}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ── What this institution has sent ──────────────────────────────────────── */

function SentList() {
  const t = useTerminology()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<AnnouncementStatus | ''>('')
  const [editing, setEditing] = useState<ManagedAnnouncement | null>(null)
  const [composing, setComposing] = useState(false)

  const params = { status: status || undefined, per_page: 50 }

  const query = useQuery({
    queryKey: communicationKeys.sent(params),
    queryFn: () => communicationsApi.sent(params),
    placeholderData: (previous) => previous,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: communicationKeys.sentRoot })
    /* A publication writes receipts, so somebody's received list — possibly the
     * sender's own — is now stale too. */
    queryClient.invalidateQueries({ queryKey: communicationKeys.received })
  }

  const publish = useMutation({
    mutationFn: (id: string) => communicationsApi.publishAnnouncement(id),
    onSuccess: (row) => {
      refresh()
      toast.success(
        row.recipient_count === undefined
          ? 'Published.'
          : `Published to ${formatNumber(row.recipient_count)} ${
              row.recipient_count === 1 ? 'person' : 'people'
            }.`,
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be published.')
    },
  })

  const archive = useMutation({
    mutationFn: (id: string) => communicationsApi.archiveAnnouncement(id),
    onSuccess: () => {
      refresh()
      toast.success('Archived. It is no longer on anybody’s noticeboard.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be archived.')
    },
  })

  const discard = useMutation({
    mutationFn: (id: string) => communicationsApi.deleteAnnouncement(id),
    onSuccess: () => {
      refresh()
      toast.success('Draft discarded.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be discarded.')
    },
  })

  const rows = query.data?.rows ?? []

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
          <div className="w-44">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value as AnnouncementStatus | '')}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'draft', label: 'Drafts' },
                { value: 'published', label: 'Published' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>

          <Button
            variant="primary"
            icon={<Plus size={15} weight="bold" />}
            onClick={() => setComposing(true)}
          >
            Write an announcement
          </Button>
        </div>

        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

        {query.isLoading && <ListSkeleton bare />}

        {!query.isLoading && !query.isError && rows.length === 0 && (
          <EmptyState
            icon={<Megaphone size={20} />}
            title={status ? 'Nothing with that status' : 'Nothing has been sent yet'}
            description={
              status
                ? 'Try another status.'
                : 'A broadcast is written as a draft, checked against its audience, and then published — which resolves who receives it and cannot be undone.'
            }
          />
        )}

        <ul className="divide-y divide-gray-200">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <SentRow
                row={row}
                t={t}
                busy={
                  (publish.isPending && publish.variables === row.id) ||
                  (archive.isPending && archive.variables === row.id) ||
                  (discard.isPending && discard.variables === row.id)
                }
                onEdit={() => setEditing(row)}
                onPublish={() => publish.mutate(row.id)}
                onArchive={() => archive.mutate(row.id)}
                onDiscard={() => discard.mutate(row.id)}
              />
            </li>
          ))}
        </ul>
      </Card>

      <AnnouncementDialog
        open={composing || editing !== null}
        announcement={editing}
        onClose={() => {
          setComposing(false)
          setEditing(null)
        }}
        onSaved={() => {
          setComposing(false)
          setEditing(null)
          refresh()
        }}
      />
    </>
  )
}

function SentRow({
  row,
  t,
  busy,
  onEdit,
  onPublish,
  onArchive,
  onDiscard,
}: {
  row: ManagedAnnouncement
  t: (key: TerminologyKey) => string
  busy: boolean
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onDiscard: () => void
}) {
  const isDraft = row.status === 'draft'

  return (
    <article className="flex items-start gap-3">
      <span
        className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600"
        aria-hidden
      >
        {row.is_pinned ? <PushPin size={14} weight="fill" /> : <Megaphone size={14} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900">{row.title}</h3>
          <StatusBadge status={row.status} />
          {row.is_pinned && <Badge tone="neutral">Pinned</Badge>}
        </div>

        {row.body && (
          <p className="mt-0.5 max-w-2xl truncate text-sm text-gray-600">{row.body}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs font-medium text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Users size={11} />
            {audienceLabel(row.audience_kind, t)}
          </span>
          <span aria-hidden>·</span>
          <span>{recipientLabel(row.recipient_kind, t)}</span>

          {row.recipient_count !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">
                {formatNumber(row.recipient_count)}{' '}
                {row.recipient_count === 1 ? 'recipient' : 'recipients'}
              </span>
            </>
          )}

          {row.published_at && (
            <>
              <span aria-hidden>·</span>
              <span title={formatDateTime(row.published_at)}>
                Published {formatRelative(row.published_at)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <Menu
          align="end"
          className="w-56"
          items={
            isDraft
              ? [
                  {
                    key: 'publish',
                    label: 'Publish now',
                    icon: <PaperPlaneTilt size={15} />,
                    onSelect: onPublish,
                  },
                  { key: 'edit', label: 'Edit draft', icon: <PencilSimple size={15} />, onSelect: onEdit },
                  {
                    key: 'discard',
                    label: 'Discard draft',
                    icon: <Trash size={15} />,
                    destructive: true,
                    separated: true,
                    onSelect: onDiscard,
                  },
                ]
              : [
                  {
                    key: 'archive',
                    label: 'Take off the noticeboard',
                    icon: <Archive size={15} />,
                    disabled: row.status === 'archived',
                    onSelect: onArchive,
                  },
                ]
          }
          trigger={({ toggle, ref }) => (
            <Button ref={ref} size="sm" variant="ghost" loading={busy} onClick={toggle}>
              Actions
            </Button>
          )}
        />
      </div>
    </article>
  )
}

function Meta({
  row,
  t,
}: {
  row: AnnouncementRow
  t: (key: TerminologyKey) => string
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs font-medium text-gray-500">
      <span title={formatDateTime(row.published_at)}>
        Posted {formatRelative(row.published_at)}
      </span>
      <span aria-hidden>·</span>
      <span>{audienceLabel(row.audience_kind, t)}</span>
      {row.expires_at && !row.has_expired && (
        <>
          <span aria-hidden>·</span>
          <span>Until {formatDateTime(row.expires_at)}</span>
        </>
      )}
    </div>
  )
}

function ListSkeleton({ bare }: { bare?: boolean }) {
  const body = (
    <ul className="divide-y divide-gray-200" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} className="space-y-2 px-4 py-3">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-full max-w-xl" />
          <Skeleton className="h-3 w-24" />
        </li>
      ))}
    </ul>
  )

  return bare ? body : <Card>{body}</Card>
}
