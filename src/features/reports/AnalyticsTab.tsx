import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CaretDown } from '@phosphor-icons/react'
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Menu, Skeleton, StatTile } from '@/shared/ui'
import { CHART, CATEGORICAL } from '@/shared/theme/chartColors'
import { formatDate, formatMoney, formatNumber, formatPercent, humanize } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { reportKeys, reportsApi } from './reports.api'
import type { MetricGranularity } from './reports.types'

/**
 * Everything the API can currently say about this institution, on one screen.
 *
 * Four sources, deliberately kept apart because they answer different
 * questions and fail independently — a finance permission a reader lacks must
 * not blank the roll figures beside it:
 *
 *   /admin/dashboard/summary          today vs this month, per metric
 *   /admin/dashboard/metrics/{metric} one metric over a range, as a series
 *   /admin/students/statistics        the roll, by standing and by gender
 *   /admin/finance/summary            charged vs collected over time
 *
 * ── The scope this screen needs ────────────────────────────────────────────
 *
 * The metric series endpoint refuses anybody who is not institution-wide —
 * "Institution-wide dashboard metrics require institution-wide access" — which
 * is a different axis from the `reports.view` permission. A head of year holds
 * the permission and is still refused, correctly, because the series would
 * aggregate learners outside their scope. That case is answered here rather
 * than left to render as a broken card.
 */

/**
 * ── The two endpoints do not share a vocabulary ────────────────────────────
 *
 * `/admin/dashboard/metrics/{metric}` takes `daily | weekly | monthly`.
 * `/admin/finance/summary` takes `day | month` — no weekly bucket at all, and
 * it 422s on the long forms. Verified against the running API rather than
 * assumed, because the failure is a validation error on one card while the
 * rest of the screen renders, which is easy to miss.
 *
 * So each range carries both spellings, and the 90-day range falls back to
 * daily buckets for money since there is no weekly one to ask for.
 */
const RANGES = [
  { key: '30d', label: 'Last 30 days', days: 30, granularity: 'daily' as const, finance: 'day' },
  { key: '90d', label: 'Last 90 days', days: 90, granularity: 'weekly' as const, finance: 'day' },
  { key: '12m', label: 'Last 12 months', days: 365, granularity: 'monthly' as const, finance: 'month' },
] as const

type RangeKey = (typeof RANGES)[number]['key']

function rangeDates(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}

