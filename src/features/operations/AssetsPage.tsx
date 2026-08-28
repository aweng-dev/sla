import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowsLeftRight,
  Package,
  Stack,
  TrendDown,
  TrendUp,
  Warning,
  Wrench,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CellStack,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Segmented,
  Select,
  StatTile,
  StatusBadge,
  Tabs,
  Textarea,
  Toolbar,
  panelId,
  type Column,
  type TabItem,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, formatNumber, humanize } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { ModuleGate } from './components/ModuleGate'
import {
  assetKeys,
  assetsApi,
  type Asset,
  type AssetStatus,
  type Movement,
  type MovementKind,
  type StockPosition,
} from './assets.api'

/**
 * What the institution owns, and what it goes through.
 *
 * ── Two tabs because they are two different records ────────────────────────
 *
 * An asset is one identifiable thing with a tag, a serial and a history worth
 * keeping. An inventory item is a quantity of interchangeable things where the
 * only interesting fact is how many are where. Merging them would force one of
 * the two into the wrong shape — either every ream of paper gets an asset tag,
 * or the projector loses its maintenance record.
 *
 * ── Stock is never typed in ────────────────────────────────────────────────
 *
 * There is no field on this screen that sets a quantity, because there is no
 * endpoint that does. Stock is the sum of its movements, so a count that
 * disagreed with the shelf is an ADJUSTMENT with a reason — a signed number and
 * a note — and the trail survives. A screen that let somebody overwrite the
 * figure would destroy the only evidence of what happened.
 *
 * ── Below reorder level is the API's flag ──────────────────────────────────
 *
 * `below_reorder_level` comes down on the position. It is not recomputed here
 * from `total_quantity` and `reorder_level`, because a null reorder level means
 * "no level set" rather than zero, and the naive comparison flags every item
 * nobody has set a level for.
 */

const TABS_ID = 'assets-tabs'

type TabKey = 'assets' | 'stock' | 'movements'

