import { get, getPage, post } from '@/shared/api/client'

/**
 * Residences, and who is in which bed.
 *
 * ── Occupancy is one endpoint, not a sum this client computes ──────────────
 *
 * `GET /admin/hostel/occupancy` answers with beds total, serviceable, out of
 * service, occupied and free, plus the percentage. Counting beds in the browser
 * would mean fetching every bed of every room of every hostel to render one
 * figure, and the figure would then disagree with the API's the moment a bed was
 * marked out of service between two pages.
 *
 * ── Check-in, check-out and room change are not status edits ───────────────
 *
 * Each is a POST to its own address. A check-out frees the bed; a room change
 * writes a NEW allocation pointing back at the one it replaced, which is why the
 * resource carries `previous_allocation_id` — the residency history is a chain,
 * and a PATCH that moved `hostel_bed_id` would erase it.
 */

export type AllocationStatus = 'allocated' | 'checked_in' | 'checked_out' | 'cancelled'

export interface Hostel {
  id: string
  campus_id: string | null
  name: string
  code: string | null
  gender_policy: string | null
  warden_staff_id: string | null
  status: string
  is_open: boolean
  blocks?: { id: string; name: string }[]
  rooms?: HostelRoom[]
}

export interface HostelRoom {
  id: string
  hostel_id: string
  hostel_block_id: string | null
  name: string
  floor: string | null
  capacity: number
  status: string
  is_allocatable: boolean
  bed_count?: number
  beds?: HostelBed[]
}

export interface HostelBed {
  id: string
  hostel_id: string
  hostel_room_id: string
  label: string
  status: string
  is_allocatable: boolean
}

export interface HostelAllocation {
  id: string
  hostel_bed_id: string
  student_id: string
  academic_session_id: string | null
  starts_on: string | null
  ends_on: string | null
  status: AllocationStatus
  /** Whether the bed is still spoken for. A cancelled or checked-out
   *  allocation does not hold one. */
  holds_bed: boolean
  checked_in_at: string | null
  checked_out_at: string | null
  allocated_by_staff_id: string | null
  /** The allocation this one replaced, on a room change. */
  previous_allocation_id: string | null
  fee_minor: number | null
  currency: string | null
  invoice_id: string | null
  notes: string | null
  student?: { id: string; name: string } | null
  bed?: (HostelBed & { room?: HostelRoom | null }) | null
}

export interface Occupancy {
  hostel_id: string | null
  as_of: string | null
  beds_total: number
  beds_serviceable: number
  beds_out_of_service: number
  beds_occupied: number
  beds_free: number
  occupancy_basis_points: number
  occupancy_percent: number
  is_full: boolean
}

export interface AllocateInput {
  hostel_bed_id: string
  student_id: string
  academic_session_id?: string
  starts_on?: string
  ends_on?: string
  fee_minor?: number
  currency?: string
  notes?: string
}

export const hostelApi = {
  hostels: (params: { status?: string; campus_id?: string }) =>
    getPage<Hostel>('/admin/hostel/hostels', {
      params: { status: params.status || undefined, campus_id: params.campus_id || undefined },
    }),

  hostel: (id: string) => get<Hostel>(`/admin/hostel/hostels/${id}`),

  rooms: (params: { hostel_id?: string; status?: string; page?: number }) =>
    getPage<HostelRoom>('/admin/hostel/rooms', {
      params: {
        hostel_id: params.hostel_id || undefined,
        status: params.status || undefined,
        page: params.page,
      },
    }),

  beds: (params: { hostel_id?: string; hostel_room_id?: string; page?: number }) =>
    getPage<HostelBed>('/admin/hostel/beds', {
      params: {
        hostel_id: params.hostel_id || undefined,
        hostel_room_id: params.hostel_room_id || undefined,
        page: params.page,
      },
    }),

  /** Scoped to one hostel when asked, institution-wide otherwise. */
  occupancy: (hostelId?: string) =>
    get<Occupancy>('/admin/hostel/occupancy', {
      params: { hostel_id: hostelId || undefined },
    }),

  allocations: (params: {
    hostel_id?: string
    status?: AllocationStatus | ''
    live?: boolean
    student_id?: string
    page?: number
  }) =>
    getPage<HostelAllocation>('/admin/hostel/allocations', {
      params: {
        hostel_id: params.hostel_id || undefined,
        status: params.status || undefined,
        live: params.live ? 1 : undefined,
        student_id: params.student_id || undefined,
        page: params.page,
      },
    }),

  allocate: (input: AllocateInput) =>
    post<HostelAllocation>('/admin/hostel/allocations', input),

  /** `at` is a stamp: somebody arrives at a time, not on a date. */
  checkIn: (id: string, at?: string) =>
    post<HostelAllocation>(`/admin/hostel/allocations/${id}/check-in`, { at }),

  checkOut: (id: string, at?: string) =>
    post<HostelAllocation>(`/admin/hostel/allocations/${id}/check-out`, { at }),

  cancel: (id: string, reason: string) =>
    post<HostelAllocation>(`/admin/hostel/allocations/${id}/cancel`, { reason }),

  /** Writes a new allocation chained to this one rather than moving the bed. */
  roomChange: (id: string, input: AllocateInput) =>
    post<HostelAllocation>(`/admin/hostel/allocations/${id}/room-change`, input),
}

export const hostelKeys = {
  root: ['admin', 'hostel'] as const,
  hostels: (params: unknown) => ['admin', 'hostel', 'hostels', params] as const,
  rooms: (params: unknown) => ['admin', 'hostel', 'rooms', params] as const,
  occupancy: (hostelId?: string) => ['admin', 'hostel', 'occupancy', hostelId ?? 'all'] as const,
  allocations: (params: unknown) => ['admin', 'hostel', 'allocations', params] as const,
}