export function AnalyticsTab() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access, tenant } = useTenant()
  const [rangeKey, setRangeKey] = useState<RangeKey>('12m')

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]
  const { from, to } = useMemo(() => rangeDates(range.days), [range.days])

  const isTenantWide = access?.scopes.is_tenant_wide === true

  const summary = useQuery({
    queryKey: reportKeys.analytics.summary(),
    queryFn: reportsApi.summary,
    enabled: perms.has('dashboard.view'),
  })

  const students = useQuery({
    queryKey: reportKeys.analytics.students(),
    queryFn: reportsApi.studentStatistics,
    enabled: perms.has('students.view'),
  })

  const finance = useQuery({
    queryKey: reportKeys.analytics.finance({ from, to, granularity: range.finance }),
    queryFn: () => reportsApi.financeSummary({ from, to, granularity: range.finance }),
    enabled: perms.has('finance.view'),
  })

  const metrics = summary.data?.metrics ?? []
  const [metricId, setMetricId] = useState<string | null>(null)
  const activeMetric = metricId ?? metrics[0]?.id ?? null

  const series = useQuery({
    queryKey: reportKeys.analytics.series(activeMetric ?? '', { from, to, granularity: range.granularity }),
    queryFn: () =>
      reportsApi.series(activeMetric as string, {
        from,
        to,
        granularity: range.granularity as MetricGranularity,
      }),
    enabled: Boolean(activeMetric) && isTenantWide,
  })

  const monthByMetric = new Map((summary.data?.month ?? []).map((m) => [m.metric, m]))
  const todayByMetric = new Map((summary.data?.today ?? []).map((m) => [m.metric, m]))

  return (
    <div className="flex flex-col gap-5">
      {/* ── Range ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">
          {formatDate(from)} – {formatDate(to)} · {humanize(range.granularity)}
        </p>
        <Menu
          align="end"
          items={RANGES.map((r) => ({
            key: r.key,
            label: r.label,
            onSelect: () => setRangeKey(r.key),
          }))}
          trigger={({ toggle, ref, open }) => (
            <button
              ref={ref as never}
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="menu"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-800 transition-colors hover:bg-gray-50"
            >
              {range.label}
              <CaretDown size={11} weight="bold" className="text-gray-600" />
            </button>
          )}
        />
      </div>

      {/* ── Figures ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`${t('learners')} on roll`}
          value={students.isError ? '—' : formatNumber(students.data?.on_roll)}
          hint={
            students.isError
              ? 'Could not be loaded'
              : students.data
                ? `of ${formatNumber(students.data.total)} on record`
                : undefined
          }
          loading={students.isLoading}
        />

        {metrics.map((metric) => {
          const month = monthByMetric.get(metric.id)
          const today = todayByMetric.get(metric.id)
          return (
            <StatTile
              key={metric.id}
              label={metricLabel(metric.label, t)}
              value={summary.isError ? '—' : formatNumber(month?.value)}
              hint={
                summary.isError
                  ? 'Could not be loaded'
                  : today
                    ? `${formatNumber(today.value)} today`
                    : undefined
              }
              loading={summary.isLoading}
            />
          )
        })}
      </div>

      {/* ── The series ────────────────────────────────────────────────── */}
      {activeMetric && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {metricLabel(series.data?.metric.label ?? metrics.find((m) => m.id === activeMetric)?.label ?? '', t)}
                {metrics.length > 1 && (
                  <Menu
                    align="start"
                    items={metrics.map((m) => ({
                      key: m.id,
                      label: metricLabel(m.label, t),
                      onSelect: () => setMetricId(m.id),
                    }))}
                    trigger={({ toggle, ref }) => (
                      <button
                        ref={ref as never}
                        type="button"
                        onClick={toggle}
                        aria-label="Choose a metric"
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                      >
                        <CaretDown size={12} weight="bold" />
                      </button>
                    )}
                  />
                )}
              </span>
            }
            subtitle={`${humanize(range.granularity)} · ${formatDate(from)} to ${formatDate(to)}`}
          />
          <CardBody>
            {!isTenantWide ? (
              <EmptyState
                title="Institution-wide access is required"
                description="These figures aggregate every learner in the institution, so the API only serves them to a reader whose scope covers all of them."
              />
            ) : series.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : series.isError ? (
              <ErrorState error={series.error} onRetry={() => series.refetch()} />
            ) : (
              <MetricChart points={series.data?.points ?? []} />
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Roll composition ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${t('learners')} by standing`} subtitle={
            students.data ? `${formatNumber(students.data.total)} on record` : undefined
          } />
          <CardBody>
            {students.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : students.isError ? (
              <ErrorState error={students.error} onRetry={() => students.refetch()} />
            ) : (
              <Breakdown data={students.data?.by_status ?? {}} total={students.data?.total ?? 0} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`${t('learners')} by gender`} />
          <CardBody>
            {students.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : students.isError ? (
              <ErrorState error={students.error} onRetry={() => students.refetch()} />
            ) : (
              <Donut data={students.data?.by_gender ?? {}} />
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Money ─────────────────────────────────────────────────────── */}
      {perms.has('finance.view') && (
        <Card>
          <CardHeader
            title="Fees charged and collected"
            subtitle={`${formatDate(from)} to ${formatDate(to)}`}
          />
          <CardBody>
            {finance.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : finance.isError ? (
              <ErrorState error={finance.error} onRetry={() => finance.refetch()} />
            ) : (
              <FinancePanel
                data={finance.data}
                currency={finance.data?.currency ?? tenant.default_currency}
              />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/** The API labels metrics in platform vocabulary ("Learners added") while a
 *  school says "Students". Only the noun is swapped; anything else passes
 *  through untouched. */
function metricLabel(label: string, t: (k: 'learners' | 'learner') => string): string {
  return label.replace(/\bLearners\b/g, t('learners')).replace(/\bLearner\b/g, t('learner'))
}

function MetricChart({ points }: { points: { label: string; value: number }[] }) {
  const allZero = points.every((p) => p.value === 0)

  if (points.length === 0) {
    return <EmptyState title="No data in this range" description="Try a longer range." />
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.18} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.axis, fontSize: 11 }}
            minTickGap={24}
            tickFormatter={(v: string) => shortLabel(v)}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: CHART.axis, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: CHART.grid }}
            contentStyle={{
              background: CHART.tooltipBg,
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              color: CHART.tooltipInk,
            }}
            labelStyle={{ color: CHART.tooltipInk }}
            formatter={(value) => [formatNumber(toNumber(value)), '']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART.primary}
            strokeWidth={1.5}
            fill="url(#metricFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {allZero && (
        <p className="mt-2 text-xs text-gray-600">
          Nothing was recorded in this range. The axis is drawn so the shape of a
          later period is comparable.
        </p>
      )}
    </>
  )
}

/** `2026-08-01` → `1 Aug`; a weekly or monthly bucket label passes through. */
function shortLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']
    return `${Number(d)} ${months[Number(m) - 1]}`
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']
    return `${months[Number(m) - 1]} ${y.slice(2)}`
  }
  return value
}

function Breakdown({ data, total }: { data: Record<string, number>; total: number }) {
  const rows = Object.entries(data)
  if (rows.length === 0) return <EmptyState title="Nothing on the roll yet" />

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 40)}>
      <BarChart
        data={rows.map(([key, value]) => ({ name: humanize(key), value }))}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={92}
          tickLine={false}
          axisLine={false}
          tick={{ fill: CHART.axis, fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.4 }}
          contentStyle={{
            background: CHART.tooltipBg,
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            color: CHART.tooltipInk,
          }}
          formatter={(value) => {
            const v = toNumber(value)
            return [
              `${formatNumber(v)}${total > 0 ? ` · ${formatPercent(v / total, 0)}` : ''}`,
              '',
            ]
          }}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false} barSize={14}>
          {rows.map(([key], i) => (
            <Cell key={key} fill={CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Donut({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).filter(([, v]) => v > 0)
  const total = rows.reduce((sum, [, v]) => sum + v, 0)
  if (rows.length === 0) return <EmptyState title="Not recorded" />

  return (
    <div className="flex items-center gap-5">
      <ResponsiveContainer width={150} height={150}>
        <PieChart>
          <Pie
            data={rows.map(([name, value]) => ({ name: humanize(name), value }))}
            dataKey="value"
            innerRadius={46}
            outerRadius={70}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {rows.map(([key], i) => (
              <Cell key={key} fill={CATEGORICAL[i % CATEGORICAL.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {rows.map(([key, value], i) => (
          <li key={key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CATEGORICAL[i % CATEGORICAL.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-gray-700">{humanize(key)}</span>
            <span className="tabular text-gray-900">{formatNumber(value)}</span>
            <span className="w-12 text-right tabular text-xs text-gray-600">
              {total > 0 ? formatPercent(value / total, 0) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FinancePanel({
  data,
  currency,
}: {
  data: import('./reports.types').FinanceSummary | undefined
  currency: string
}) {
  if (!data) return <EmptyState title="No finance data" />

  const totals = data.totals
  const collectionRate =
    totals.charged_minor > 0 ? totals.collected_minor / totals.charged_minor : null

  return (
    <>
      <div className="mb-4 grid gap-4 border-b border-gray-200 pb-4 sm:grid-cols-4">
        <Figure label="Collected" value={formatMoney(totals.collected_minor, currency)} />
        <Figure label="Charged" value={formatMoney(totals.charged_minor, currency)} />
        <Figure
          label="Collection rate"
          value={collectionRate === null ? '—' : formatPercent(collectionRate, 1)}
        />
        <Figure label="Payments" value={formatNumber(totals.payment_count)} />
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data.periods} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.18} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickFormatter={shortLabel}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickFormatter={(v: number) => compact(v, currency)}
          />
          <Tooltip
            cursor={{ stroke: CHART.grid }}
            contentStyle={{
              background: CHART.tooltipBg,
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              color: CHART.tooltipInk,
            }}
            labelStyle={{ color: CHART.tooltipInk }}
            /* Recharts types the value as `ValueType | undefined`, so the
             * formatter has to accept that rather than assume a number — the
             * tooltip fires for a gap in the series too. */
            formatter={(value, name) => [
              formatMoney(typeof value === 'number' ? value : 0, currency),
              name === 'collected_minor' ? 'Collected' : 'Charged',
            ]}
          />
          <Area
            type="monotone"
            dataKey="charged_minor"
            stroke={CHART.neutral}
            strokeWidth={1.5}
            fill="none"
            isAnimationActive={false}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="collected_minor"
            stroke={CHART.primary}
            strokeWidth={1.5}
            fill="url(#collectedFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular text-gray-900">{value}</p>
    </div>
  )
}

/**
 * Recharts hands a tooltip its value as `number | string | (number|string)[]`,
 * because a stacked series can put an array there. Every series on this screen
 * is scalar, so anything else is coerced rather than special-cased.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (Array.isArray(value)) return toNumber(value[0])
  return 0
}

/** Axis ticks in minor units would read as nine-digit numbers. */
function compact(minor: number, currency: string): string {
  const major = minor / 100
  if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`
  if (Math.abs(major) >= 1_000) return `${Math.round(major / 1_000)}K`
  return formatMoney(minor, currency)
}
