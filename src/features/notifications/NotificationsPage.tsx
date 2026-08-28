import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Checks } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Tabs,
  panelId,
  type TabItem,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { cn } from '@/shared/lib/cn'
import { formatNumber, humanize } from '@/shared/lib/format'
import { useModules, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { AnnouncementFeed } from './components/AnnouncementFeed'
import { NotificationFeed } from './components/NotificationFeed'
import { PreferenceGrid } from './components/PreferenceGrid'
import {
  CATEGORY_LABELS,
  notificationKeys,
  notificationsApi,
  type NotificationFeed as Feed,
  type NotificationRow,
} from './notifications.api'

/**
 * Everything the institution has said to this person.
 *
 * ── Three tabs, drawn only when their endpoint answers ─────────────────────
 *
 * The inbox and the preferences sit behind `module:notifications`; the
 * noticeboard sits behind `module:communications`. Both are resolved by the
 * same six-layer chain the API's own gate runs, so asking `useModules()` here
 * gives the same answer the server would — and a tab that is not drawn is one
 * nobody clicks into a 403.
 *
 * ── The list has been empty from the first day, and that is the screen ─────
 *
 * A seeded institution has no notifications, so the state a new administrator
 * meets first is the empty one. It says what would arrive here, and offers the
 * two things that are genuinely useful when nothing has: the noticeboard, and
 * the switches. See NotificationFeed.
 */

const FEED_LIMIT = 50

/** The stem `Tabs` builds every `id` and `aria-controls` from. Held here rather
 *  than left to the component's `useId` fallback, because the panels below have
 *  to spell the same ids back — otherwise each tab points at nothing. */
const TABS_ID = 'notifications-tabs'

type TabKey = 'notifications' | 'announcements' | 'preferences'

export function NotificationsPage() {
  const { access } = useTenant()
  const modules = useModules()
  const t = useTerminology()
  const queryClient = useQueryClient()

  const hasInbox = modules.has('notifications')
  const hasNoticeboard = modules.has('communications')

  const [unreadOnly, setUnreadOnly] = useState(false)
  const [category, setCategory] = useState('')

  const tabs = useMemo<TabItem[]>(() => {
    const items: TabItem[] = []
    if (hasInbox) items.push({ key: 'notifications', label: 'Notifications' })
    if (hasNoticeboard) items.push({ key: 'announcements', label: 'Announcements' })
    if (hasInbox) items.push({ key: 'preferences', label: 'Preferences' })
    return items
  }, [hasInbox, hasNoticeboard])

  const [requestedTab, setTab] = useState<TabKey>('notifications')

  /*
   * Derived rather than corrected in an effect, because the module list is not
   * known on the first render — `GET /portal/context` is still in flight — and
   * a tab chosen from an empty module list would stick after the real one
   * arrived. Falling back to the first tab that exists is also what happens for
   * a reader whose institution runs the noticeboard but not the inbox.
   */
  const tab: TabKey = tabs.some((item) => item.key === requestedTab)
    ? requestedTab
    : ((tabs[0]?.key as TabKey | undefined) ?? 'notifications')

  const params = useMemo(
    () => ({ unread: unreadOnly, category, limit: FEED_LIMIT }),
    [unreadOnly, category],
  )
  const feedKey = notificationKeys.feed(params)

  const feed = useQuery({
    queryKey: feedKey,
    queryFn: () => notificationsApi.feed(params),
    enabled: hasInbox,
    placeholderData: (previous) => previous,
  })

  const summary = feed.data?.summary ?? null
  const unread = summary?.unread ?? 0
  const unreadHere = category ? (summary?.unread_by_category[category] ?? 0) : unread

  /**
   * Optimistic, because a notification that stays bold for a round trip reads
   * as a click that did not register — and the reader's next move is to click
   * it again. The previous cache is kept so a refusal puts the dot back rather
   * than leaving the screen claiming something the server did not do.
   */
  const markRead = useMutation({
    mutationFn: (row: NotificationRow) => notificationsApi.markRead(row.id),
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: feedKey })
      const previous = queryClient.getQueryData<Feed>(feedKey)

      queryClient.setQueryData<Feed>(feedKey, (current) =>
        current ? applyRead(current, row) : current,
      )

      return { previous }
    },
    onError: (error, _row, context) => {
      if (context?.previous) queryClient.setQueryData(feedKey, context.previous)
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That could not be marked as read.',
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.feedRoot })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(category || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.feedRoot })
      toast.success(
        result.marked_read === 1
          ? '1 notification marked as read'
          : `${formatNumber(result.marked_read)} notifications marked as read`,
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'Those could not be marked as read.',
      )
    },
  })

  if (!access) {
    return (
      <PageStack>
        <PageHeader title="Notifications" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </PageStack>
    )
  }

  if (tabs.length === 0) {
    return (
      <PageStack>
        <PageHeader title="Notifications" />
        <Card>
          <EmptyState
            icon={<Bell size={20} />}
            title="This institution does not run notifications"
            description="Neither the inbox nor the noticeboard is switched on here. An administrator can enable them from the institution's modules."
          />
        </Card>
      </PageStack>
    )
  }

  const categoryOptions = summary
    ? Object.keys(summary.unread_by_category).map((key) => ({
        value: key,
        label: CATEGORY_LABELS[key] ?? humanize(key),
      }))
    : []

  return (
    <PageStack>
      <PageHeader
        title="Notifications"
        description="What the institution has told you, and what you have chosen to be told."
        /* The unread total already sits on the Notifications tab as a count.
         * Repeating it here as a filled chip put the same number on screen
         * twice, in the one colour this product reserves for emphasis. */
        actions={
          tab === 'notifications' ? (
            <Button
              icon={<Checks size={15} />}
              disabled={unreadHere === 0}
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              {category
                ? `Mark ${(CATEGORY_LABELS[category] ?? humanize(category)).toLowerCase()} read`
                : 'Mark all read'}
            </Button>
          ) : undefined
        }
      />

      <div>
        <Tabs
          items={tabs.map((item) =>
            item.key === 'notifications' && unread > 0 ? { ...item, count: unread } : item,
          )}
          value={tab}
          onChange={(key) => setTab(key as TabKey)}
          baseId={TABS_ID}
        />

        {tab === 'notifications' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'notifications')}
            aria-labelledby={`${TABS_ID}-tab-notifications`}
            className="pt-4"
          >
            <Card>
              {/*
               * Sprig's Activity card heads itself rather than sitting under a
               * separate toolbar: what you are narrowing to on the left, which
               * slice of it you are looking at on the right. One row of chrome
               * above the list instead of two, and the controls sit on the
               * thing they control.
               *
               * The scope is a segmented control, not the "Unread only" tick it
               * replaces. All and Unread are two views of one list, and a
               * checkbox states that as a setting you have switched on — with
               * no way to see, without reading the box, which of the two you
               * are currently in.
               */}
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2',
                  categoryOptions.length > 0 ? 'justify-between' : 'justify-end',
                )}
              >
                {categoryOptions.length > 0 && (
                  /* Select fills its container, so the container is what is
                   * sized — otherwise it takes the whole row. */
                  <div className="w-48">
                    <Select
                      aria-label="Filter by category"
                      value={category}
                      onChange={(event) => setCategory(event.currentTarget.value)}
                      options={[{ value: '', label: 'All categories' }, ...categoryOptions]}
                    />
                  </div>
                )}

                <Segmented
                  label="Which notifications to show"
                  value={unreadOnly ? 'unread' : 'all'}
                  onChange={(value) => setUnreadOnly(value === 'unread')}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'unread', label: 'Unread', count: unreadHere },
                  ]}
                />
              </div>

              <NotificationFeed
                rows={feed.data?.rows ?? []}
                loading={feed.isLoading}
                error={feed.isError ? feed.error : null}
                onRetry={() => feed.refetch()}
                onMarkRead={(row) => markRead.mutate(row)}
                onOpenAnnouncements={() => setTab('announcements')}
                onOpenPreferences={() => setTab('preferences')}
                unreadOnly={unreadOnly}
                filtered={unreadOnly || category !== ''}
                onClearFilters={() => {
                  setUnreadOnly(false)
                  setCategory('')
                }}
                learnersLabel={t('learners')}
              />
            </Card>
          </div>
        )}

        {tab === 'announcements' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'announcements')}
            aria-labelledby={`${TABS_ID}-tab-announcements`}
            className="pt-4"
          >
            <AnnouncementFeed />
          </div>
        )}

        {tab === 'preferences' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'preferences')}
            aria-labelledby={`${TABS_ID}-tab-preferences`}
            className="pt-4"
          >
            <PreferenceGrid />
          </div>
        )}
      </div>
    </PageStack>
  )
}

/**
 * One row read, and the counters that describe the list it is in.
 *
 * The summary is inbox-wide rather than page-wide, so both the total and the
 * category it belongs to move — otherwise the tab count and the header badge
 * would disagree with the dots underneath them until the next refetch.
 */
function applyRead(feed: Feed, row: NotificationRow): Feed {
  if (row.is_read) return feed

  return {
    rows: feed.rows.map((current) =>
      current.id === row.id
        ? { ...current, is_read: true, read_at: new Date().toISOString() }
        : current,
    ),
    summary: feed.summary
      ? {
          ...feed.summary,
          unread: Math.max(0, feed.summary.unread - 1),
          unread_by_category: {
            ...feed.summary.unread_by_category,
            [row.category]: Math.max(0, (feed.summary.unread_by_category[row.category] ?? 0) - 1),
          },
        }
      : null,
  }
}
