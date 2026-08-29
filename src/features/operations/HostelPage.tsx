import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bed, DoorOpen, SignIn, SignOut, Buildings, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
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
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber, formatPercent } from '@/shared/lib/format'
import { usePermissions, useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { MyHostel } from '@/features/portal/components/MyHostel'
import {
  hostelApi,
  hostelKeys,
  type AllocationStatus,
  type Hostel,
  type HostelAllocation,
  type HostelRoom,
} from './hostel.api'

/**
 * Beds, and who is in them.
 *
 * ── Occupancy is the headline because it is the question ───────────────────
 *
 * A warden's screen answers one thing before anything else: how many beds are
 * free tonight. The API has an endpoint for exactly that, so the figure comes
 * from the server rather than from counting rows in the browser — a browser
 * count would need every bed of every room and would still disagree the moment
 * one went out of service between two pages.
 *
 * `beds_free` is not `total − occupied`. Beds out of service are neither, and
 * the tiles show all three so nobody has to work out why the numbers do not add
 * up the obvious way.
 *
 * ── Check-in and check-out are stamps, not statuses ────────────────────────
 *
 * Somebody arrives at a time. The endpoints take `at`, and this screen sends
 * nothing — letting the server stamp it — because a browser clock is the one
 * clock in the system nobody controls.
 */

const TABS_ID = 'hostel-tabs'

type TabKey = 'occupancy' | 'allocations'

export function HostelPage() {
  const viewer = useViewer()

  /*
   * `hostel` lists `student_self` among its access profiles, so the rail
   * draws this for a learner — correctly. The staff screen below speaks
   * `/admin/…`, which carries the `staff` middleware and answers 403 to
   * them, so the reader decides which of the API's two surfaces is shown.
   */
  const learner = viewer.surface === 'learner'

  const [tab, setTab] = useState<TabKey>('occupancy')

  const tabs: TabItem[] = [
    { key: 'occupancy', label: 'Occupancy' },
    { key: 'allocations', label: 'Residents' },
  ]

  return (
    <ModuleGate
      module="hostel"
      title="Hostel"
      offTitle="This institution does not run accommodation"
      offDescription="The hostel module is switched off here. An administrator can enable it from the institution's modules."
      tabs={
        <Tabs bare items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} baseId={TABS_ID} />
      }
    >
      {learner ? (
        <MyHostel />
      ) : (
        <>
      <div>
        {tab === 'occupancy' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'occupancy')}
            aria-labelledby={`${TABS_ID}-tab-occupancy`}
          >
            <OccupancyTab />
          </div>
        )}

        {tab === 'allocations' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'allocations')}
            aria-labelledby={`${TABS_ID}-tab-allocations`}
          >
            <AllocationsTab />
          </div>
        )}
      </div>
        </>
      )}
    </ModuleGate>
  )
}

/* ── Occupancy ───────────────────────────────────────────────────────────── */

