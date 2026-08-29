import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Target, UserPlus, Users } from '@phosphor-icons/react'
import {
  Badge,
  Card,
  CellStack,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatNumber, formatRelative } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import {
  admissionKeys,
  admissionsApi,
  applicantName,
  PIPELINE_STAGES,
  type AdmissionCycle,
  type Applicant,
  type ApplicantStatus,
  type Application,
  type ApplicationStatus,
} from './admissions.api'

/**
 * The intake, as the office works it.
 *
 * ── The cycle is chosen first, and defaults to the one that is open ────────
 *
 * An admissions office works one intake at a time. Landing on "all cycles"
 * mixes last year's rejections into this year's queue and makes every count on
 * the screen answer a question nobody asked. So the selector defaults to the
 * cycle currently accepting applications, and only falls back to the most
 * recent when none is.
 *
 * It also makes the funnel counts CORRECT for a reviewer scoped to one intake.
 * The queue endpoint paginates and then filters each row through the policy, so
 * a total taken across every cycle would count rows such a reviewer may not
 * open. Scoped to their own cycle, the total and what they can see are the same
 * number.
 *
 * ── The funnel is five queries, and that is the cheap way ──────────────────
 *
 * There is no counts endpoint. Five `per_page: 1` requests read their totals out
 * of the pagination meta, run in parallel, and cache like anything else — which
 * is less work than one request that returned every row so the browser could
 * count them.
 */

const TABS_ID = 'admissions-tabs'

type TabKey = 'pipeline' | 'applicants' | 'cycles'

export function AdmissionsPage() {
  const [tab, setTab] = useState<TabKey>('pipeline')

  const tabs: TabItem[] = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'applicants', label: 'Applicants' },
    { key: 'cycles', label: 'Cycles' },
  ]

  return (
    <ModuleGate
      module="admissions"
      title="Admissions"
      offTitle="This institution does not run admissions"
      offDescription="The admissions module is switched off here. An administrator can enable it from the institution's modules."
      tabs={
        <Tabs bare items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} baseId={TABS_ID} />
      }
    >
      <div>
        <Panel id="pipeline" tab={tab}>
          <PipelineTab />
        </Panel>
        <Panel id="applicants" tab={tab}>
          <ApplicantsTab />
        </Panel>
        <Panel id="cycles" tab={tab}>
          <CyclesTab />
        </Panel>
      </div>
    </ModuleGate>
  )
}

function Panel({ id, tab, children }: { id: TabKey; tab: TabKey; children: React.ReactNode }) {
  if (tab !== id) return null
  return (
    <div
      role="tabpanel"
      id={panelId(TABS_ID, id)}
      aria-labelledby={`${TABS_ID}-tab-${id}`}
    >
      {children}
    </div>
  )
}

/* ── Pipeline ────────────────────────────────────────────────────────────── */

