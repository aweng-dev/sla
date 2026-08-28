import { http, post, put } from '@/shared/api/client'
import type { ApiEnvelope } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'

/**
 * The inbox, the noticeboard, and the switches that govern both.
 *
 * ── Why two of these calls reach past `get()` ──────────────────────────────
 *
 * `get()` unwraps `data` and throws the envelope away, which is right almost
 * everywhere. It is wrong for these two: the unread counters and the channel
 * catalogue describe the LIST rather than any row in it, so the API puts them
 * in `meta` — deliberately, per its own comments — and a screen that read them
 * from `data` would be reading a catalogue out of one person's settings. So
 * these two go through `http` and read both halves.
 *
 * Shapes transcribed from live responses against `greenfield.schoollink.test`,
 * not from the models.
 *
 * ── Why `meta` is narrowed rather than cast ────────────────────────────────
 *
 * `ApiMeta` is `{ request_id, timestamp, [key: string]: unknown }` — it has to
 * be, since every endpoint puts something different beside its list. So a cast
 * to `NotificationSummary` proves nothing, and the screen then indexes
 * `summary.unread_by_category[...]` on a value TypeScript only *believes* is a
 * map. When it is not, the whole page dies in render with `Cannot convert
 * undefined or null to object` rather than the query failing. The narrowers
 * below are the boundary: past this point a summary either does not exist or
 * has a real map, and `defaults`/`categories` are always indexable.
 */

/** `GET /portal/notifications` meta names exactly these five. */
export type NotificationCategoryKey = string

/** `GET .../preferences` meta names the channels in `defaults`. Nothing in
 *  this feature hard-codes the set — a channel the platform adds appears on
 *  the grid because it appeared in that map. */
export type NotificationChannelKey = string

export interface NotificationRow {
  id: string
  /** The event that produced it — `announcement.published`. Not shown; the
   *  category is what a person reads. */
  type: string
  category: NotificationCategoryKey
  title: string
  body: string | null
  /** An API path (`/portal/announcements/{id}`), NOT an app route. Never
   *  navigated to — see `destinationFor` in NotificationFeed. */
  action_url: string | null
  /** A morph alias: `announcement`, `student_profile`, `message_thread`,
   *  `calendar_event`. The map is enforced server-side, so an unknown value
   *  means a new alias rather than corrupt data. */
  context_type: string | null
  context_id: string | null
  read_at: string | null
  archived_at: string | null
  is_read: boolean
  created_at: string | null
}

/** `meta.summary` — the bell's numbers, for the whole inbox rather than the
 *  filtered page. */
export interface NotificationSummary {
  /** Null when the envelope named no user — nothing reads it, and a narrower
   *  that invented an id would be worse than one that admits it has none. */
  user_id: string | null
  unread: number
  /** Always an object once `readSummary` has run, so callers may index it. */
  unread_by_category: Record<string, number>
}

export interface NotificationFeed {
  rows: NotificationRow[]
  summary: NotificationSummary | null
}

export interface NotificationFeedParams {
  unread?: boolean
  category?: string
  limit?: number
}

export interface AnnouncementRow {
  id: string
  title: string
  body: string | null
  audience_kind: string
  audience_id: string | null
  recipient_kind: string
  status: string
  is_pinned: boolean
  published_at: string | null
  expires_at: string | null
  has_expired: boolean
  published_by_user_id: string | null
}

export interface PreferenceRow {
  id: string
  channel: NotificationChannelKey
  category: NotificationCategoryKey
  enabled: boolean
}

/**
 * Saved choices are SPARSE — an absent row means the platform default — so the
 * defaults travel beside them and the screen never reimplements them.
 */
export interface PreferenceCatalogue {
  saved: PreferenceRow[]
  /** channel → whether it is on when nobody has said otherwise. */
  defaults: Record<string, boolean>
  categories: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `meta.summary`, or nothing.
 *
 * Returns null when the key is absent or is not an object — the page already
 * guards a missing summary and draws no counters, which is the honest reading
 * of "the API did not say". What it does NOT do is return a half-built summary:
 * if it hands one back, `unread_by_category` is a real map.
 */
function readSummary(meta: unknown): NotificationSummary | null {
  const source = isRecord(meta) ? meta.summary : undefined
  if (!isRecord(source)) return null

  const counts: Record<string, number> = {}
  if (isRecord(source.unread_by_category)) {
    for (const [category, value] of Object.entries(source.unread_by_category)) {
      if (typeof value === 'number' && Number.isFinite(value)) counts[category] = value
    }
  }

  /* The total falls back to the sum of the categories rather than to zero,
   * because that is exactly how the API computes it (`array_sum`) — so a
   * response missing only the total still shows a truthful bell. */
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)

