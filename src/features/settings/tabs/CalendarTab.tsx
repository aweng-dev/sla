import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarBlank } from '@phosphor-icons/react'
import { ApiError, type Paginated } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import { formatDate } from '@/shared/lib/format'
import {
  Badge,
  Blank,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  StatusBadge,
  type Column,
} from '@/shared/ui'
import { catalogKeys } from '@/features/students/students.api'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { ReadOnlyNote } from '../components/Facts'
import { settingsApi } from '../settings.api'
import type { AcademicPeriod, AcademicSession } from '../settings.types'

/**
 * Which Session the institution is running, and which Period inside it.
 *
 * ── The words ──────────────────────────────────────────────────────────────
 *
 * The academic year is a **Session** and its divisions are **Periods**,
 * product-wide and in every institution vocabulary. A row's `type_label` —
 * "Term" here, "Semester" at a university — is the institution's own KIND label
 * for one division, and appears only in that column.
 *
 * ── Why "make current" is a button and not a status field ──────────────────
 *
 * It is the most consequential write in the module: every default in the
 * product resolves through the current flag. The API gives it its own address
 * for that reason, and each row already carries `can_manage` — the policy's own
 * answer — so the button is drawn from the server's judgement rather than from
 * a permission string re-derived here.
 */
export function CalendarTab() {
  const { access } = useTenant()
  const t = useTerminology()
  const perms = usePermissions()

  const calendar = access?.calendar ?? { session: null, period: null }
  const canViewSessions = perms.has('academic_sessions.view')
  const canViewPeriods = perms.has('academic_periods.view')

  const sessionsQuery = useQuery({
    queryKey: qk.academics.sessions(),
    queryFn: settingsApi.sessions,
    enabled: canViewSessions,
    staleTime: 5 * 60_000,
  })

  const currentSessionId =
    calendar.session?.id ?? sessionsQuery.data?.rows.find((row) => row.is_current)?.id ?? null

  const periodsQuery = useQuery({
    queryKey: qk.academics.periods({ academic_session_id: currentSessionId }),
    queryFn: () => settingsApi.periods(currentSessionId as string),
    enabled: canViewPeriods && currentSessionId !== null,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-12 gap-y-4">
          <CalendarFact
            label={`Current ${t('session').toLowerCase()}`}
            value={calendar.session?.name ?? 'None set'}
          />
          <CalendarFact
            label={`Current ${t('period').toLowerCase()}`}
            value={calendar.period?.name ?? 'None set'}
          />
        </CardBody>
      </Card>

      {canViewSessions ? (
        <SessionsCard
          title={t('sessions')}
          query={sessionsQuery}
          periodsNoun={t('periods')}
        />
      ) : (
        <Card>
          <CardHeader title={t('sessions')} />
          <CardBody>
            <ReadOnlyNote>
              The two figures above are everything this session is told about the academic calendar.
              Seeing the full list needs {t('session').toLowerCase()} access.
            </ReadOnlyNote>
          </CardBody>
        </Card>
      )}

      {canViewPeriods && currentSessionId !== null && (
        <PeriodsCard
          title={`${t('periods')} in ${calendar.session?.name ?? 'the current ' + t('session').toLowerCase()}`}
          query={periodsQuery}
          sessionId={currentSessionId}
        />
      )}
    </div>
  )
}

/**
 * One standing fact, as Sprig's Plan Details card states one.
 *
 * A tinted glyph tile, the value in ink, the caption under it in micro grey —
 * not a stat tile. A 24px semibold figure is the right weight for a metric that
 * moved since yesterday; the name of the year the school is in is not a metric,
 * and shouting it is the loudest thing on a settings screen that should be
 * quiet.
 */
function CalendarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600"
        aria-hidden
      >
        <CalendarBlank size={15} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-900">{value}</p>
        <p className="truncate text-2xs text-gray-600">{label}</p>
      </div>
    </div>
  )
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

type SessionsQuery = UseQueryResult<Paginated<AcademicSession>, Error>

