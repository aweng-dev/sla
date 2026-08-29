import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowClockwise, Lightning, ShieldWarning, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CellStack,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Segmented,
  StatusBadge,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber, formatRelative, humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys } from './finance.api'
import type { PaymentWebhookEvent } from './finance.types'

/**
 * The gateway's own messages, and the queue of ones that did not land.
 *
 * ── The screen a parent's complaint ends up on ─────────────────────────────
 *
 * The money loop is: structure → invoice → checkout → the provider takes the
 * money → a webhook says so → a payment is written → the balance falls. When
 * somebody says "I paid and it still shows unpaid", exactly one link has broken
 * and this is the only place that can say which. Everything else in this
 * feature shows the result; this shows the mechanism.
 *
 * ── It opens on the queue, not on the log ──────────────────────────────────
 *
 * `?unmatched=1` narrows to `failed` and `exhausted` — the two a person can do
 * anything about. Landing on the full history would bury four events that need
 * attention under four thousand that processed themselves.
 *
 * ── An unverified signature is not a retry candidate ───────────────────────
 *
 * `signature_verified: false` means this application could not prove the message
 * came from the gateway. Replaying it would be acting on an unsigned claim about
 * somebody's money, so the button is not offered and the row says why.
 *
 * ── Replay is not repair ───────────────────────────────────────────────────
 *
 * It resets the event and runs the same processing again. That fixes a
 * transient failure and changes nothing about one that failed on its merits, so
 * the copy says so rather than implying a fix.
 */
export function PaymentEventsTab() {
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const canReplay = permissions.has('finance.manage')

  /* The queue first — see the note above. */
  const [scope, setScope] = useState<'unmatched' | 'all'>('unmatched')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const params = useMemo(() => ({ unmatched: scope === 'unmatched', page }), [scope, page])

  const events = useQuery({
    queryKey: financeKeys.events(params),
    queryFn: () => financeApi.events(params),
    placeholderData: (previous) => previous,
  })

  const replay = useMutation({
    mutationFn: (event: PaymentWebhookEvent) => financeApi.replayEvent(event.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.events() })
      queryClient.invalidateQueries({ queryKey: ['finance'] })

      toast.success(
        result.status === 'processed'
          ? 'Processed. The payment it refers to has been written.'
          : `Still ${humanize(result.status).toLowerCase()}${result.last_error ? `: ${result.last_error}` : '.'}`,
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That event could not be replayed.',
      )
    },
  })

  const rows = events.data?.rows ?? []

  const columns: Column<PaymentWebhookEvent>[] = [
    {
      key: 'event',
      header: 'Event',
      cell: (row) => (
        <CellStack
          primary={row.event_type ? humanize(row.event_type) : 'Unnamed event'}
          secondary={[row.provider_label, row.provider_event_id].filter(Boolean).join(' · ')}
        />
      ),
    },
    {
      key: 'intent',
      header: 'Refers to',
      cell: (row) =>
        row.intent_reference ? (
          <span className="text-sm text-gray-900">{row.intent_reference}</span>
        ) : (
          /* The interesting case: money the provider says it took, that nothing
           * in this system was waiting for. */
          <span className="inline-flex items-center gap-1 text-xs text-danger-600">
            <Warning size={12} weight="fill" />
            No matching checkout
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          {!row.signature_verified && (
            <span className="inline-flex items-center gap-1 text-2xs text-danger-600">
              <ShieldWarning size={12} weight="fill" />
              Unverified
            </span>
          )}
          {row.attempts > 1 && (
            <span className="text-2xs text-gray-500 tabular">
              {formatNumber(row.attempts)} tries
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      cell: (row) => (
        <span className="text-sm text-gray-900" title={formatDateTime(row.received_at)}>
          {row.received_at ? formatRelative(row.received_at) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '13rem',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
            {expanded === row.id ? 'Hide' : 'Why'}
          </Button>

          {canReplay && !row.is_terminal && row.signature_verified && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowClockwise size={14} />}
              loading={replay.isPending && replay.variables?.id === row.id}
              onClick={() => replay.mutate(row)}
            >
              Replay
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        filters={
          <Segmented
            label="Which events to show"
            value={scope}
            onChange={(value) => {
              setScope(value as 'unmatched' | 'all')
              setPage(1)
            }}
            options={[
              { value: 'unmatched', label: 'Needs attention' },
              { value: 'all', label: 'Everything' },
            ]}
          />
        }
      />

      <Card>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : (
          <>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              loading={events.isLoading}
              empty={
                <EmptyState
                  icon={<Lightning size={20} />}
                  title={scope === 'unmatched' ? 'Nothing needs attention' : 'No events yet'}
                  description={
                    scope === 'unmatched'
                      ? 'Every message from your payment providers has been processed. Switch to Everything to see the history.'
                      : 'Messages from your payment providers appear here as they arrive.'
                  }
                />
              }
            />

            {/* Why one failed, on demand. The provider's own words are more
              * useful than anything this screen could summarise. */}
            {expanded && (
              <div className="border-t border-gray-200 px-4 py-3">
                {(() => {
                  const row = rows.find((entry) => entry.id === expanded)
                  if (!row) return null

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{row.provider_label}</Badge>
                        {row.next_attempt_at && (
                          <span className="text-2xs text-gray-600">
                            next try {formatRelative(row.next_attempt_at)}
                          </span>
                        )}
                        {row.processed_at && (
                          <span className="text-2xs text-gray-600">
                            processed {formatDateTime(row.processed_at)}
                          </span>
                        )}
                      </div>

                      {row.last_error ? (
                        <p className="text-xs text-danger-600">{row.last_error}</p>
                      ) : (
                        <p className="text-xs text-gray-600">No error was recorded against this.</p>
                      )}

                      {!row.signature_verified && (
                        <p className="text-xs text-gray-600">
                          The signature on this message could not be verified, so it is not offered
                          for replay — acting on it would mean trusting an unsigned claim about
                          somebody&rsquo;s money. Check the webhook secret for{' '}
                          {row.provider_label} before anything else.
                        </p>
                      )}

                      {row.payload && (
                        <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-2xs text-gray-700">
                          {JSON.stringify(row.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {events.data && events.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={events.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}