export function AssetsPage() {
  const [tab, setTab] = useState<TabKey>('assets')

  const tabs: TabItem[] = [
    { key: 'assets', label: 'Assets' },
    { key: 'stock', label: 'Stock' },
    { key: 'movements', label: 'Movements' },
  ]

  return (
    <ModuleGate
      module="assets_inventory"
      title="Assets"
      offTitle="This institution does not track assets"
      offDescription="The assets and inventory module is switched off here. An administrator can enable it from the institution's modules."
    >
      <div>
        <Tabs items={tabs} value={tab} onChange={(key) => setTab(key as TabKey)} baseId={TABS_ID} />

        <Panel id="assets" tab={tab}>
          <AssetsTab />
        </Panel>
        <Panel id="stock" tab={tab}>
          <StockTab />
        </Panel>
        <Panel id="movements" tab={tab}>
          <MovementsTab />
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

/* ── Assets ──────────────────────────────────────────────────────────────── */

function AssetsTab() {
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [status, setStatus] = useState<AssetStatus | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)

  const categories = useQuery({
    queryKey: assetKeys.categories,
    queryFn: assetsApi.categories,
  })

  const params = useMemo(
    () => ({ search, status, asset_category_id: categoryId, page }),
    [search, status, categoryId, page],
  )

  const assets = useQuery({
    queryKey: assetKeys.assets(params),
    queryFn: () => assetsApi.assets(params),
    placeholderData: (previous) => previous,
  })

  const rows = assets.data?.rows ?? []
  const inUse = rows.filter((row) => row.status === 'in_use').length
  const underMaintenance = rows.filter((row) => row.status === 'under_maintenance').length

  const columns: Column<Asset>[] = [
    {
      key: 'asset',
      header: 'Asset',
      cell: (row) => (
        <CellStack
          primary={row.name}
          secondary={[row.asset_tag, row.serial_number].filter(Boolean).join(' · ')}
        />
      ),
    },
    { key: 'category', header: 'Category', cell: (row) => row.category?.name ?? '—' },
    { key: 'location', header: 'Where', cell: (row) => row.location?.name ?? '—' },
    {
      key: 'custodian',
      header: 'With',
      cell: (row) =>
        row.live_assignment === undefined ? (
          '—'
        ) : row.live_assignment === null ? (
          <span className="text-sm text-gray-500">Nobody</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900">Assigned</span>
            {row.live_assignment.is_overdue && <Badge tone="warning">Overdue back</Badge>}
          </div>
        ),
    },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      cell: (row) =>
        row.current_value_minor === null
          ? '—'
          : formatMoney(row.current_value_minor, row.currency ?? 'NGN'),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Assets"
          value={formatNumber(assets.data?.pagination.total ?? 0)}
          icon={<Package size={16} />}
          loading={assets.isLoading}
        />
        <StatTile
          label="Out with somebody"
          value={formatNumber(inUse)}
          hint="On this page"
          icon={<ArrowsLeftRight size={16} />}
          loading={assets.isLoading}
        />
        <StatTile
          label="Under maintenance"
          value={formatNumber(underMaintenance)}
          hint="On this page"
          icon={<Wrench size={16} />}
          loading={assets.isLoading}
        />
      </div>

      <Card>
        <Toolbar
          className="px-3"
          filters={
            <>
              <SearchInput
                value={draft}
                placeholder="Name, tag, serial"
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
                    setStatus(event.currentTarget.value as AssetStatus | '')
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: 'All statuses' },
                    { value: 'in_store', label: 'In store' },
                    { value: 'in_use', label: 'In use' },
                    { value: 'under_maintenance', label: 'Under maintenance' },
                    { value: 'retired', label: 'Retired' },
                    { value: 'disposed', label: 'Disposed' },
                    { value: 'lost', label: 'Lost' },
                  ]}
                />
              </div>
              {(categories.data ?? []).length > 0 && (
                <div className="w-44">
                  <Select
                    aria-label="Filter by category"
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.currentTarget.value)
                      setPage(1)
                    }}
                    options={[
                      { value: '', label: 'All categories' },
                      ...(categories.data ?? []).map((category) => ({
                        value: category.id,
                        label: category.name,
                      })),
                    ]}
                  />
                </div>
              )}
            </>
          }
        />

        {assets.isError ? (
          <ErrorState error={assets.error} onRetry={() => assets.refetch()} />
        ) : (
          <>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              loading={assets.isLoading}
              empty={
                <EmptyState
                  icon={<Package size={20} />}
                  title={search ? 'Nothing matches that' : 'No assets'}
                  description={
                    search
                      ? 'Try part of a name, a tag or a serial number.'
                      : 'An asset is one identifiable thing — a projector, a minibus — with its own tag and history.'
                  }
                />
              }
            />
            {assets.data && assets.data.pagination.total > 0 && (
              <Pagination
                className="px-4"
                pagination={assets.data.pagination}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

/* ── Stock ───────────────────────────────────────────────────────────────── */

function StockTab() {
  const permissions = usePermissions()
  const canMove = permissions.hasAny('inventory.manage', 'inventory.move', 'assets.manage')

  const [lowOnly, setLowOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [moving, setMoving] = useState<{ position: StockPosition; kind: MoveKind } | null>(null)

  const params = useMemo(() => ({ below_reorder_level: lowOnly, page }), [lowOnly, page])

  const stock = useQuery({
    queryKey: assetKeys.stock(params),
    queryFn: () => assetsApi.stock(params),
    placeholderData: (previous) => previous,
  })

  const rows = stock.data?.rows ?? []
  const low = rows.filter((row) => row.below_reorder_level).length

  const columns: Column<StockPosition>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (row) => <CellStack primary={row.name} secondary={row.sku} />,
    },
    {
      key: 'quantity',
      header: 'On hand',
      numeric: true,
      cell: (row) => (
        <span
          className={row.below_reorder_level ? 'font-semibold text-danger-600' : undefined}
        >
          {formatNumber(row.total_quantity)}
          {row.unit_of_measure && (
            <span className="text-gray-500"> {row.unit_of_measure}</span>
          )}
        </span>
      ),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      numeric: true,
      cell: (row) => (row.reorder_level === null ? '—' : formatNumber(row.reorder_level)),
    },
    {
      key: 'where',
      header: 'Where',
      cell: (row) =>
        row.locations.length === 0 ? (
          <span className="text-sm text-gray-500">Nowhere</span>
        ) : (
          <CellStack
            primary={row.locations[0].location_name}
            secondary={
              row.locations.length > 1
                ? `and ${formatNumber(row.locations.length - 1)} more`
                : undefined
            }
          />
        ),
    },
    ...(canMove
      ? [
          {
            key: 'actions',
            header: '',
            width: '16rem',
            cell: (row: StockPosition) => (
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<TrendUp size={14} />}
                  onClick={() => setMoving({ position: row, kind: 'receive' })}
                >
                  Receive
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<TrendDown size={14} />}
                  onClick={() => setMoving({ position: row, kind: 'issue' })}
                >
                  Issue
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMoving({ position: row, kind: 'adjust' })}
                >
                  Adjust
                </Button>
              </div>
            ),
          } satisfies Column<StockPosition>,
        ]
      : []),
  ]

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Items tracked"
            value={formatNumber(stock.data?.pagination.total ?? 0)}
            icon={<Stack size={16} />}
            loading={stock.isLoading}
          />
          <StatTile
            label="Below reorder level"
            value={formatNumber(low)}
            hint={low > 0 ? 'On this page — order more' : 'Nothing to order'}
            icon={<Warning size={16} />}
            loading={stock.isLoading}
          />
        </div>

        <Card>
          <Toolbar
            className="px-3"
            filters={
              <Segmented
                label="Which stock to show"
                value={lowOnly ? 'low' : 'all'}
                onChange={(value) => {
                  setLowOnly(value === 'low')
                  setPage(1)
                }}
                options={[
                  { value: 'all', label: 'All items' },
                  { value: 'low', label: 'Running low' },
                ]}
              />
            }
          />

          {stock.isError ? (
            <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
          ) : (
            <>
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(row) => row.item_id}
                loading={stock.isLoading}
                empty={
                  <EmptyState
                    icon={<Stack size={20} />}
                    title={lowOnly ? 'Nothing is running low' : 'Nothing in stock'}
                    description={
                      lowOnly
                        ? 'Every item with a reorder level is above it.'
                        : 'Stock appears here once an item has been received into a location.'
                    }
                  />
                }
              />
              {stock.data && stock.data.pagination.total > 0 && (
                <Pagination
                  className="px-4"
                  pagination={stock.data.pagination}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </Card>
      </div>

      <MoveStockDialog
        move={moving}
        onClose={() => setMoving(null)}
        onDone={() => setMoving(null)}
      />
    </>
  )
}

/* ── Movements ───────────────────────────────────────────────────────────── */

function MovementsTab() {
  const [kind, setKind] = useState<MovementKind | ''>('')
  const [page, setPage] = useState(1)

  const params = useMemo(() => ({ kind, page }), [kind, page])

  const movements = useQuery({
    queryKey: assetKeys.movements(params),
    queryFn: () => assetsApi.movements(params),
    placeholderData: (previous) => previous,
  })

  const columns: Column<Movement>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (row) => (row.moved_at ? formatDate(row.moved_at) : '—'),
    },
    { key: 'kind', header: 'What', cell: (row) => humanize(row.kind) },
    {
      key: 'delta',
      header: 'Change',
      numeric: true,
      cell: (row) => (
        <span
          className={
            row.quantity_delta < 0 ? 'text-danger-600' : 'text-success-600'
          }
        >
          {row.quantity_delta > 0 ? '+' : ''}
          {formatNumber(row.quantity_delta)}
        </span>
      ),
    },
    { key: 'reference', header: 'Reference', cell: (row) => row.reference ?? '—' },
    {
      key: 'notes',
      header: 'Note',
      cell: (row) => <span className="text-sm text-gray-600">{row.notes ?? '—'}</span>,
    },
  ]

  return (
    <Card>
      <Toolbar
        className="px-3"
        filters={
          <div className="w-44">
            <Select
              aria-label="Filter by kind"
              value={kind}
              onChange={(event) => {
                setKind(event.currentTarget.value as MovementKind | '')
                setPage(1)
              }}
              options={[
                { value: '', label: 'Every movement' },
                { value: 'receipt', label: 'Receipts' },
                { value: 'issue', label: 'Issues' },
                { value: 'adjustment', label: 'Adjustments' },
                { value: 'transfer_in', label: 'Transfers in' },
                { value: 'transfer_out', label: 'Transfers out' },
              ]}
            />
          </div>
        }
      />

      {movements.isError ? (
        <ErrorState error={movements.error} onRetry={() => movements.refetch()} />
      ) : (
        <>
          <DataTable
            rows={movements.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={movements.isLoading}
            empty={
              <EmptyState
                icon={<ArrowsLeftRight size={20} />}
                title="Nothing has moved"
                description="Every change to stock is a row here — that is what makes the count answerable."
              />
            }
          />
          {movements.data && movements.data.pagination.total > 0 && (
            <Pagination
              className="px-4"
              pagination={movements.data.pagination}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Card>
  )
}

/* ── Moving stock ────────────────────────────────────────────────────────── */

type MoveKind = 'receive' | 'issue' | 'adjust'

const MOVE_COPY: Record<MoveKind, { title: string; confirm: string; hint: string }> = {
  receive: {
    title: 'Receive stock',
    confirm: 'Record receipt',
    hint: 'How many arrived. The count goes up by this.',
  },
  issue: {
    title: 'Issue stock',
    confirm: 'Record issue',
    hint: 'How many went out. The count goes down by this.',
  },
  adjust: {
    title: 'Adjust stock',
    confirm: 'Record adjustment',
    hint: 'The difference, signed. A count three short is −3.',
  },
}

/**
 * One movement, with a location and a reason.
 *
 * The location is required and never defaulted: stock is held per location, and
 * a receipt booked to the wrong store is worse than one not booked at all
 * because it looks correct in the total.
 */
function MoveStockDialog({
  move,
  onClose,
  onDone,
}: {
  move: { position: StockPosition; kind: MoveKind } | null
  onClose: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const locations = useQuery({
    queryKey: assetKeys.locations,
    queryFn: assetsApi.locations,
    enabled: move !== null,
  })

  const copy = move ? MOVE_COPY[move.kind] : null

  const record = useMutation({
    mutationFn: () => {
      const amount = Number(quantity)
      const base = {
        inventory_item_id: move!.position.item_id,
        asset_location_id: locationId,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }

      if (move!.kind === 'receive') return assetsApi.receive({ ...base, quantity: amount })
      if (move!.kind === 'issue') return assetsApi.issue({ ...base, quantity: amount })
      return assetsApi.adjust({ ...base, quantity_delta: amount })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.inventoryRoot })
      setQuantity('')
      setReference('')
      setNotes('')
      setErrors({})
      toast.success('Recorded.')
      onDone()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That movement was not recorded.')
    },
  })

  const amount = Number(quantity)
  const valid =
    quantity.trim() !== '' &&
    Number.isFinite(amount) &&
    (move?.kind === 'adjust' ? amount !== 0 : amount > 0) &&
    locationId !== ''

  return (
    <Modal
      open={move !== null}
      onClose={onClose}
      title={copy?.title ?? ''}
      description={move ? `${move.position.name} · ${move.position.sku}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={record.isPending}
            disabled={!valid}
            onClick={() => record.mutate()}
          >
            {copy?.confirm ?? 'Record'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label={move?.kind === 'adjust' ? 'Difference' : 'Quantity'}
          required
          hint={copy?.hint}
          error={errors.quantity ?? errors.quantity_delta}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Location" required error={errors.asset_location_id}>
          {(props) => (
            <Select
              {...props}
              value={locationId}
              onChange={(event) => setLocationId(event.currentTarget.value)}
              placeholder="Choose a location"
              options={(locations.data ?? []).map((location) => ({
                value: location.id,
                label: location.code ? `${location.name} (${location.code})` : location.name,
              }))}
            />
          )}
        </Field>

        <Field
          label="Reference"
          error={errors.reference}
          hint="A delivery note, a requisition number — whatever this can be traced to."
        >
          {(props) => (
            <Input
              {...props}
              value={reference}
              maxLength={120}
              onChange={(event) => setReference(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field
          label="Note"
          error={errors.notes}
          hint={move?.kind === 'adjust' ? 'Say why the count changed. This is the audit trail.' : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={notes}
              maxLength={500}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
