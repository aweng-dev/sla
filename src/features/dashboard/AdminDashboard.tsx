import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader, ErrorState, PageHeader, StatTile } from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { qk } from '@/shared/api/queryKeys'
import { CATEGORICAL, CHART } from '@/shared/theme/chartColors'
import { formatMoney, formatNumber, formatPercent, humanize } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import type { TerminologyKey } from '@/shared/types/tenant.types'
import { dashboardApi } from './dashboard.api'
import type { CollectionSummary } from './dashboard.types'
import { compactMoney, longPeriodLabel, monthsBefore, shortPeriodLabel } from './dashboard.lib'
import { AXIS_TICK, ChartFrame, ChartLegend, ChartTooltip, GRID_STROKE } from './chartChrome'
import {
  CalendarMeta,
  CardNote,
  InlineSkeleton,
  MiniStat,
  PanelLink,
  PanelRow,
  PanelState,
  QuickLinks,
  RowsSkeleton,
  TileRow,
  tileFigure,
  useGreetingTitle,
  useInstitutionToday,
} from './widgets'

/** How much ledger the collections chart covers. A termly biller posts three
 *  or four times a year, so anything shorter than a year is a chart of the
 *  gaps between invoices rather than of collection. */
const COLLECTION_MONTHS = 11

/**
 * The institution, in one screen.
 *
 * An administrator's question is "is the school running" — how many learners
 * are on roll, what moved today, and whether the fees are coming in. Each of
 * those is one request and one panel, and each panel owns its own loading,
 * error and empty states so a finance outage does not blank the roll.
 */
export function AdminDashboard() {
  const { access } = useTenant()
  const perms = usePermissions()
  const t = useTerminology()
  const title = useGreetingTitle()
  const today = useInstitutionToday()

  const canSeeSummary = perms.has('dashboard.view')
  const canSeeLearners = perms.has('students.view')
  const canSeeFinance = perms.has('finance.view')

  const summary = useQuery({
    queryKey: qk.dashboard.summary(),
    queryFn: dashboardApi.summary,
    enabled: canSeeSummary,
  })

  const statistics = useQuery({
    queryKey: qk.students.statistics(),
    queryFn: dashboardApi.studentStatistics,
    enabled: canSeeLearners,
  })

  const from = monthsBefore(today, COLLECTION_MONTHS)
  const collections = useQuery({
    queryKey: qk.finance.summary({ from, to: today, granularity: 'month' }),
    queryFn: () => dashboardApi.collections(from, today),
    enabled: canSeeFinance,
  })

  const stats = statistics.data

  return (
    <PageStack>
      <PageHeader title={title} meta={<CalendarMeta />} />

      <TileRow>
        {canSeeLearners && (
          <StatTile
            label={`${t('learners')} on roll`}
            {...tileFigure({
              isError: statistics.isError,
              value: formatNumber(stats?.on_roll),
              hint: stats ? `of ${formatNumber(stats.total)} on record` : undefined,
            })}
            loading={statistics.isPending}
          />
        )}

        {/* The month is the figure and today is the footnote: a school's
            movement is monthly, and a tile showing "0" at 09:00 every morning
            trains a reader to stop looking at it. */}
        {(summary.data?.month ?? []).map((entry) => {
          const todayValue = summary.data?.today.find((row) => row.metric === entry.metric)

          return (
            <StatTile
              key={entry.metric}
              label={metricLabel(entry.metric, entry.label, t)}
              value={formatNumber(entry.value)}
              hint={todayValue ? `${formatNumber(todayValue.value)} today` : undefined}
            />
          )
        })}

        {canSeeSummary &&
          summary.isPending &&
          Array.from({ length: canSeeLearners ? 3 : 4 }, (_, index) => (
            <StatTile
              key={`metric-placeholder-${index}`}
              label={<InlineSkeleton className="h-3 w-24" />}
              value=""
              loading
            />
          ))}

        {summary.isError && (
          <div className="rounded-lg border border-gray-200 bg-white sm:col-span-2 xl:col-span-3">
            <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
          </div>
        )}
      </TileRow>

      {canSeeLearners && (
        <PanelRow>
          <Card>
            <CardHeader
              title={`${t('learners')} by standing`}
              subtitle={stats ? `${formatNumber(stats.total)} on record` : undefined}
              actions={<PanelLink route="students" label={`All ${t('learners').toLowerCase()}`} />}
            />
            <CardBody>
              <PanelState
                isPending={statistics.isPending}
                error={statistics.error}
                isEmpty={!stats || stats.total === 0}
                onRetry={() => statistics.refetch()}
                skeleton={<RowsSkeleton rows={4} />}
                empty={<CardNote>Nobody is on the roll yet.</CardNote>}
              >
                {stats && <StatusBars byStatus={stats.by_status} />}
              </PanelState>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`${t('learners')} by gender`}
              subtitle={stats ? `${formatNumber(stats.total)} on record` : undefined}
            />
            <CardBody>
              <PanelState
                isPending={statistics.isPending}
                error={statistics.error}
                isEmpty={!stats || stats.total === 0}
                onRetry={() => statistics.refetch()}
                skeleton={<RowsSkeleton rows={3} />}
                empty={<CardNote>Nobody is on the roll yet.</CardNote>}
              >
                {stats && <GenderDonut byGender={stats.by_gender} />}
              </PanelState>
            </CardBody>
          </Card>
        </PanelRow>
      )}

      {canSeeFinance && (
        <Card>
          <CardHeader
            title="Fees collected"
            subtitle={`${longPeriodLabel(from.slice(0, 7))} to ${longPeriodLabel(today.slice(0, 7))}`}
            actions={<PanelLink route="finance" label="Finance" />}
          />
          <CardBody>
            <PanelState
              isPending={collections.isPending}
              error={collections.error}
              isEmpty={(collections.data?.periods.length ?? 0) === 0}
              onRetry={() => collections.refetch()}
              skeleton={<RowsSkeleton rows={4} />}
              empty={<CardNote>The ledger holds nothing for this window.</CardNote>}
            >
              {collections.data && <Collections summary={collections.data} />}
            </PanelState>
          </CardBody>
        </Card>
      )}

      {access && <QuickLinks items={access.navigation.quick_actions} />}
    </PageStack>
  )
}

