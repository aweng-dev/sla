import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bus, IdentificationCard, MapPin, Path, Seat, Warning } from '@phosphor-icons/react'
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
  ReasonDialog,
  Segmented,
  Select,
  StatusBadge,
  Tabs,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, formatNumber, humanize } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { ModuleGate } from './components/ModuleGate'
import {
  transportApi,
  transportKeys,
  type TransportDriver,
  type TransportRoute,
  type TransportSubscription,
  type TransportTrip,
  type TransportVehicle,
  type TripStatus,
} from './transport.api'

/**
 * Routes, the buses and people who run them, and who rides.
 *
 * ── An expired licence is the API's answer, not a date comparison ──────────
 *
 * `licence_has_expired` comes down with the driver. A screen that compared
 * `licence_expires_on` to `Date.now()` would disagree with the server across a
 * timezone, and this is the one field where a disagreement puts an unlicensed
 * driver on the road with the product saying it is fine.
 *
 * ── Routes open with their stops ───────────────────────────────────────────
 *
 * A route without its stops is a name. The stop list is what somebody checks
 * against a parent's question, so selecting a route loads its stops in order
 * rather than hiding them behind another click.
 */

const TABS_ID = 'transport-tabs'

type TabKey = 'routes' | 'riders' | 'trips' | 'vehicles' | 'drivers'

export function TransportPage() {
  const [tab, setTab] = useState<TabKey>('routes')

  const tabs: TabItem[] = [
    { key: 'routes', label: 'Routes' },
    { key: 'riders', label: 'Riders' },
    { key: 'trips', label: 'Trips' },
    { key: 'vehicles', label: 'Vehicles' },
    { key: 'drivers', label: 'Drivers' },
  ]

  return (
    <ModuleGate
      module="transport"
      title="Transport"
      offTitle="This institution does not run transport"
      offDescription="The transport module is switched off here. An administrator can enable it from the institution's modules."
    >
      <div>
        <Tabs items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} baseId={TABS_ID} />

        <Panel id="routes" tab={tab}>
          <RoutesTab />
        </Panel>
        <Panel id="riders" tab={tab}>
          <RidersTab />
        </Panel>
        <Panel id="trips" tab={tab}>
          <TripsTab />
        </Panel>
        <Panel id="vehicles" tab={tab}>
          <VehiclesTab />
        </Panel>
        <Panel id="drivers" tab={tab}>
          <DriversTab />
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
      className="pt-4"
    >
      {children}
    </div>
  )
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