function SessionsCard({
  title,
  query,
  periodsNoun,
}: {
  title: string
  query: SessionsQuery
  periodsNoun: string
}) {
  const queryClient = useQueryClient()

  const makeCurrent = useMutation({
    mutationFn: (id: string) => settingsApi.makeSessionCurrent(id),
    onSuccess: (updated) => {
      /* Everything downstream of "which year is this" has to hear about it —
       * the context that feeds the header, and the period list that is scoped
       * to the year that just changed. */
      queryClient.invalidateQueries({ queryKey: qk.academics.sessions() })
      queryClient.invalidateQueries({ queryKey: qk.auth.context })
      /* `GET /admin/catalog/academic-sessions` is a SECOND copy of the flag
       * this write just moved — a thinner row, cached under its own key, held
       * for ten minutes by every picker that fills itself from it. Without
       * this, "Admit a student" goes on preselecting the year that was archived
       * here and labelling it "(current)". Reaching across for the key rather
       * than clearing `['catalog']` wholesale keeps the programme, level and
       * class lists — which this write did not touch — off the wire. */
      queryClient.invalidateQueries({ queryKey: catalogKeys.sessions })
      toast.success(`${updated.name} is now the current session`)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That session could not be made current.',
      )
    },
  })

  /* Single-line rows. The code is a value in its own right — it is what a
   * finance import matches on — so it gets a column rather than a second muted
   * line under the name. */
  const columns: Column<AcademicSession>[] = [
    { key: 'name', header: 'Name', cell: (row) => row.name },
    { key: 'code', header: 'Code', cell: (row) => row.code ?? <Blank /> },
    {
      key: 'dates',
      header: 'Runs',
      cell: (row) => `${formatDate(row.starts_on)} – ${formatDate(row.ends_on)}`,
    },
    {
      key: 'periods',
      header: periodsNoun,
      numeric: true,
      cell: (row) => row.period_count,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'current',
      header: '',
      width: '9rem',
      className: 'text-right',
      cell: (row) =>
        row.is_current ? (
          <Badge tone="brand">Current</Badge>
        ) : row.can_manage ? (
          <Button
            size="sm"
            loading={makeCurrent.isPending && makeCurrent.variables === row.id}
            disabled={makeCurrent.isPending}
            onClick={() => makeCurrent.mutate(row.id)}
          >
            Make current
          </Button>
        ) : null,
    },
  ]

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <Card>
      <CardHeader title={title} subtitle="The academic years this institution has recorded." />
      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        skeletonRows={3}
        empty={
          <EmptyState
            icon={<CalendarBlank size={20} />}
            title="No academic years recorded"
            description="Nothing can be enrolled, invoiced or assessed until one exists."
          />
        }
      />
    </Card>
  )
}

/* ── Periods ───────────────────────────────────────────────────────────── */

type PeriodsQuery = UseQueryResult<Paginated<AcademicPeriod>, Error>

function PeriodsCard({
  title,
  query,
  sessionId,
}: {
  title: string
  query: PeriodsQuery
  sessionId: string
}) {
  const queryClient = useQueryClient()

  const makeCurrent = useMutation({
    mutationFn: (id: string) => settingsApi.makePeriodCurrent(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: qk.academics.periods({ academic_session_id: sessionId }),
      })
      queryClient.invalidateQueries({ queryKey: qk.auth.context })
      toast.success(`${updated.name} is now the current period`)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That period could not be made current.',
      )
    },
  })

  const columns: Column<AcademicPeriod>[] = [
    { key: 'name', header: 'Name', cell: (row) => row.name },
    { key: 'code', header: 'Code', cell: (row) => row.code ?? <Blank /> },
    /* The institution's own word for one division — "Term", "Semester". The
     * concept stays a Period everywhere else on this screen. */
    { key: 'kind', header: 'Kind', cell: (row) => row.type_label },
    { key: 'sequence', header: 'Order', numeric: true, cell: (row) => row.sequence },
    {
      key: 'dates',
      header: 'Runs',
      cell: (row) => `${formatDate(row.starts_on)} – ${formatDate(row.ends_on)}`,
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'current',
      header: '',
      width: '9rem',
      className: 'text-right',
      cell: (row) =>
        row.is_current ? (
          <Badge tone="brand">Current</Badge>
        ) : row.can_manage ? (
          <Button
            size="sm"
            loading={makeCurrent.isPending && makeCurrent.variables === row.id}
            disabled={makeCurrent.isPending}
            onClick={() => makeCurrent.mutate(row.id)}
          >
            Make current
          </Button>
        ) : null,
    },
  ]

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <Card>
      <CardHeader title={title} subtitle="Ordered as the year runs." />
      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        skeletonRows={3}
        empty={
          <EmptyState
            icon={<CalendarBlank size={20} />}
            title="This year has no divisions yet"
            description="Attendance, assessment and report cards are all recorded against one, so the year needs at least one before it can start."
          />
        }
      />
    </Card>
  )
}
