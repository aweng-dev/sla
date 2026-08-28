import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, CaretDown } from '@phosphor-icons/react'
import {
  Avatar,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Menu,
  Skeleton,
  StatTile,
} from '@/shared/ui'
import { CATEGORICAL, CHART } from '@/shared/theme/chartColors'
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/shared/lib/format'
import { usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys, minorUnitScale } from './finance.api'
import { Money } from './components/money'
import { InvoiceStatusPill } from './components/StatusPill'
import type { InvoiceStatus } from './finance.types'

const RANGES = [
  { key: '30d', label: 'Last 30 days', days: 30, granularity: 'day' as const },
  { key: '90d', label: 'Last 90 days', days: 90, granularity: 'day' as const },
  { key: '12m', label: 'Last 12 months', days: 365, granularity: 'month' as const },
]

function dates(days: number) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}

/** The state of the ledger, at a glance. */
export function OverviewTab() {
  const perms = usePermissions()
  const { tenant } = useTenant()
  const [rangeKey, setRangeKey] = useState('12m')

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]
  const { from, to } = useMemo(() => dates(range.days), [range.days])

  const summary = useQuery({
    queryKey: financeKeys.summary({ from, to, granularity: range.granularity }),
    queryFn: () => financeApi.summary({ from, to, granularity: range.granularity }),
  })

  /* The outstanding figures are not in the summary, so they come from the
   * invoice list itself — one page of the biggest debts, which is also what
   * the panel below shows. */
  const outstanding = useQuery({
    queryKey: financeKeys.invoices({ overview: true }),
    queryFn: () => financeApi.invoices({ outstanding: true, per_page: 100 }),
    enabled: perms.has('finance.view'),
  })

  const currency = summary.data?.currency ?? tenant.default_currency
  const totals = summary.data?.totals

  const outstandingRows = outstanding.data?.rows ?? []
  const outstandingMinor = outstandingRows.reduce((sum, r) => sum + r.balance_minor, 0)
  const overdueMinor = outstandingRows
    .filter((r) => r.due_on !== null && new Date(r.due_on) < new Date())
    .reduce((sum, r) => sum + r.balance_minor, 0)

  const byStatus = useMemo(() => {
    const counts = new Map<InvoiceStatus, number>()
    for (const row of outstandingRows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
    return [...counts.entries()]
  }, [outstandingRows])

  const collectionRate =
    totals && totals.charged_minor > 0 ? totals.collected_minor / totals.charged_minor : null

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">
          {formatDate(from)} – {formatDate(to)}
        </p>
        <Menu
          align="end"
          items={RANGES.map((r) => ({ key: r.key, label: r.label, onSelect: () => setRangeKey(r.key) }))}
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Collected"
          value={summary.isError ? '—' : formatMoney(totals?.collected_minor, currency)}
          hint={totals ? `${formatNumber(totals.payment_count)} payments` : undefined}
          loading={summary.isLoading}
        />
        <StatTile
          label="Charged"
          value={formatMoney(totals?.charged_minor, currency)}
          hint={collectionRate === null ? undefined : `${formatPercent(collectionRate, 1)} collected`}
          loading={summary.isLoading}
        />
        <StatTile
          label="Outstanding"
          value={outstanding.isError ? '—' : formatMoney(outstandingMinor, currency)}
          hint={
            outstanding.isError
              ? 'Could not be loaded'
              : `${formatNumber(outstandingRows.length)} unpaid invoices`
          }
          loading={outstanding.isLoading}
        />
        <StatTile
          label="Overdue"
          value={outstanding.isError ? '—' : formatMoney(overdueMinor, currency)}
          hint="Past a due date"
          deltaDirection={overdueMinor > 0 ? 'down' : 'flat'}
          loading={outstanding.isLoading}
        />
      </div>

      <Card>
        <CardHeader
          title="Collections over time"
          subtitle={`Charged against collected · ${range.label.toLowerCase()}`}
        />
        <CardBody>
          {summary.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (summary.data?.periods.length ?? 0) === 0 ? (
            <EmptyState title="Nothing charged in this range" />
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={summary.data?.periods} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="collectFill" x1="0" y1="0" x2="0" y2="1">
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
                  width={58}
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
                  formatter={(value, name) => [
                    formatMoney(toNumber(value), currency),
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
                  fill="url(#collectFill)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Unpaid invoices by state" />
          <CardBody>
            {outstanding.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : byStatus.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="Every invoice is settled." />
            ) : (
              <div className="flex items-center gap-5">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={byStatus.map(([status, count]) => ({ name: status, value: count }))}
                      dataKey="value"
                      innerRadius={44}
                      outerRadius={66}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {byStatus.map(([status], i) => (
                        <Cell key={status} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <ul className="min-w-0 flex-1 space-y-2">
                  {byStatus.map(([status, count], i) => (
                    <li key={status} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: CATEGORICAL[i % CATEGORICAL.length] }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <InvoiceStatusPill status={status} />
                      </span>
                      <span className="tabular text-gray-900">{formatNumber(count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Largest balances"
            subtitle={`Who owes the most`}
            actions={
              <Link
                to="/finance"
                className="inline-flex items-center gap-1 text-xs text-accent-500 hover:underline"
              >
                All invoices <ArrowRight size={11} weight="bold" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {outstanding.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : outstandingRows.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              <ul className="divide-y divide-gray-200">
                {[...outstandingRows]
                  .sort((a, b) => b.balance_minor - a.balance_minor)
                  .slice(0, 6)
                  .map((invoice) => (
                    <li key={invoice.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Avatar name={invoice.student.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/finance/invoices/$invoiceId"
                          params={{ invoiceId: invoice.id }}
                          className="block truncate text-sm text-gray-900 hover:text-accent-500"
                        >
                          {invoice.student.name}
                        </Link>
                        <p className="truncate text-2xs tabular text-gray-600">
                          {invoice.invoice_number}
                        </p>
                      </div>
                      <Money minor={invoice.balance_minor} currency={invoice.currency} emphasis />
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (Array.isArray(value)) return toNumber(value[0])
  return 0
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']

function shortLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split('-')
    return `${Number(d)} ${MONTHS[Number(m) - 1]}`
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-')
    return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
  }
  return value
}

/** Axis ticks in minor units would read as nine-digit numbers. */
function compact(minor: number, currency: string): string {
  const major = minor / minorUnitScale(currency)
  if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`
  if (Math.abs(major) >= 1_000) return `${Math.round(major / 1_000)}K`
  return formatMoney(minor, currency)
}
