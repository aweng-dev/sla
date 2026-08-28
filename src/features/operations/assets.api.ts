import { get, getPage, patch, post } from '@/shared/api/client'

/**
 * The things the institution owns, and the consumables it goes through.
 *
 * ── Two different records, deliberately not merged ─────────────────────────
 *
 * An ASSET is one identifiable thing with a tag and a serial: this projector,
 * that minibus. It is assigned to a custodian, maintained, revalued and
 * eventually retired, and its history is the point of the record.
 *
 * An INVENTORY ITEM is a quantity of interchangeable things: A4 paper, exercise
 * books. Nobody tracks which ream. What is tracked is how many are at which
 * location, which is a STOCK POSITION, and the only way it changes is a
 * MOVEMENT — a receipt, an issue, an adjustment, or a transfer.
 *
 * ── Movements are never edits ──────────────────────────────────────────────
 *
 * There is no endpoint that sets a quantity, and there should not be. Stock is
 * the sum of its movements, so every change is a new row with a reason attached:
 * a count that disagreed with the shelf is an `adjustment` with a note, not a
 * number quietly overwritten. A transfer writes TWO movements — an out and an in
 * — and the API returns both, because a transfer that half-succeeded would
 * otherwise vanish.
 */

export type AssetStatus = 'in_store' | 'in_use' | 'under_maintenance' | 'retired' | 'disposed' | 'lost'
export type MaintenanceStatus = 'reported' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export type MovementKind = 'receipt' | 'issue' | 'adjustment' | 'transfer_in' | 'transfer_out'

export interface AssetCategory {
  id: string
  parent_id: string | null
  name: string
  code: string | null
  useful_life_months: number | null
  children?: AssetCategory[]
}

export interface AssetLocation {
  id: string
  campus_id: string | null
  building_id: string | null
  room_id: string | null
  organizational_unit_id: string | null
  name: string
  code: string | null
  kind: string | null
}

export interface Asset {
  id: string
  asset_category_id: string | null
  asset_location_id: string | null
  asset_tag: string
  name: string
  description: string | null
  serial_number: string | null
  status: AssetStatus
  condition: string | null
  is_assignable: boolean
  /** Retired, disposed or lost — the API's own word for "this record is
   *  finished", so no screen has to keep its own list of which statuses end. */
  is_terminal: boolean
  acquired_on: string | null
  purchase_cost_minor: number | null
  current_value_minor: number | null
  currency: string | null
  supplier: string | null
  warranty_expires_on: string | null
  notes: string | null
  category?: AssetCategory | null
  location?: AssetLocation | null
  /** The assignment in force, if any. Absent means "not loaded", null means
   *  "nobody has it". */
  live_assignment?: AssetAssignment | null
}

export interface AssetAssignment {
  id: string
  asset_id: string
  custodian_staff_id: string | null
  custodian_student_id: string | null
  organizational_unit_id: string | null
  assigned_at: string | null
  due_back_on: string | null
  returned_at: string | null
  assigned_by_staff_id: string | null
  condition_out: string | null
  condition_in: string | null
  is_live: boolean
  is_overdue: boolean
  notes: string | null
}

export interface MaintenanceRecord {
  id: string
  asset_id: string
  kind: string
  status: MaintenanceStatus
  is_open: boolean
  reported_at: string | null
  scheduled_for: string | null
  completed_at: string | null
  cost_minor: number | null
  currency: string | null
  vendor: string | null
  performed_by_staff_id: string | null
  notes: string | null
  asset?: Asset | null
}

export interface InventoryItem {
  id: string
  asset_category_id: string | null
  sku: string
  name: string
  description: string | null
  unit_of_measure: string | null
  reorder_level: number | null
  unit_cost_minor: number | null
  currency: string | null
  is_active: boolean
  /** Only present when the listing was asked for stock. */
  total_on_hand?: number
}

export interface StockPosition {
  item_id: string
  sku: string
  name: string
  unit_of_measure: string | null
  total_quantity: number
  reorder_level: number | null
  below_reorder_level: boolean
  locations: {
    location_id: string
    location_name: string
    location_code: string | null
    quantity: number
  }[]
}

export interface Movement {
  id: string
  inventory_item_id: string
  asset_location_id: string
  kind: MovementKind
  /** Signed: negative on an issue or a transfer out. */
  quantity_delta: number
  reference: string | null
  unit_cost_minor: number | null
  currency: string | null
  moved_at: string | null
  recorded_by_staff_id: string | null
  issued_to_staff_id: string | null
  issued_to_student_id: string | null
  counterpart_location_id: string | null
  notes: string | null
}