function RoutesTab() {
  const [selected, setSelected] = useState<string | null>(null)

  const routes = useQuery({
    queryKey: transportKeys.routes({}),
    queryFn: () => transportApi.routes({}),
  })

  const stops = useQuery({
    queryKey: transportKeys.stops(selected ?? 'none'),
    queryFn: () => transportApi.stops(selected!),
    enabled: selected !== null,
  })

  const rows = routes.data?.rows ?? []
  const openRoute = rows.find((row) => row.id === selected) ?? null

  const columns: Column<TransportRoute>[] = [
    {
      key: 'route',
      header: 'Route',
      cell: (row) => <CellStack primary={row.name} secondary={row.code ?? undefined} />,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      cell: (row) => row.vehicle?.registration_number ?? '—',
    },
    { key: 'driver', header: 'Driver', cell: (row) => row.driver?.display_name ?? '—' },
    {
      key: 'fare',
      header: 'Fare',
      numeric: true,
      cell: (row) =>
        row.fare_minor === null ? '—' : formatMoney(row.fare_minor, row.currency ?? 'NGN'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {!row.accepts_subscriptions && <Badge tone="neutral">Closed to riders</Badge>}
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card>
        {routes.isError ? (
          <ErrorState error={routes.error} onRetry={() => routes.refetch()} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={routes.isLoading}
            onRowClick={(row) => setSelected(row.id)}
            empty={
              <EmptyState
                icon={<Path size={20} />}
                title="No routes"
                description="A route is a named run with an ordered list of stops, a vehicle and a driver."
              />
            }
          />
        )}
      </Card>

      <Card className="h-fit">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {openRoute ? openRoute.name : 'Stops'}
          </h3>
          <p className="mt-0.5 text-2xs text-gray-600">
            {openRoute ? 'In the order they are called at' : 'Pick a route to see its stops'}
          </p>
        </div>

        {selected === null ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">Nothing selected.</p>
        ) : stops.isError ? (
          <ErrorState error={stops.error} onRetry={() => stops.refetch()} />
        ) : stops.isLoading ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">Loading…</p>
        ) : (stops.data ?? []).length === 0 ? (
          <EmptyState
            icon={<MapPin size={20} />}
            title="No stops yet"
            description="A route with no stops accepts no riders."
          />
        ) : (
          <ol className="px-2 py-2">
            {(stops.data ?? [])
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map((stop) => (
                <li key={stop.id} className="flex items-baseline gap-2.5 rounded-md px-2 py-1.5">
                  <span className="w-5 shrink-0 text-right text-2xs text-gray-500 tabular">
                    {stop.sequence}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{stop.name}</span>
                  <span className="shrink-0 text-2xs text-gray-500 tabular">
                    {stop.scheduled_arrival ?? '—'}
                  </span>
                </li>
              ))}
          </ol>
        )}
      </Card>
    </div>
  )
}

/* ── Riders ──────────────────────────────────────────────────────────────── */