function PipelineTab() {
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [stage, setStage] = useState<ApplicationStatus | ''>('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)

  const cycles = useQuery({
    queryKey: admissionKeys.cycles({}),
    queryFn: () => admissionsApi.cycles({}),
  })

  /* The open intake, or the most recent one. Chosen once, then the reader's
   * choice stands — a refetch must not drag them back to the default. */
  useEffect(() => {
    if (cycleId !== null || !cycles.data) return
    const rows = cycles.data.rows
    if (rows.length === 0) return
    const open = rows.find((row) => row.is_accepting_applications) ?? rows[0]
    setCycleId(open.id)
  }, [cycles.data, cycleId])

  const params = useMemo(
    () => ({
      admission_cycle_id: cycleId ?? undefined,
      status: stage,
      search,
      page,
    }),
    [cycleId, stage, search, page],
  )

  const applications = useQuery({
    queryKey: admissionKeys.applications(params),
    queryFn: () => admissionsApi.applications(params),
    placeholderData: (previous) => previous,
    enabled: cycles.isSuccess,
  })

  /* One tiny query per stage. `per_page: 1` because only the total is wanted. */
  const counts = useQueries({
    queries: PIPELINE_STAGES.map((entry) => {
      const countParams = {
        admission_cycle_id: cycleId ?? undefined,
        status: entry.status,
        per_page: 1,
      }
      return {
        queryKey: admissionKeys.applications(countParams),
        queryFn: () => admissionsApi.applications(countParams),
        enabled: cycles.isSuccess,
        select: (result: { pagination: { total: number } }) => result.pagination.total,
      }
    }),
  })

  const columns: Column<Application>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      cell: (row) => (
        <CellStack
          primary={row.applicant?.name || row.applicant?.applicant_number || 'Unnamed'}
          secondary={row.application_number}
        />
      ),
    },
    {
      key: 'choices',
      header: 'Choices',
      cell: (row) =>
        row.choices === undefined ? (
          '—'
        ) : row.choices.length === 0 ? (
          <span className="text-sm text-gray-500">None yet</span>
        ) : (
          <span className="text-sm text-gray-900">
            {formatNumber(row.choices.length)} {row.choices.length === 1 ? 'choice' : 'choices'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Stage',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {row.is_final && <Badge tone="neutral">Closed</Badge>}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (row) =>
        row.submitted_at ? (
          <span title={formatDate(row.submitted_at)}>{formatRelative(row.submitted_at)}</span>
        ) : (
          <span className="text-sm text-gray-500">Not yet</span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── Which intake ─────────────────────────────────────────────── */}
      {(cycles.data?.rows.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <Select
              aria-label="Which intake"
              value={cycleId ?? ''}
              onChange={(event) => {
                setCycleId(event.currentTarget.value || null)
                setPage(1)
              }}
              options={[
                { value: '', label: 'Every intake' },
                ...(cycles.data?.rows ?? []).map((cycle) => ({
                  value: cycle.id,
                  label: cycle.is_accepting_applications ? `${cycle.name} · open` : cycle.name,
                })),
              ]}
            />
          </div>
          {cycleId === null && (
            <p className="text-2xs text-gray-500">
              Counts across every intake include cycles you may not open.
            </p>
          )}
        </div>
      )}

      {/* ── The funnel ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PIPELINE_STAGES.map((entry, index) => {
          const total = counts[index]?.data
          const active = stage === entry.status

          return (
            <button
              key={entry.status}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStage(active ? '' : entry.status)
                setPage(1)
              }}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                active
                  ? 'border-gray-400 bg-rail-active'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <p className="text-xs font-medium text-gray-600">{entry.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 tabular">
                {counts[index]?.isLoading ? '—' : formatNumber(total ?? 0)}
              </p>
            </button>
          )
        })}
      </div>

      <Card>
        <Toolbar
          className="px-3"
          filters={
            <>
              <SearchInput
                value={draft}
                placeholder="Name or number"
                onChange={(event) => {
                  setDraft(event.currentTarget.value)
                  setPage(1)
                }}
              />
              <div className="w-48">
                <Select
                  aria-label="Filter by stage"
                  value={stage}
                  onChange={(event) => {
                    setStage(event.currentTarget.value as ApplicationStatus | '')
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: 'Every stage' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'submitted', label: 'Submitted' },
                    { value: 'under_review', label: 'Under review' },
                    { value: 'interview', label: 'Interview' },
                    { value: 'offered', label: 'Offered' },
                    { value: 'accepted', label: 'Accepted' },
                    { value: 'declined', label: 'Declined' },
                    { value: 'rejected', label: 'Rejected' },
                    { value: 'withdrawn', label: 'Withdrawn' },
                    { value: 'enrolled', label: 'Enrolled' },
                  ]}
                />
              </div>
            </>
          }
        />

        {applications.isError ? (
          <ErrorState error={applications.error} onRetry={() => applications.refetch()} />
        ) : (
          <>
            <DataTable
              rows={applications.data?.rows ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={applications.isLoading || cycles.isLoading}
              rowHref={(row) => `/admissions/${row.id}`}
              empty={
                <EmptyState
                  icon={<Target size={20} />}
                  title={
                    search
                      ? 'Nothing matches that'
                      : stage
                        ? 'Nothing at this stage'
                        : 'No applications yet'
                  }
                  description={
                    search
                      ? 'Try part of a name, or an application number off a letter.'
                      : stage
                        ? 'Clear the stage filter to see the whole queue.'
                        : 'Applications appear here as they are started against an open intake.'
                  }
                />
              }
            />
            {applications.data && applications.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={applications.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

/* ── Applicants ──────────────────────────────────────────────────────────── */

function ApplicantsTab() {
  const t = useTerminology()
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [status, setStatus] = useState<ApplicantStatus | ''>('')
  const [page, setPage] = useState(1)

  const params = useMemo(() => ({ search, status, page }), [search, status, page])

  const applicants = useQuery({
    queryKey: admissionKeys.applicants(params),
    queryFn: () => admissionsApi.applicants(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<Applicant>[] = [
    {
      key: 'name',
      header: 'Applicant',
      cell: (row) => (
        <CellStack primary={applicantName(row)} secondary={row.applicant_number} />
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (row) => (
        <CellStack
          primary={row.metadata?.email ?? '—'}
          secondary={row.metadata?.phone ?? undefined}
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'created',
      header: 'Since',
      cell: (row) => (row.created_at ? formatDate(row.created_at) : '—'),
    },
  ]

  return (
    <Card>
      <Toolbar
        className="px-3"
        filters={
          <>
            <SearchInput
              value={draft}
              placeholder="Name, email, number"
              onChange={(event) => {
                setDraft(event.currentTarget.value)
                setPage(1)
              }}
            />
            <div className="w-44">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => {
                  setStatus(event.currentTarget.value as ApplicantStatus | '')
                  setPage(1)
                }}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'prospect', label: 'Prospect' },
                  { value: 'applying', label: 'Applying' },
                  { value: 'applied', label: 'Applied' },
                  { value: 'admitted', label: 'Admitted' },
                  { value: 'enrolled', label: 'Enrolled' },
                  { value: 'rejected', label: 'Rejected' },
                  { value: 'withdrawn', label: 'Withdrawn' },
                ]}
              />
            </div>
          </>
        }
      />

      {applicants.isError ? (
        <ErrorState error={applicants.error} onRetry={() => applicants.refetch()} />
      ) : (
        <>
          <DataTable
            rows={applicants.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={applicants.isLoading}
            empty={
              <EmptyState
                icon={<UserPlus size={20} />}
                title={search ? 'Nobody matches that' : 'No applicants'}
                description={
                  search
                    ? 'Try part of a name or an email address.'
                    : `An applicant is somebody who has not yet become a ${t('learner').toLowerCase()} here. They may have several applications.`
                }
              />
            }
          />
          {applicants.data && applicants.data.pagination.total > 0 && (
            <Pagination
              className="px-4"
              pagination={applicants.data.pagination}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Card>
  )
}

/* ── Cycles ──────────────────────────────────────────────────────────────── */

function CyclesTab() {
  const cycles = useQuery({
    queryKey: admissionKeys.cycles({}),
    queryFn: () => admissionsApi.cycles({}),
  })

  const columns: Column<AdmissionCycle>[] = [
    {
      key: 'cycle',
      header: 'Intake',
      cell: (row) => <CellStack primary={row.name} secondary={row.code ?? undefined} />,
    },
    {
      key: 'window',
      header: 'Open between',
      cell: (row) => (
        <span className="text-sm text-gray-900">
          {row.starts_at ? formatDate(row.starts_at) : '—'}
          {row.ends_at && ` → ${formatDate(row.ends_at)}`}
        </span>
      ),
    },
    {
      key: 'documents',
      header: 'Requires',
      cell: (row) =>
        row.required_documents.length === 0 ? (
          <span className="text-sm text-gray-500">Nothing</span>
        ) : (
          <span className="text-sm text-gray-900">
            {formatNumber(row.required_documents.length)}{' '}
            {row.required_documents.length === 1 ? 'document' : 'documents'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {/* The API's own wording, not a humanised value. */}
          <StatusBadge status={row.status} />
          {/* Distinct from the status on purpose: a cycle can be open and
            * outside its dates, and then it is not taking anything. */}
          {row.is_accepting_applications && <Badge tone="success">Accepting</Badge>}
        </div>
      ),
    },
  ]

  return (
    <Card>
      {cycles.isError ? (
        <ErrorState error={cycles.error} onRetry={() => cycles.refetch()} />
      ) : (
        <DataTable
          rows={cycles.data?.rows ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          loading={cycles.isLoading}
          empty={
            <EmptyState
              icon={<Users size={20} />}
              title="No intakes"
              description="An intake is the window an application belongs to. It names the documents every application to it must provide."
            />
          }
        />
      )}
    </Card>
  )
}