export const assetsApi = {
  categories: () => get<AssetCategory[]>('/admin/assets/categories'),

  locations: () => get<AssetLocation[]>('/admin/assets/locations'),

  assets: (params: {
    search?: string
    status?: AssetStatus | ''
    asset_category_id?: string
    asset_location_id?: string
    in_service?: boolean
    page?: number
  }) =>
    getPage<Asset>('/admin/assets', {
      params: {
        search: params.search || undefined,
        status: params.status || undefined,
        asset_category_id: params.asset_category_id || undefined,
        asset_location_id: params.asset_location_id || undefined,
        in_service: params.in_service ? 1 : undefined,
        page: params.page,
      },
    }),

  asset: (id: string) => get<Asset>(`/admin/assets/${id}`),

  updateAsset: (id: string, input: Partial<Asset>) => patch<Asset>(`/admin/assets/${id}`, input),

  retireAsset: (id: string, input: { reason?: string }) =>
    post<Asset>(`/admin/assets/${id}/retire`, input),

  assignments: (assetId: string) =>
    get<AssetAssignment[]>(`/admin/assets/${assetId}/assignments`),

  assign: (
    assetId: string,
    input: {
      custodian_staff_id?: string
      custodian_student_id?: string
      organizational_unit_id?: string
      due_back_on?: string
      condition_out?: string
      notes?: string
    },
  ) => post<AssetAssignment>(`/admin/assets/${assetId}/assignments`, input),

  returnAssignment: (
    assignmentId: string,
    input: { condition_in?: string; asset_location_id?: string; notes?: string },
  ) => post<AssetAssignment>(`/admin/assets/assignments/${assignmentId}/return`, input),

  maintenance: (assetId: string) =>
    get<MaintenanceRecord[]>(`/admin/assets/${assetId}/maintenance`),

  openMaintenance: (
    assetId: string,
    input: { kind: string; scheduled_for?: string; vendor?: string; notes?: string },
  ) => post<MaintenanceRecord>(`/admin/assets/${assetId}/maintenance`, input),

  completeMaintenance: (
    maintenanceId: string,
    input: { cost_minor?: number; currency?: string; condition?: string; notes?: string },
  ) => post<MaintenanceRecord>(`/admin/assets/maintenance/${maintenanceId}/complete`, input),

  items: (params: { search?: string; active?: boolean; with_stock?: boolean; page?: number }) =>
    getPage<InventoryItem>('/admin/inventory/items', {
      params: {
        search: params.search || undefined,
        active: params.active === undefined ? undefined : params.active ? 1 : 0,
        with_stock: params.with_stock ? 1 : undefined,
        page: params.page,
      },
    }),

  stock: (params: { asset_location_id?: string; below_reorder_level?: boolean; page?: number }) =>
    getPage<StockPosition>('/admin/inventory/stock', {
      params: {
        asset_location_id: params.asset_location_id || undefined,
        below_reorder_level: params.below_reorder_level ? 1 : undefined,
        page: params.page,
      },
    }),

  movements: (params: {
    inventory_item_id?: string
    asset_location_id?: string
    kind?: MovementKind | ''
    page?: number
  }) =>
    getPage<Movement>('/admin/inventory/movements', {
      params: {
        inventory_item_id: params.inventory_item_id || undefined,
        asset_location_id: params.asset_location_id || undefined,
        kind: params.kind || undefined,
        page: params.page,
      },
    }),

  receive: (input: {
    inventory_item_id: string
    asset_location_id: string
    quantity: number
    reference?: string
    unit_cost_minor?: number
    notes?: string
  }) => post<Movement>('/admin/inventory/movements/receive', input),

  issue: (input: {
    inventory_item_id: string
    asset_location_id: string
    quantity: number
    issued_to_staff_id?: string
    issued_to_student_id?: string
    reference?: string
    notes?: string
  }) => post<Movement>('/admin/inventory/movements/issue', input),

  /** Signed. A stock count that came up three short is `-3` with a note. */
  adjust: (input: {
    inventory_item_id: string
    asset_location_id: string
    quantity_delta: number
    reference?: string
    notes?: string
  }) => post<Movement>('/admin/inventory/movements/adjust', input),

  /** Answers with BOTH movements — the out and the in. */
  transfer: (input: {
    inventory_item_id: string
    from_location_id: string
    to_location_id: string
    quantity: number
    reference?: string
    notes?: string
  }) => post<{ out: Movement; in: Movement }>('/admin/inventory/movements/transfer', input),
}

export const assetKeys = {
  root: ['admin', 'assets'] as const,
  categories: ['admin', 'assets', 'categories'] as const,
  locations: ['admin', 'assets', 'locations'] as const,
  assets: (params: unknown) => ['admin', 'assets', 'list', params] as const,
  asset: (id: string) => ['admin', 'assets', 'detail', id] as const,
  assignments: (id: string) => ['admin', 'assets', 'assignments', id] as const,
  maintenance: (id: string) => ['admin', 'assets', 'maintenance', id] as const,
  inventoryRoot: ['admin', 'inventory'] as const,
  items: (params: unknown) => ['admin', 'inventory', 'items', params] as const,
  stock: (params: unknown) => ['admin', 'inventory', 'stock', params] as const,
  movements: (params: unknown) => ['admin', 'inventory', 'movements', params] as const,
}