function RidersTab() {
  const t = useTerminology()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const canManage = permissions.hasAny('transport.manage', 'transport.assign')

  const [scope, setScope] = useState<'live' | 'all'>('live')
  const [routeId, setRouteId] = useState('')
  const [page, setPage] = useState(1)
  const [ending, setEnding] = useState<TransportSubscription | null>(null)

  const routes = useQuery({
    queryKey: transportKeys.routes({}),
    queryFn: () => transportApi.routes({}),
  })

  const params = useMemo(
    () => ({ live: scope === 'live', transport_route_id: routeId, page }),
    [scope, routeId, page],
  )

  const subscriptions = useQuery({
    queryKey: transportKeys.subscriptions(params),
    queryFn: () => transportApi.subscriptions(params),
    placeholderData: (previous) => previous,
  })

  const end = useMutation({
    mutationFn: ({ id }: { id: string; reason: string }) =>
      transportApi.endSubscription(id, { ends_on: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportKeys.root })
      setEnding(null)
      toast.success('Ended. They no longer ride this route.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be ended.')
    },
  })

  const columns: Column<TransportSubscription>[] = [
    {
      key: 'student',
      header: t('learner'),
      cell: (row) => <CellStack primary={row.student?.name ?? '—'} />,
    },
    {
      key: 'route',
      header: 'Route',
      cell: (row) => (
        <CellStack
          primary={row.route?.name ?? '—'}
          secondary={[row.pickup_stop?.name, row.dropoff_stop?.name].filter(Boolean).join(' → ')}
        />
      ),
    },
    {
      key: 'fare',
      header: 'Fare',
      numeric: true,
      cell: (row) =>
        row.fare_minor === null ? '—' : formatMoney(row.fare_minor, row.currency ?? 'NGN'),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'dates',
      header: 'Riding',
      cell: (row) => (
        <span className="text-sm text-gray-900">
          {row.starts_on ? formatDate(row.starts_on) : '—'}
          {row.ends_on && ` → ${formatDate(row.ends_on)}`}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '7rem',
            cell: (row: TransportSubscription) =>
              row.is_live ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEnding(row)}>
                    End
                  </Button>
                </div>
              ) : null,
          } satisfies Column<TransportSubscription>,
        ]
      : []),
  ]

  return (
    <>
      <Card>
        <Toolbar
          className="px-3"
          filters={
            <>
              <Segmented
                label="Which riders to show"
                value={scope}
                onChange={(value) => {
                  setScope(value as 'live' | 'all')
                  setPage(1)
                }}
                options={[
                  { value: 'live', label: 'Riding now' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <div className="w-52">
                <Select
                  aria-label="Filter by route"
                  value={routeId}
                  onChange={(event) => {
                    setRouteId(event.currentTarget.value)
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: 'All routes' },
                    ...(routes.data?.rows ?? []).map((route) => ({
                      value: route.id,
                      label: route.name,
                    })),
                  ]}
                />
              </div>
            </>
          }
        />

        {subscriptions.isError ? (
          <ErrorState error={subscriptions.error} onRetry={() => subscriptions.refetch()} />
        ) : (
          <>
            <DataTable
              rows={subscriptions.data?.rows ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={subscriptions.isLoading}
              empty={
                <EmptyState
                  icon={<Seat size={20} />}
                  title={scope === 'live' ? 'Nobody is riding' : 'No riders'}
                  description={`A rider record says which ${t('learner').toLowerCase()} takes which route, from which stop, for what fare.`}
                />
              }
            />
            {subscriptions.data && subscriptions.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={subscriptions.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ReasonDialog
        open={ending !== null}
        title="End this rider's subscription"
        description="It closes today. The record stays, with its fare and its invoice, because that history is what a fee query is answered from."
        label="Note"
        confirmLabel="End subscription"
        pending={end.isPending}
        onClose={() => setEnding(null)}
        onConfirm={(reason) => ending && end.mutate({ id: ending.id, reason })}
      />
    </>
  )
}

/* ── Trips ───────────────────────────────────────────────────────────────── */

function TripsTab() {
  const permissions = usePermissions()
  const queryClient = useQueryClient()
  const canManage = permissions.hasAny('transport.manage', 'transport.operate')

  const [status, setStatus] = useState<TripStatus | ''>('')
  const [page, setPage] = useState(1)
  const [cancelling, setCancelling] = useState<TransportTrip | null>(null)

  const params = useMemo(() => ({ status, page }), [status, page])

  const trips = useQuery({
    queryKey: transportKeys.trips(params),
    queryFn: () => transportApi.trips(params),
    placeholderData: (previous) => previous,
  })

  const complete = useMutation({
    mutationFn: (id: string) => transportApi.completeTrip(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportKeys.root })
      toast.success('Trip completed.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be completed.')
    },
  })

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transportApi.cancelTrip(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transportKeys.root })
      setCancelling(null)
      toast.success('Trip cancelled.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be cancelled.')
    },
  })

  const columns: Column<TransportTrip>[] = [
    {
      key: 'ran',
      header: 'Ran on',
      cell: (row) => (
        <CellStack
          primary={row.ran_on ? formatDate(row.ran_on) : '—'}
          secondary={humanize(row.direction)}
        />
      ),
    },
    {
      key: 'riders',
      header: 'Riders',
      numeric: true,
      cell: (row) => (row.riders === undefined ? '—' : formatNumber(row.riders.length)),
    },
    {
      key: 'distance',
      header: 'Distance',
      numeric: true,
      cell: (row) => (row.distance === null ? '—' : formatNumber(row.distance)),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '12rem',
            cell: (row: TransportTrip) =>
              row.status === 'scheduled' || row.status === 'in_progress' ? (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={complete.isPending && complete.variables === row.id}
                    onClick={() => complete.mutate(row.id)}
                  >
                    Complete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(row)}>
                    Cancel
                  </Button>
                </div>
              ) : null,
          } satisfies Column<TransportTrip>,
        ]
      : []),
  ]

  return (
    <>
      <Card>
        <Toolbar
          className="px-3"
          filters={
            <div className="w-44">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => {
                  setStatus(event.currentTarget.value as TripStatus | '')
                  setPage(1)
                }}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
          }
        />

        {trips.isError ? (
          <ErrorState error={trips.error} onRetry={() => trips.refetch()} />
        ) : (
          <>
            <DataTable
              rows={trips.data?.rows ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={trips.isLoading}
              empty={
                <EmptyState
                  icon={<Bus size={20} />}
                  title="No trips"
                  description="A trip is one run of one route on one day, with the riders who were checked onto it."
                />
              }
            />
            {trips.data && trips.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={trips.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ReasonDialog
        open={cancelling !== null}
        title="Cancel this trip"
        description="The riders on it are not marked as carried. The reason is kept on the trip."
        confirmLabel="Cancel trip"
        destructive
        pending={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
      />
    </>
  )
}

/* ── Vehicles ────────────────────────────────────────────────────────────── */

function VehiclesTab() {
  const [page, setPage] = useState(1)
  const params = useMemo(() => ({ page }), [page])

  const vehicles = useQuery({
    queryKey: transportKeys.vehicles(params),
    queryFn: () => transportApi.vehicles(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<TransportVehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      cell: (row) => (
        <CellStack
          primary={row.registration_number}
          secondary={[row.make, row.model].filter(Boolean).join(' ')}
        />
      ),
    },
    {
      key: 'seats',
      header: 'Seats',
      numeric: true,
      cell: (row) => (row.seat_capacity === null ? '—' : formatNumber(row.seat_capacity)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {!row.can_carry && <Badge tone="warning">Not roadworthy</Badge>}
        </div>
      ),
    },
    {
      key: 'acquired',
      header: 'Acquired',
      cell: (row) => (row.acquired_on ? formatDate(row.acquired_on) : '—'),
    },
  ]

  return (
    <Card>
      {vehicles.isError ? (
        <ErrorState error={vehicles.error} onRetry={() => vehicles.refetch()} />
      ) : (
        <>
          <DataTable
            rows={vehicles.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={vehicles.isLoading}
            empty={
              <EmptyState
                icon={<Bus size={20} />}
                title="No vehicles"
                description="Vehicles are registered here before they can be put on a route."
              />
            }
          />
          {vehicles.data && vehicles.data.pagination.total > 0 && (
            <Pagination
              className="px-4"
              pagination={vehicles.data.pagination}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Card>
  )
}

/* ── Drivers ─────────────────────────────────────────────────────────────── */

function DriversTab() {
  const [page, setPage] = useState(1)
  const params = useMemo(() => ({ page }), [page])

  const drivers = useQuery({
    queryKey: transportKeys.drivers(params),
    queryFn: () => transportApi.drivers(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<TransportDriver>[] = [
    {
      key: 'driver',
      header: 'Driver',
      cell: (row) => <CellStack primary={row.display_name} secondary={row.phone ?? undefined} />,
    },
    {
      key: 'licence',
      header: 'Licence',
      cell: (row) => (
        <CellStack
          primary={row.licence_number ?? '—'}
          secondary={row.licence_expires_on ? `Expires ${formatDate(row.licence_expires_on)}` : undefined}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {/* The API's own flag. Never a date this screen compares itself. */}
          {row.licence_has_expired && (
            <span className="inline-flex items-center gap-1 text-2xs text-danger-600">
              <Warning size={12} weight="fill" />
              Licence expired
            </span>
          )}
        </div>
      ),
    },
  ]

  return (
    <Card>
      {drivers.isError ? (
        <ErrorState error={drivers.error} onRetry={() => drivers.refetch()} />
      ) : (
        <>
          <DataTable
            rows={drivers.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={drivers.isLoading}
            empty={
              <EmptyState
                icon={<IdentificationCard size={20} />}
                title="No drivers"
                description="A driver record carries the licence and its expiry, which is what stops an expired one being put on a route."
              />
            }
          />
          {drivers.data && drivers.data.pagination.total > 0 && (
            <Pagination
              className="px-4"
              pagination={drivers.data.pagination}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Card>
  )
}
