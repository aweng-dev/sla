import { Blank, Card, CardHeader, Fact, Facts } from '@/shared/ui'
import { formatDateTime } from '@/shared/lib/format'
import { auditDirection, auditLabel, type AuditLogRow } from './security.types'
import { cn } from '@/shared/lib/cn'

/**
 * One entry, opened out.
 *
 * ── The diff is rendered generically, on purpose ───────────────────────────
 *
 * `before` and `after` are the shape of the changed record, and their keys
 * differ per event: a permission grant carries `permission` and `scope_type`,
 * a role change carries `added`, `removed` and `permissions`. A renderer with
 * a branch per event would be wrong the day the API adds one — and the API
 * stores shapes precisely so a later reader can answer a question the writer
 * did not anticipate.
 *
 * So this walks whatever keys are there and prints them side by side, with the
 * ones that actually differ marked. A reader gets the truth rather than a
 * summary somebody chose for them.
 */
export function AuditEntryPanel({ entry }: { entry: AuditLogRow }) {
  const direction = auditDirection(entry.event)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title={auditLabel(entry.event)}
          subtitle={entry.created_at ? formatDateTime(entry.created_at) : undefined}
        />
        <Facts>
          <Fact label="Event">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  direction === 'granted' && 'bg-success-500',
                  direction === 'revoked' && 'bg-danger-500',
                  direction === 'changed' && 'bg-accent-500',
                )}
                aria-hidden
              />
              <span className="font-mono text-[0.6875rem]">{entry.event}</span>
            </span>
          </Fact>
          <Fact label="Who did it">{entry.actor_name || <Blank />}</Fact>
          <Fact label="Who it was about">{entry.subject_name || <Blank />}</Fact>
          <Fact label="Target">
            {entry.target_type ? (
              <span className="font-mono text-[0.6875rem]">
                {entry.target_type}
                {/* A permission grant records the permission NAME as its target
                  * and carries no id, so the id is only shown when there is
                  * one. */}
                {entry.target_id && (
                  <span className="text-gray-600"> · {entry.target_id.slice(0, 8)}</span>
                )}
              </span>
            ) : (
              <Blank />
            )}
          </Fact>
          {entry.reason && <Fact label="Reason">{entry.reason}</Fact>}
          <Fact label="From">
            {entry.ip_address ? (
              <span className="font-mono text-[0.6875rem]">{entry.ip_address}</span>
            ) : (
              /* Actions never take a request. A console command or a queued job
               * legitimately has no address, and null is the honest answer. */
              <span className="text-gray-500">Not a web request</span>
            )}
          </Fact>
          {entry.user_agent && (
            <Fact label="Client">
              <span className="break-all font-mono text-[0.6875rem]">{entry.user_agent}</span>
            </Fact>
          )}
        </Facts>
      </Card>

      <Card>
        <CardHeader
          title="What changed"
          subtitle="The record as it was, and as it became."
        />
        <Diff before={entry.before} after={entry.after} />
      </Card>
    </div>
  )
}

function Diff({
  before,
  after,
}: {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}) {
  /* Union of both sides, so a key that only exists after a change still shows
   * — which is the common case for a grant, where `before` is null entirely. */
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort()

  if (keys.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-gray-600">
        This event recorded no before or after state — the event name is the whole of it.
      </p>
    )
  }

  return (
    <div className="divide-y divide-gray-200">
      {keys.map((key) => {
        const from = before?.[key]
        const to = after?.[key]
        const changed = JSON.stringify(from) !== JSON.stringify(to)

        return (
          <div key={key} className="px-4 py-3">
            <p className="pb-1.5 text-xs text-gray-600">
              {key.replace(/_/g, ' ')}
              {!changed && <span className="text-gray-500"> · unchanged</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Side label="Before" value={from} muted={!changed} />
              <Side label="After" value={to} muted={!changed} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Side({ label, value, muted }: { label: string; value: unknown; muted: boolean }) {
  const absent = value === undefined || value === null

  return (
    <div>
      <p className="pb-1 text-[0.6875rem] text-gray-500">{label}</p>
      {absent ? (
        <p className="text-sm text-gray-500">—</p>
      ) : (
        <pre
          className={cn(
            'overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-gray-200 px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed',
            muted ? 'bg-gray-50 text-gray-600' : 'bg-white text-gray-900',
          )}
        >
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}
