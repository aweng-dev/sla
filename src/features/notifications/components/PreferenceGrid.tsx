import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, Switch } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { humanize } from '@/shared/lib/format'
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  notificationKeys,
  notificationsApi,
  type PreferenceCatalogue,
} from '../notifications.api'

/**
 * How this person is contacted, one channel and one category at a time.
 *
 * ── The grid is built from the API's own arrays ────────────────────────────
 *
 * The columns are the keys of `meta.defaults` and the rows are `meta.categories`.
 * Nothing here declares a channel: a platform that adds one gets a column, and
 * a screen that hard-coded four would quietly stop offering the fifth. The only
 * local knowledge is how to SPELL them, and anything unmapped falls through to
 * `humanize`.
 *
 * ── Saved choices are sparse ───────────────────────────────────────────────
 *
 * An absent row means the platform default, which is why the defaults travel in
 * `meta` — a screen that reimplemented them would disagree with the server the
 * first time one changed. So a cell reads its saved row if there is one and the
 * default if there is not, and the caption says so rather than leaving a reader
 * to wonder why four switches are on that they never touched.
 */
export function PreferenceGrid() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Set<string>>(new Set())

  const query = useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: notificationsApi.preferences,
  })

  const setPreference = useMutation({
    mutationFn: notificationsApi.setPreference,
    onMutate: async (input) => {
      const cell = cellKey(input.channel, input.category)
      setPending((current) => new Set(current).add(cell))

      await queryClient.cancelQueries({ queryKey: notificationKeys.preferences })
      const previous = queryClient.getQueryData<PreferenceCatalogue>(notificationKeys.preferences)

      queryClient.setQueryData<PreferenceCatalogue>(notificationKeys.preferences, (current) =>
        current ? upsert(current, { ...input, id: cell }) : current,
      )

      return { previous, cell }
    },
    onSuccess: (saved) => {
      /* The server's row carries the real id, so the provisional one written by
       * `onMutate` is replaced rather than left to be reconciled later. */
      queryClient.setQueryData<PreferenceCatalogue>(notificationKeys.preferences, (current) =>
        current ? upsert(current, saved) : current,
      )
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.preferences, context.previous)
      }
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That preference could not be saved.',
      )
    },
    onSettled: (_data, _error, _input, context) => {
      if (!context) return
      setPending((current) => {
        const next = new Set(current)
        next.delete(context.cell)
        return next
      })
    },
  })

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardBody className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-4 w-8 rounded-full" />
              <Skeleton className="h-4 w-8 rounded-full" />
              <Skeleton className="h-4 w-8 rounded-full" />
              <Skeleton className="h-4 w-8 rounded-full" />
            </div>
          ))}
        </CardBody>
      </Card>
    )
  }

  const catalogue = query.data
  const channels = catalogue ? Object.keys(catalogue.defaults) : []

  if (!catalogue || channels.length === 0 || catalogue.categories.length === 0) {
    return (
      <EmptyState
        icon={<SlidersHorizontal size={20} />}
        title="No channels to choose from"
        description="This institution has not switched on any way of contacting you outside the app."
      />
    )
  }

  return (
    <Card>
      <CardHeader
        title="How you are contacted"
        subtitle="Each switch is one kind of news on one channel. Changes save as you make them."
      />

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-table-head">
              <th scope="col" className="px-4 py-2 text-2xs font-medium text-gray-600">
                Tell me about
              </th>
              {channels.map((channel) => (
                <th
                  key={channel}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2 text-center text-2xs font-medium text-gray-600"
                >
                  {CHANNEL_LABELS[channel] ?? humanize(channel)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {catalogue.categories.map((category) => {
              const label = CATEGORY_LABELS[category] ?? humanize(category)

              return (
                <tr key={category} className="border-b border-gray-200 last:border-0">
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-2 text-sm font-normal text-gray-900"
                  >
                    {label}
                  </th>

                  {channels.map((channel) => {
                    const cell = cellKey(channel, category)
                    const enabled = effective(catalogue, channel, category)

                    return (
                      <td key={channel} className="px-4 py-2 text-center">
                        <Switch
                          checked={enabled}
                          disabled={pending.has(cell)}
                          label={`${CHANNEL_LABELS[channel] ?? humanize(channel)} for ${label}`}
                          onChange={(next) =>
                            setPreference.mutate({ channel, category, enabled: next })
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-200 px-4 py-3">
        <DefaultsCaption defaults={catalogue.defaults} />
      </div>
    </Card>
  )
}

function cellKey(channel: string, category: string): string {
  return `${channel}:${category}`
}

function effective(catalogue: PreferenceCatalogue, channel: string, category: string): boolean {
  const saved = catalogue.saved.find(
    (row) => row.channel === channel && row.category === category,
  )
  return saved ? saved.enabled : (catalogue.defaults[channel] ?? false)
}

function upsert(
  catalogue: PreferenceCatalogue,
  row: { id: string; channel: string; category: string; enabled: boolean },
): PreferenceCatalogue {
  const index = catalogue.saved.findIndex(
    (saved) => saved.channel === row.channel && saved.category === row.category,
  )

  const saved = [...catalogue.saved]
  if (index === -1) saved.push(row)
  else saved[index] = row

  return { ...catalogue, saved }
}

/** Read out of the API's own `defaults` map, so the caption cannot drift from
 *  the switches above it. */
function DefaultsCaption({ defaults }: { defaults: Record<string, boolean> }) {
  const label = (key: string) => CHANNEL_LABELS[key] ?? humanize(key)
  const on = Object.keys(defaults).filter((key) => defaults[key])
  const off = Object.keys(defaults).filter((key) => !defaults[key])

  return (
    <p className="text-xs text-gray-600">
      A switch you have not changed uses the platform default.
      {on.length > 0 && (
        <> On by default: <span className="text-gray-900">{list(on.map(label))}</span>.</>
      )}
      {off.length > 0 && (
        <> Off by default: <span className="text-gray-900">{list(off.map(label))}</span>.</>
      )}
    </p>
  )
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