  return {
    user_id: typeof source.user_id === 'string' ? source.user_id : null,
    unread:
      typeof source.unread === 'number' && Number.isFinite(source.unread) ? source.unread : total,
    unread_by_category: counts,
  }
}

/** `meta.defaults` — channel → on when nobody has said otherwise. An entry that
 *  is not a boolean is dropped rather than coerced: a switch drawn from `"1"`
 *  would claim a setting the server never made. */
function readChannelDefaults(meta: unknown): Record<string, boolean> {
  const source = isRecord(meta) ? meta.defaults : undefined
  if (!isRecord(source)) return {}

  const defaults: Record<string, boolean> = {}
  for (const [channel, value] of Object.entries(source)) {
    if (typeof value === 'boolean') defaults[channel] = value
  }
  return defaults
}

/** `meta.categories` — the rows of the preference grid. */
function readCategories(meta: unknown): string[] {
  const source = isRecord(meta) ? meta.categories : undefined
  if (!Array.isArray(source)) return []
  return source.filter((value): value is string => typeof value === 'string')
}

export const notificationsApi = {
  async feed(params: NotificationFeedParams): Promise<NotificationFeed> {
    const response = await http.get<ApiEnvelope<NotificationRow[]>>('/portal/notifications', {
      params: {
        unread: params.unread ? 1 : undefined,
        category: params.category || undefined,
        limit: params.limit,
      },
    })

    return {
      rows: response.data.data ?? [],
      summary: readSummary(response.data.meta),
    }
  },

  markRead: (id: string) => post<NotificationRow>(`/portal/notifications/${id}/read`),

  /** Scoped to a category when one is filtering the list, so the button does
   *  what the visible list implies rather than more. */
  markAllRead: (category?: string) =>
    post<{ marked_read: number }>('/portal/notifications/read-all', {
      category: category || undefined,
    }),

  async preferences(): Promise<PreferenceCatalogue> {
    const response = await http.get<ApiEnvelope<PreferenceRow[]>>(
      '/portal/notifications/preferences',
    )

    return {
      saved: response.data.data ?? [],
      defaults: readChannelDefaults(response.data.meta),
      categories: readCategories(response.data.meta),
    }
  },

  /** One channel, one category, one statement. There is no bulk shape and no
   *  `user_id` — the preference is always the caller's own. */
  setPreference: (input: { channel: string; category: string; enabled: boolean }) =>
    put<PreferenceRow>('/portal/notifications/preferences', input),

  announcements: () =>
    http
      .get<ApiEnvelope<AnnouncementRow[]>>('/portal/announcements')
      .then((response) => response.data.data ?? []),

  markAnnouncementRead: (id: string) =>
    post<{ message: string }>(`/portal/announcements/${id}/read`),
}

/**
 * Cache keys for the queries `qk` does not name.
 *
 * `qk` lives in `shared/` and is not this feature's to edit, so these are
 * declared here — under the same `portal` root, so a sign-out purge that
 * clears `qk.portal.all` clears these too.
 *
 * Preferences deliberately sit OUTSIDE the `portal/notifications` prefix:
 * marking something read invalidates that prefix on every click, and a
 * settings grid has no business refetching each time.
 *
 * The noticeboard is NOT declared here. `qk.portal.announcements()` already
 * names `GET /portal/announcements`, and the dashboards fetch it under that
 * key — a locally-spelled `['portal','announcements']` is a DIFFERENT key, so
 * opening a dashboard and then this screen asked the same endpoint twice and
 * kept two copies of the answer. This re-exports the shared one so both sides
 * land in one cache entry.
 */
export const notificationKeys = {
  feed: (params: NotificationFeedParams) => ['portal', 'notifications', params] as const,
  feedRoot: ['portal', 'notifications'] as const,
  preferences: ['portal', 'notification-preferences'] as const,
  announcements: qk.portal.announcements(),
}

/**
 * Labels for the values the API names.
 *
 * Not a list of channels or categories — the API decides which exist and the
 * grid is built from its own arrays. This only says how to WRITE the ones it
 * names, because `humanize('in_app')` is "In app" but `humanize('sms')` is
 * "Sms". Anything unmapped falls back to `humanize`, so a new channel renders
 * readably rather than not at all.
 */
export const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In app',
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
}

export const CATEGORY_LABELS: Record<string, string> = {
  results: 'Results and grades',
  attendance: 'Attendance',
  finance: 'Fees and payments',
  announcements: 'Announcements',
  messages: 'Messages',
}