/**
 * The API labels its metrics in the platform's own vocabulary — "Learners
 * added" — while this institution calls them Students. The two ids that name a
 * domain noun are relabelled here; anything the API adds later keeps its own
 * label rather than being silently mistranslated.
 */
function metricLabel(
  metric: string,
  serverLabel: string,
  t: (key: TerminologyKey, fallback?: string) => string,
): string {
  switch (metric) {
    case 'learners_added':
      return `${t('learners')} added`
    case 'assessment_submissions':
      return `${t('assessment')} submissions`
    default:
      return serverLabel
  }
}

/**
 * Standing across the roll, drawn the way Sprig draws a distribution: a label
 * line, a thin track, and the count on the right.
 *
 * Not a plotted chart. Recharts spends a grid, an axis and a hundred and forty
 * pixels of plot area saying what four labelled tracks say in a third of the
 * height, and the seeded shape — one dominant status, three empty ones —
 * renders on an axis as three invisible bars beside an unexplained gap. A
 * track still shows an empty category as an empty track, which is the answer
 * somebody came for.
 */
function StatusBars({ byStatus }: { byStatus: Record<string, number> }) {
  const rows = Object.entries(byStatus)
  const total = rows.reduce((sum, [, value]) => sum + value, 0)

  return (
    <ul className="space-y-2.5 tabular">
      {rows.map(([key, value], index) => (
        <li key={key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-gray-900">{humanize(key)}</span>
            <span className="shrink-0 text-gray-600">{formatNumber(value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{
                width: total === 0 ? '0%' : `${(value / total) * 100}%`,
                backgroundColor: CATEGORICAL[index % CATEGORICAL.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function GenderDonut({ byGender }: { byGender: Record<string, number> }) {
  const slices = Object.entries(byGender).map(([key, value], index) => ({
    key,
    name: humanize(key),
    value,
    color: CATEGORICAL[index % CATEGORICAL.length],
  }))
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="flex items-center gap-5">
      <div className="h-[132px] w-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={49}
              outerRadius={64}
              paddingAngle={1}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(value) => formatNumber(value)} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="min-w-0 flex-1">
        <ChartLegend
          items={slices.map((slice) => ({
            key: slice.key,
            label: slice.name,
            value:
              total === 0
                ? formatNumber(slice.value)
                : `${formatPercent(slice.value / total, 0)} · ${formatNumber(slice.value)}`,
            color: slice.color,
          }))}
        />
      </div>
    </div>
  )
}

/**
 * Collection over the year.
 *
 * A flat line is a real answer here and is drawn as one. Hiding the chart when
 * every month is zero would leave a reader unable to tell "nothing collected"
 * from "this panel is broken", so the axes stay and a note says which it is.
 */
function Collections({ summary }: { summary: CollectionSummary }) {
  const currency = summary.currency
  const points = summary.periods.map((entry) => ({
    period: entry.period,
    collected: entry.collected_minor,
  }))

  const nothingCollected = points.every((point) => point.collected === 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-4 sm:grid-cols-4">
        <MiniStat label="Collected" value={formatMoney(summary.totals.collected_minor, currency)} />
        <MiniStat label="Charged" value={formatMoney(summary.totals.charged_minor, currency)} />
        <MiniStat
          label="Written off"
          value={formatMoney(summary.totals.write_offs_minor, currency)}
        />
        <MiniStat label="Payments" value={formatNumber(summary.totals.payment_count)} />
      </div>

      <ChartFrame height={200}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            {/* The axis carries the raw period so the tooltip can spell it out
                in full — "August 2026" rather than a second bare "Aug". */}
            <XAxis
              dataKey="period"
              tickFormatter={shortPeriodLabel}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              minTickGap={12}
            />
            <YAxis
              width={68}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(value: number) => compactMoney(value, currency)}
            />
            <Tooltip
              cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  formatValue={(value) => formatMoney(value, currency)}
                  formatLabel={longPeriodLabel}
                />
              }
            />
            {/* Linear, not monotone: these are discrete monthly totals, and a
                spline through them invents a curve between two figures that
                were never anything but two figures. */}
            <Area
              type="linear"
              dataKey="collected"
              name="Collected"
              stroke={CHART.primary}
              strokeWidth={1.5}
              fill={CHART.primary}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: CHART.primary }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>

      {nothingCollected && (
        <p className="text-xs text-gray-600">
          No payments were posted in this window. The line is flat because the ledger is, not
          because nothing loaded.
        </p>
      )}
    </div>
  )
}