function OccupancyTab() {
  const [hostelId, setHostelId] = useState('')

  const hostels = useQuery({
    queryKey: hostelKeys.hostels({}),
    queryFn: () => hostelApi.hostels({}),
  })

  const occupancy = useQuery({
    queryKey: hostelKeys.occupancy(hostelId || undefined),
    queryFn: () => hostelApi.occupancy(hostelId || undefined),
  })

  const roomParams = useMemo(() => ({ hostel_id: hostelId }), [hostelId])

  const rooms = useQuery({
    queryKey: hostelKeys.rooms(roomParams),
    queryFn: () => hostelApi.rooms(roomParams),
    placeholderData: (previous) => previous,
  })

  const figures = occupancy.data

  const columns: Column<HostelRoom>[] = [
    {
      key: 'room',
      header: 'Room',
      cell: (row) => <CellStack primary={row.name} secondary={row.floor ?? undefined} />,
    },
    { key: 'capacity', header: 'Capacity', numeric: true, cell: (row) => formatNumber(row.capacity) },
    {
      key: 'beds',
      header: 'Beds',
      numeric: true,
      cell: (row) => (row.bed_count === undefined ? '—' : formatNumber(row.bed_count)),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'allocatable',
      header: '',
      cell: (row) =>
        row.is_allocatable ? null : (
          <span className="inline-flex items-center gap-1.5 text-2xs text-gray-500">
            <Warning size={12} />
            Not allocatable
          </span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {hostels.data && hostels.data.rows.length > 1 && (
        <div className="w-64">
          <Select
            aria-label="Which residence"
            value={hostelId}
            onChange={(event) => setHostelId(event.currentTarget.value)}
            options={[
              { value: '', label: 'All residences' },
              ...hostels.data.rows.map((hostel: Hostel) => ({
                value: hostel.id,
                label: hostel.name,
              })),
            ]}
          />
        </div>
      )}

      {occupancy.isError ? (
        <Card>
          <ErrorState error={occupancy.error} onRetry={() => occupancy.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Free tonight"
            value={formatNumber(figures?.beds_free ?? 0)}
            hint={
              figures?.is_full
                ? 'Full'
                : `of ${formatNumber(figures?.beds_serviceable ?? 0)} serviceable`
            }
            icon={<Bed size={16} />}
            loading={occupancy.isLoading}
          />
          <StatTile
            label="Occupied"
            value={formatNumber(figures?.beds_occupied ?? 0)}
            icon={<DoorOpen size={16} />}
            loading={occupancy.isLoading}
          />
          <StatTile
            label="Out of service"
            value={formatNumber(figures?.beds_out_of_service ?? 0)}
            hint={
              (figures?.beds_out_of_service ?? 0) > 0
                ? 'Counted in the total, not in what is free'
                : undefined
            }
            icon={<Warning size={16} />}
            loading={occupancy.isLoading}
          />
          <StatTile
            label="Occupancy"
            value={formatPercent((figures?.occupancy_percent ?? 0) / 100)}
            hint={`${formatNumber(figures?.beds_total ?? 0)} beds in total`}
            icon={<Buildings size={16} />}
            loading={occupancy.isLoading}
          />
        </div>
      )}

      <Card>
        {rooms.isError ? (
          <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />
        ) : (
          <DataTable
            rows={rooms.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={rooms.isLoading}
            empty={
              <EmptyState
                icon={<DoorOpen size={20} />}
                title="No rooms"
                description="Rooms and their beds are set up per residence before anybody can be allocated one."
              />
            }
          />
        )}
      </Card>
    </div>
  )
}

/* ── Residents ───────────────────────────────────────────────────────────── */

function AllocationsTab() {
  const t = useTerminology()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const canManage = permissions.hasAny('hostel.manage', 'hostel.allocate')

  const [scope, setScope] = useState<'live' | 'all'>('live')
  const [status, setStatus] = useState<AllocationStatus | ''>('')
  const [page, setPage] = useState(1)
  const [cancelling, setCancelling] = useState<HostelAllocation | null>(null)

  const params = useMemo(
    () => ({ live: scope === 'live', status, page }),
    [scope, status, page],
  )

  const allocations = useQuery({
    queryKey: hostelKeys.allocations(params),
    queryFn: () => hostelApi.allocations(params),
    placeholderData: (previous) => previous,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: hostelKeys.root })
  }

  const checkIn = useMutation({
    mutationFn: (id: string) => hostelApi.checkIn(id),
    onSuccess: () => {
      refresh()
      toast.success('Checked in.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be recorded.')
    },
  })

  const checkOut = useMutation({
    mutationFn: (id: string) => hostelApi.checkOut(id),
    onSuccess: () => {
      refresh()
      toast.success('Checked out. The bed is free.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be recorded.')
    },
  })

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => hostelApi.cancel(id, reason),
    onSuccess: () => {
      refresh()
      setCancelling(null)
      toast.success('Cancelled. The bed is free.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be cancelled.')
    },
  })

  const columns: Column<HostelAllocation>[] = [
    {
      key: 'student',
      header: t('learner'),
      cell: (row) => (
        <CellStack
          primary={row.student?.name ?? '—'}
          secondary={row.previous_allocation_id ? 'Moved from another room' : undefined}
        />
      ),
    },
    {
      key: 'bed',
      header: 'Bed',
      cell: (row) => (
        <CellStack primary={row.bed?.label ?? '—'} secondary={row.bed?.room?.name ?? undefined} />
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'dates',
      header: 'Stay',
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
            width: '14rem',
            cell: (row: HostelAllocation) => (
              <div className="flex justify-end gap-1">
                {row.status === 'allocated' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<SignIn size={14} />}
                    loading={checkIn.isPending && checkIn.variables === row.id}
                    onClick={() => checkIn.mutate(row.id)}
                  >
                    Check in
                  </Button>
                )}
                {row.status === 'checked_in' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<SignOut size={14} />}
                    loading={checkOut.isPending && checkOut.variables === row.id}
                    onClick={() => checkOut.mutate(row.id)}
                  >
                    Check out
                  </Button>
                )}
                {row.holds_bed && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(row)}>
                    Cancel
                  </Button>
                )}
              </div>
            ),
          } satisfies Column<HostelAllocation>,
        ]
      : []),
  ]

  return (
    <>
      <Card>
        <Toolbar
          className={cn('px-3')}
          filters={
            <>
              <Segmented
                label="Which allocations to show"
                value={scope}
                onChange={(value) => {
                  setScope(value as 'live' | 'all')
                  setPage(1)
                }}
                options={[
                  { value: 'live', label: 'In residence' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <div className="w-44">
                <Select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.currentTarget.value as AllocationStatus | '')
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: 'All statuses' },
                    { value: 'allocated', label: 'Allocated' },
                    { value: 'checked_in', label: 'Checked in' },
                    { value: 'checked_out', label: 'Checked out' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
            </>
          }
        />

        {allocations.isError ? (
          <ErrorState error={allocations.error} onRetry={() => allocations.refetch()} />
        ) : (
          <>
            <DataTable
              rows={allocations.data?.rows ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={allocations.isLoading}
              empty={
                <EmptyState
                  icon={<Bed size={20} />}
                  title={scope === 'live' ? 'Nobody is in residence' : 'No allocations'}
                  description={`A bed is allocated to one ${t('learner').toLowerCase()} for a session, then checked into and out of.`}
                />
              }
            />
            {allocations.data && allocations.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={allocations.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      <ReasonDialog
        open={cancelling !== null}
        title="Cancel this allocation"
        description="The bed becomes free immediately. The allocation stays on the record as cancelled, with this reason against it."
        confirmLabel="Cancel allocation"
        destructive
        pending={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
      />
    </>
  )
}
