import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Megaphone, PushPin } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatRelative } from '@/shared/lib/format'
import { notificationKeys, notificationsApi, type AnnouncementRow } from '../notifications.api'

/**
 * The noticeboard, as the people it was sent to read it.
 *
 * ── Why these rows carry no unread dot ─────────────────────────────────────
 *
 * Because the listing does not say. `AnnouncementResource` emits the broadcast
 * — title, body, audience, pin, publication and expiry — and nothing about the
 * caller's own receipt, so there is no `read_at` to render. Drawing a dot from
 * a guess would be a lie in the one place a reader trusts implicitly, so the
 * acknowledgement is an explicit button and the row says only what the API
 * said. The pin and the expiry are real fields and are shown.
 *
 * `POST /portal/announcements/{id}/read` answers with a sentence rather than a
 * record, so what happened is held for the rest of the session and not
 * invented into the row.
 */
export function AnnouncementFeed() {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const query = useQuery({
    queryKey: notificationKeys.announcements,
    queryFn: notificationsApi.announcements,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markAnnouncementRead(id),
    onSuccess: (_data, id) => {
      setAcknowledged((current) => new Set(current).add(id))
    },
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

  if (query.isLoading) {
    return (
      <Card>
        <ul className="divide-y divide-gray-200">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-full max-w-xl" />
              <Skeleton className="h-3 w-24" />
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  const rows = query.data ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Megaphone size={20} />}
          title="No announcements have been sent to you"
          description="This list is your own delivery record: the broadcasts you were in the audience for when they were published."
        />
      </Card>
    )
  }

  return (
    <Card>
      <ul className="divide-y divide-gray-200">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <AnnouncementLine
              row={row}
              acknowledged={acknowledged.has(row.id)}
              pending={markRead.isPending && markRead.variables === row.id}
              onMarkRead={() => markRead.mutate(row.id)}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AnnouncementLine({
  row,
  acknowledged,
  pending,
  onMarkRead,
}: {
  row: AnnouncementRow
  acknowledged: boolean
  pending: boolean
  onMarkRead: () => void
}) {
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
          {/* A marker, not a status — so a chip is right, but a yellow fill is
            * this product's call-to-action and is not spent on a row label. */}
          {row.is_pinned && <Badge tone="neutral">Pinned</Badge>}
          {row.has_expired && <Badge tone="neutral">Expired</Badge>}
        </div>

        {row.body && (
          <p className="mt-0.5 max-w-2xl whitespace-pre-line text-sm text-gray-600">{row.body}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-gray-500">
          <span title={formatDateTime(row.published_at)}>
            Published {formatRelative(row.published_at)}
          </span>
          {row.expires_at && !row.has_expired && (
            <>
              <span aria-hidden>·</span>
              <span>Until {formatDateTime(row.expires_at)}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {acknowledged ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Check size={13} weight="bold" />
            Read
          </span>
        ) : (
          <Button size="sm" variant="ghost" loading={pending} onClick={onMarkRead}>
            Mark read
          </Button>
        )}
      </div>
    </article>
  )
}
