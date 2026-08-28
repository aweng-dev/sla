import { get, getPage, patch, post } from '@/shared/api/client'

/**
 * Routes, the vehicles and people who run them, and who rides.
 *
 * ── A subscription is a rider, not a status ────────────────────────────────
 *
 * `transport_subscriptions` is the record that says this learner rides this
 * route between these dates, from this stop to that one, for this fare. Ending
 * one and transferring one are separate POSTs because they are different facts:
 * an end closes the record on a date, a transfer opens a new one on another
 * route. A PATCH that moved `transport_route_id` would lose the fare history and
 * the invoice the old fare hangs off.
 *
 * ── A trip is a run of a route on a day ────────────────────────────────────
 *
 * Completing one records the odometer; cancelling one records why. Riders are
 * checked onto a trip, which is how a school answers "was this child on the bus"
 * without asking the driver to remember.
 */

export type SubscriptionStatus = 'active' | 'suspended' | 'ended' | 'cancelled'
export type TripStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface TransportRoute {
  id: string
  campus_id: string | null
  name: string
  code: string | null
  transport_vehicle_id: string | null
  transport_driver_id: string | null
  fare_minor: number | null
  currency: string | null
  status: string
  accepts_subscriptions: boolean
  stops?: RouteStop[]
  vehicle?: TransportVehicle | null
  driver?: TransportDriver | null
}

export interface RouteStop {
  id: string
  transport_route_id: string
  name: string
  sequence: number
  scheduled_arrival: string | null
  latitude: number | null
  longitude: number | null
  is_located: boolean
}

export interface TransportVehicle {
  id: string
  campus_id: string | null
  registration_number: string
  make: string | null
  model: string | null
  seat_capacity: number | null
  status: string
  can_carry: boolean
  acquired_on: string | null
}

export interface TransportDriver {
  id: string
  staff_id: string | null
  person_id: string | null
  display_name: string
  phone: string | null
  licence_number: string | null
  licence_expires_on: string | null
  /** The API's own answer. A client that compared the date to `Date.now()`
   *  would disagree with the server across a timezone. */
  licence_has_expired: boolean
  status: string
  can_drive: boolean
}

export interface TransportSubscription {
  id: string
  student_id: string
  transport_route_id: string
  academic_session_id: string | null
  pickup_stop_id: string | null
  dropoff_stop_id: string | null
  starts_on: string | null
  ends_on: string | null
  status: SubscriptionStatus
  is_live: boolean
  fare_minor: number | null
  currency: string | null
  invoice_id: string | null
  student?: { id: string; name: string } | null
  route?: { id: string; name: string } | null
  pickup_stop?: { id: string; name: string } | null
  dropoff_stop?: { id: string; name: string } | null
}

export interface TransportTrip {
  id: string
  transport_route_id: string
  transport_vehicle_id: string | null
  transport_driver_id: string | null
  direction: string
  ran_on: string | null
  departed_at: string | null
  arrived_at: string | null
  odometer_start: number | null
  odometer_end: number | null
  distance: number | null
  status: TripStatus
  accepts_riders: boolean
  notes: string | null
  riders?: { id: string; student_id: string; student?: { name: string } | null }[]
}

export const transportApi = {
  routes: (params: { status?: string; campus_id?: string; page?: number }) =>
    getPage<TransportRoute>('/admin/transport/routes', {
      params: {
        status: params.status || undefined,
        campus_id: params.campus_id || undefined,
        page: params.page,
      },
    }),

  route: (id: string) => get<TransportRoute>(`/admin/transport/routes/${id}`),

  updateRoute: (id: string, input: Partial<TransportRoute>) =>
    patch<TransportRoute>(`/admin/transport/routes/${id}`, input),

  stops: (routeId: string) => get<RouteStop[]>(`/admin/transport/routes/${routeId}/stops`),

  addStop: (routeId: string, input: { name: string; sequence: number; scheduled_arrival?: string }) =>
    post<RouteStop>(`/admin/transport/routes/${routeId}/stops`, input),

  vehicles: (params: { status?: string; page?: number }) =>
    getPage<TransportVehicle>('/admin/transport/vehicles', {
      params: { status: params.status || undefined, page: params.page },
    }),

  drivers: (params: { status?: string; licence_expiring_before?: string; page?: number }) =>
    getPage<TransportDriver>('/admin/transport/drivers', {
      params: {
        status: params.status || undefined,
        licence_expiring_before: params.licence_expiring_before || undefined,
        page: params.page,
      },
    }),

  subscriptions: (params: {
    transport_route_id?: string
    status?: SubscriptionStatus | ''
    live?: boolean
    page?: number
  }) =>
    getPage<TransportSubscription>('/admin/transport/subscriptions', {
      params: {
        transport_route_id: params.transport_route_id || undefined,
        status: params.status || undefined,
        live: params.live ? 1 : undefined,
        page: params.page,
      },
    }),

  endSubscription: (id: string, input: { ends_on: string; status?: SubscriptionStatus }) =>
    post<TransportSubscription>(`/admin/transport/subscriptions/${id}/end`, input),

  transferSubscription: (
    id: string,
    input: {
      transport_route_id: string
      pickup_stop_id?: string
      dropoff_stop_id?: string
      starts_on?: string
      fare_minor?: number
    },
  ) => post<TransportSubscription>(`/admin/transport/subscriptions/${id}/transfer`, input),

  trips: (params: { transport_route_id?: string; status?: TripStatus | ''; ran_on?: string; page?: number }) =>
    getPage<TransportTrip>('/admin/transport/trips', {
      params: {
        transport_route_id: params.transport_route_id || undefined,
        status: params.status || undefined,
        ran_on: params.ran_on || undefined,
        page: params.page,
      },
    }),

  completeTrip: (id: string, input: { odometer_end?: number; notes?: string }) =>
    post<TransportTrip>(`/admin/transport/trips/${id}/complete`, input),

  cancelTrip: (id: string, reason: string) =>
    post<TransportTrip>(`/admin/transport/trips/${id}/cancel`, { reason }),
}

export const transportKeys = {
  root: ['admin', 'transport'] as const,
  routes: (params: unknown) => ['admin', 'transport', 'routes', params] as const,
  stops: (routeId: string) => ['admin', 'transport', 'stops', routeId] as const,
  vehicles: (params: unknown) => ['admin', 'transport', 'vehicles', params] as const,
  drivers: (params: unknown) => ['admin', 'transport', 'drivers', params] as const,
  subscriptions: (params: unknown) => ['admin', 'transport', 'subscriptions', params] as const,
  trips: (params: unknown) => ['admin', 'transport', 'trips', params] as const,
}
