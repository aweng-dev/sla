import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Warning } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatDateTime, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { StudentPicker } from '@/features/finance/dialogs/useStudentPicker'
import {
  Badge,
  Blank,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  PageHeader,
  panelId,
  Select,
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { BehaviourDialog, IncidentDialog } from './StudentServicesDialogs'
import { disciplineApi, studentServicesKeys } from './studentServices.api'
import {
  INCIDENT_STATUSES,
  severityTone,
  type BehaviourRecord,
  type DisciplineIncident,
} from './studentServices.types'

/**
 * Discipline and behaviour.
 *
 * ── The list is narrowed before this client sees it ────────────────────────
 *
 * `ScopeDisciplineIncidentsToReader` decides which incidents a caller may read
 * on the server, before the one filter this screen sends. A form tutor and a
 * head of year get different lists from the same request. So nothing here
 * calls it "all incidents" — it is the incidents this reader may see, which is
 * a different sentence and the honest one.
 *
 * ── Two questions that look like one ───────────────────────────────────────
 *
 * `is_confidential` restricts which STAFF may read an incident.
 * `student_visible` decides whether the family is told about it at all. They
 * are shown separately because conflating them is how a school either leaks a
 * safeguarding matter or silently withholds an ordinary one.
 */
export function DisciplinePage() {
  const t = useTerminology()
  const perms = usePermissions()
  const tabsId = useId()

  const [tab, setTab] = useState('incidents')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<DisciplineIncident | null>(null)
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null)
  const [filing, setFiling] = useState(false)
  const [recording, setRecording] = useState(false)

  const tabs: TabItem[] = [
    { key: 'incidents', label: 'Incidents' },
    { key: 'conduct', label: 'Conduct record' },
  ]
  const active = tabs.some((x) => x.key === tab) ? tab : 'incidents'

  const query = useMemo(() => ({ status: status || undefined }), [status])

  const incidents = useQuery({
    queryKey: studentServicesKeys.incidents(query),
    queryFn: () => disciplineApi.incidents(query),
    enabled: active === 'incidents',
  })

  const conduct = useQuery({
    queryKey: studentServicesKeys.conduct(student?.id ?? ''),
    queryFn: () => disciplineApi.conduct(student!.id),
    enabled: active === 'conduct' && student !== null,
  })

  const behaviour = useQuery({
    queryKey: studentServicesKeys.behaviour(student?.id ?? ''),
    queryFn: () => disciplineApi.behaviourRecords(student!.id),
    enabled: active === 'conduct' && student !== null,
  })

  const incidentColumns: Column<DisciplineIncident>[] = [
    {
      key: 'reference',
      header: 'Reference',
      width: '9rem',
      className: 'tabular',
      cell: (row) =>
        row.reference ? <span className="font-mono text-[0.6875rem]">{row.reference}</span> : <Blank />,
    },
    {
      key: 'summary',
      header: 'What happened',
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          {row.is_confidential && (
            <Warning size={13} className="shrink-0 text-gray-500" aria-label="Confidential" />
          )}
          <span className="truncate">{row.summary}</span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', width: '10rem', cell: (row) => humanize(row.category) },
    {
      key: 'severity',
      header: 'Severity',
      width: '8rem',
      cell: (row) => (
        <span
          className={cn(severityTone(row.severity) === 'danger' && 'font-medium text-danger-500')}
        >
          {humanize(row.severity)}
        </span>
      ),
    },
    {
      key: 'occurred',
      header: 'When',
      className: 'tabular',
      width: '11rem',
      cell: (row) => (row.occurred_at ? formatDateTime(row.occurred_at) : <Blank />),
    },
    { key: 'status', header: 'Status', width: '11rem', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  const behaviourColumns: Column<BehaviourRecord>[] = [
    {
      key: 'kind',
      header: 'Kind',
      width: '7rem',
      cell: (row) => (
        <Badge tone={row.kind === 'merit' ? 'success' : 'danger'}>{humanize(row.kind)}</Badge>
      ),
    },
    {
      key: 'points',
      header: 'Points',
      width: '6rem',
      numeric: true,
      /* `signed_points` is the API's own arithmetic — a demerit of 3 arrives as
       * points 3, signed −3 — so nothing here has to know which kinds
       * subtract. */
      cell: (row) => (
        <span className={cn('font-medium', row.signed_points < 0 ? 'text-danger-500' : 'text-success-600')}>
          {row.signed_points > 0 ? `+${row.signed_points}` : row.signed_points}
        </span>
      ),
    },
    { key: 'reason', header: 'Reason', cell: (row) => row.reason },
    { key: 'category', header: 'Category', width: '9rem', cell: (row) => row.category || <Blank /> },
    {
      key: 'when',
      header: 'When',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.occurred_on ? formatDate(row.occurred_on) : <Blank />),
    },
  ]

  return (
    <PageStack>
      <PageHeader
        title="Discipline and behaviour"
        description="Incidents, the sanctions that follow them, and the merits and demerits that do not."
      />

      <div>
        <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />
        <div role="tabpanel" id={panelId(tabsId, active)} aria-labelledby={`${tabsId}-tab-${active}`}>
          {active === 'incidents' && (
            <>
              <Toolbar
                filters={
                  <>
                    <div className="w-48">
                      <Select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        aria-label="Filter by status"
                        options={[
                          { value: '', label: 'Any status' },
                          ...INCIDENT_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
                        ]}
                      />
                    </div>
                    {status && (
                      <Button variant="link" size="sm" onClick={() => setStatus('')}>
                        Clear filter
                      </Button>
                    )}
                  </>
                }
                actions={
                  perms.has('discipline.manage') ? (
                    <Button
                      variant="primary"
                      icon={<Plus size={14} weight="bold" />}
                      onClick={() => {
                        setTab('conduct')
                        setFiling(true)
                      }}
                    >
                      File an incident
                    </Button>
                  ) : null
                }
              />

              {incidents.isError ? (
                <ErrorState error={incidents.error} onRetry={() => incidents.refetch()} />
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <DataTable
                      rows={incidents.data ?? []}
                      columns={incidentColumns}
                      rowKey={(row) => row.id}
                      loading={incidents.isLoading}
                      skeletonRows={8}
                      onRowClick={(row) => setSelected(row)}
                      selectedIds={selected ? new Set([selected.id]) : undefined}
                      empty={
                        <EmptyState
                          icon={<Warning size={20} />}
                          title={status ? 'Nothing with this status' : 'No incidents on file'}
                          description={
                            status
                              ? 'No incident you may see carries this status.'
                              : 'Incidents you are entitled to see appear here. The list is narrowed by the server, so a colleague may see a different one.'
                          }
                        />
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    {selected ? (
                      <IncidentDetail incident={selected} />
                    ) : (
                      !incidents.isLoading &&
                      (incidents.data?.length ?? 0) > 0 && (
                        <Card>
                          <EmptyState
                            title="No incident selected"
                            description="Choose one to see who was involved."
                          />
                        </Card>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {active === 'conduct' && (
            <div className="flex flex-col gap-5 pt-3">
              <Card>
                <CardHeader
                  title={`Choose a ${t('learner').toLowerCase()}`}
                  subtitle="Conduct is read per child, not as a league table."
                />
                <div className="max-w-md px-4 py-4">
                  <StudentPicker value={student} onChange={setStudent} label={t('learner')} />
                </div>
              </Card>

              {student && conduct.isError && (
                <ErrorState error={conduct.error} onRetry={() => conduct.refetch()} />
              )}

              {student && conduct.data && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile label="Merits" value={conduct.data.merit_points} />
                  <StatTile label="Demerits" value={conduct.data.demerit_points} />
                  <StatTile
                    label="Net"
                    value={conduct.data.net_points}
                    hint={conduct.data.net_points >= 0 ? 'In credit' : 'In deficit'}
                  />
                  <StatTile
                    label="Incidents"
                    value={conduct.data.incident_count}
                    hint={`${conduct.data.effective_sanction_count} sanction${conduct.data.effective_sanction_count === 1 ? '' : 's'} in force`}
                  />
                </div>
              )}

              {student && (
                <Card>
                  <CardHeader
                    title="Merits and demerits"
                    subtitle="Everyday conduct, kept apart from formal incidents."
                    actions={
                      perms.has('discipline.manage') ? (
                        <Button
                          icon={<Plus size={14} weight="bold" />}
                          onClick={() => setRecording(true)}
                        >
                          Record
                        </Button>
                      ) : undefined
                    }
                  />
                  {behaviour.isError ? (
                    <ErrorState error={behaviour.error} onRetry={() => behaviour.refetch()} />
                  ) : (
                    <DataTable
                      rows={behaviour.data ?? []}
                      columns={behaviourColumns}
                      rowKey={(row) => row.id}
                      loading={behaviour.isLoading}
                      skeletonRows={3}
                      className="border-0"
                      empty={<EmptyState title="Nothing recorded for this child" />}
                    />
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      <IncidentDialog open={filing} onClose={() => setFiling(false)} student={student} />
      <BehaviourDialog open={recording} onClose={() => setRecording(false)} student={student} />
    </PageStack>
  )
}

/** Who was involved, and how the incident stands. */
function IncidentDetail({ incident }: { incident: DisciplineIncident }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={incident.reference ?? 'Incident'} subtitle={incident.summary} />
        <Facts>
          <Fact label="Occurred">
            {incident.occurred_at ? formatDateTime(incident.occurred_at) : <Blank />}
          </Fact>
          <Fact label="Where">{incident.location || <Blank />}</Fact>
          <Fact label="Category">{humanize(incident.category)}</Fact>
          <Fact label="Severity">
            <span
              className={cn(
                severityTone(incident.severity) === 'danger' && 'font-medium text-danger-500',
              )}
            >
              {humanize(incident.severity)}
            </span>
          </Fact>
          <Fact label="Status">
            <StatusBadge status={incident.status} />
          </Fact>
          {/* Two different questions — see the note on the page component. */}
          <Fact label="Staff access">
            <Flag on={!incident.is_confidential}>
              {incident.is_confidential ? 'Confidential' : 'Open to staff'}
            </Flag>
          </Fact>
          <Fact label="Family told">
            <Flag on={incident.student_visible}>
              {incident.student_visible ? 'Visible to the family' : 'Not shared'}
            </Flag>
          </Fact>
          {incident.closed_at && <Fact label="Closed">{formatDate(incident.closed_at)}</Fact>}
        </Facts>
      </Card>

      {incident.description && (
        <Card>
          <CardHeader title="Account" />
          <p className="whitespace-pre-wrap px-4 py-3 text-sm text-gray-700">
            {incident.description}
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="Who was involved" subtitle="Roles as they were recorded." />
        {incident.parties.length === 0 ? (
          <EmptyState title="No parties recorded" />
        ) : (
          <ul className="divide-y divide-gray-200">
            {incident.parties.map((party) => (
              <li key={party.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 text-sm text-gray-900">
                  {party.student_name ?? party.staff_name ?? (
                    <span className="text-gray-500">Name withheld</span>
                  )}
                </span>
                <Badge tone={party.role === 'victim' ? 'danger' : 'neutral'}>
                  {humanize(party.role)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
