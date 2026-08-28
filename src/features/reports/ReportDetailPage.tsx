import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ChartBar, Play, Trash } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EntityIcon,
  ErrorState,
  MetaDot,
  Modal,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { formatDate, formatRelative, humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { reportKeys, reportsApi } from './reports.api'
import { RunsPanel } from './RunsPanel'
import { SchedulesPanel } from './SchedulesPanel'
import { RunReportDialog } from './RunReportDialog'
import { columnLabel } from './ParameterFields'
import { parametersFor } from './reports.parameters'

/** One saved report: what it asks, what it has produced, and who gets it. */
export function ReportDetailPage() {
  const { reportId } = useParams({ strict: false }) as { reportId: string }
  const perms = usePermissions()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const query = useQuery({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => reportsApi.detail(reportId),
  })

  const datasets = useQuery({
    queryKey: reportKeys.datasets(),
    queryFn: reportsApi.datasets,
    staleTime: Infinity,
  })

  const remove = useMutation({
    mutationFn: () => reportsApi.remove(reportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.all })
      toast.success('Report deleted')
      navigate({ to: '/reports' })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Could not delete it.'),
  })

  if (query.isLoading) {
    return (
      <PageStack>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
      </PageStack>
    )
  }

  if (query.isError || !query.data) {
    return (
      <PageStack>
        <BackLink />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </PageStack>
    )
  }

  const report = query.data
  const dataset = datasets.data?.find((d) => d.id === report.dataset)
  const specs = dataset ? parametersFor(dataset) : []
  const savedFilters = Object.entries(report.parameters ?? {})

  return (
    <PageStack>
      <BackLink />

      <PageHeader
        icon={
          <EntityIcon>
            <ChartBar size={17} />
          </EntityIcon>
        }
        title={report.name}
        description={report.description ?? undefined}
        meta={
          <>
            <span>{report.dataset_label}</span>
            <MetaDot />
            {report.visibility === 'shared' ? (
              <Badge tone="neutral">Shared</Badge>
            ) : (
              <Badge tone="outline">Private</Badge>
            )}
            <MetaDot />
            <span>Created {formatDate(report.created_at)}</span>
            {report.last_run_at && (
              <>
                <MetaDot />
                <span>Last run {formatRelative(report.last_run_at)}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            {perms.has('reports.manage') && report.is_mine && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this report"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash size={15} />
              </Button>
            )}
            <Button
              variant="primary"
              icon={<Play size={13} weight="fill" />}
              onClick={() => setRunning(true)}
            >
              Run report
            </Button>
          </>
        }
      />

      {/* ── What it asks ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="What it asks for"
          subtitle={dataset?.description ?? 'The dataset this report reads.'}
        />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-600">Filters</dt>
              <dd className="mt-1">
                {savedFilters.length === 0 ? (
                  <span className="text-sm text-gray-700">
                    None — everything the dataset holds that you can see.
                  </span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {savedFilters.map(([key, value]) => (
                      <li
                        key={key}
                        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-800"
                      >
                        <span className="text-gray-600">
                          {specs.find((s) => s.key === key)?.label ?? humanize(key)}:
                        </span>{' '}
                        {String(value)}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-gray-600">
                Columns ({report.effective_columns.length})
              </dt>
              <dd className="mt-1">
                <ul className="flex flex-wrap gap-1.5">
                  {report.effective_columns.map((column) => (
                    <li
                      key={column}
                      className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-800"
                    >
                      {columnLabel(column)}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <RunsPanel report={report} />

      {perms.has('reports.view') && <SchedulesPanel reportId={report.id} />}

      <RunReportDialog report={report} open={running} onClose={() => setRunning(false)} />

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        size="sm"
        title="Delete this report?"
        description="Its saved runs and schedules go with it. Results already downloaded are unaffected."
        footer={
          <>
            <Button onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          “{report.name}” will be removed for everyone it is shared with.
        </p>
      </Modal>
    </PageStack>
  )
}

function BackLink() {
  return (
    <Link
      to="/reports"
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={12} weight="bold" />
      All reports
    </Link>
  )
}
