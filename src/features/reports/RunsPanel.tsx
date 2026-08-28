import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretDown, CaretRight, DownloadSimple, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { downloadRun, isPending, reportKeys, reportsApi } from './reports.api'
import { RunPreview } from './RunPreview'
import type { ReportDefinition, ReportRun, ReportRunStatus } from './reports.types'

/**
 * Every run of this report that belongs to the reader.
 *
 * ── Why it polls ──────────────────────────────────────────────────────────
 *
 * A run is queued, not performed — the API answers 202 and a worker picks it
 * up. Nothing pushes, so the only way to learn that a run finished is to ask.
 * The interval is live ONLY while something is unsettled, so a screen showing
 * ten finished runs makes no requests at all.
 *
 * ── Why these are only the reader's own runs ───────────────────────────────
 *
 * The API narrows the query by `compiled_for_user_id`. Two people running the
 * same shared definition legitimately get different rows, because each run is
 * compiled against the runner's own scopes — so showing somebody else's run
 * would be showing rows this reader may not be entitled to.
 */
export function RunsPanel({ report }: { report: ReportDefinition }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const query = useQuery({
    queryKey: reportKeys.runs(report.id),
    queryFn: () => reportsApi.runs(report.id, { per_page: 15 }),
    refetchInterval: (q) => {
      const rows = q.state.data?.rows ?? []
      return rows.some((run) => isPending(run.status)) ? 2000 : false
    },
  })

  const runs = query.data?.rows ?? []

  return (
    <Card>
      <CardHeader
        title="Runs"
        subtitle="Yours only — a run is compiled against the access of whoever asked for it."
      />
      <CardBody className="p-0">
        {query.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="Not run yet"
            description="Run it to produce a result you can read here or download."
          />
        ) : (
          <ul>
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                reportName={report.name}
                expanded={expanded === run.id}
                onToggle={() =>
                  setExpanded((current) => (current === run.id ? null : run.id))
                }
                onDownloaded={() =>
                  queryClient.invalidateQueries({ queryKey: reportKeys.runs(report.id) })
                }
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function RunRow({
  run,
  reportName,
  expanded,
  onToggle,
  onDownloaded,
}: {
  run: ReportRun
  reportName: string
  expanded: boolean
  onToggle: () => void
  onDownloaded: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const previewable = run.format === 'json' && run.status === 'succeeded'

  async function download() {
    setDownloading(true)
    try {
      await downloadRun(run, reportName)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'The file could not be downloaded.',
      )
      onDownloaded()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="border-b border-gray-200 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={!previewable}
          aria-expanded={previewable ? expanded : undefined}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
            previewable
              ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              : 'cursor-default text-gray-300',
          )}
          aria-label={previewable ? 'Show the rows' : 'No preview for this run'}
        >
          {expanded ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
        </button>

        <RunStatusChip status={run.status} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">
            {run.status === 'succeeded' && run.row_count !== null
              ? `${formatNumber(run.row_count)} row${run.row_count === 1 ? '' : 's'}`
              : run.status === 'failed'
                ? (run.error_message ?? 'The run failed')
                : 'Waiting for a worker'}
            <span className="ml-2 text-2xs uppercase tracking-wide text-gray-500">
              {run.format}
            </span>
          </p>
          <p className="truncate text-2xs text-gray-600">
            {formatRelative(run.created_at)}
            {run.trigger === 'scheduled' && ' · from a schedule'}
            {run.duration_ms !== null && ` · ${formatNumber(run.duration_ms)} ms`}
            {run.byte_size !== null && ` · ${bytes(run.byte_size)}`}
          </p>
        </div>

        {run.expires_at && run.is_downloadable && (
          <span className="hidden shrink-0 text-2xs text-gray-500 sm:block">
            Kept until {formatDateTime(run.expires_at)}
          </span>
        )}

        <Button
          size="sm"
          icon={<DownloadSimple size={13} />}
          disabled={!run.is_downloadable}
          loading={downloading}
          onClick={download}
        >
          Download
        </Button>
      </div>

      {expanded && previewable && (
        <div className="border-t border-gray-200 bg-white">
          <RunPreview run={run} />
        </div>
      )}
    </li>
  )
}

function RunStatusChip({ status }: { status: ReportRunStatus }) {
  if (status === 'succeeded') return <Badge tone="success">Succeeded</Badge>
  if (status === 'failed') {
    return (
      <Badge tone="danger">
        <Warning size={11} weight="bold" /> Failed
      </Badge>
    )
  }
  return (
    <Badge tone="neutral">
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500"
        aria-hidden
      />
      {status === 'queued' ? 'Queued' : 'Running'}
    </Badge>
  )
}

function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
