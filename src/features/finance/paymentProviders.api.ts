import { del, get, patch, post } from '@/shared/api/client'

/**
 * The gateways an institution can take fees through.
 *
 * ── This is the integrations API, narrowed to money ────────────────────────
 *
 * Connections are one table for every third party a school plugs in — email,
 * SMS, video, payments. This client speaks only the payment providers, because
 * the person setting up Paystack is a bursar looking for a way to collect fees,
 * not an administrator auditing integrations. Same endpoints, one audience.
 *
 * ── A secret is written and never read back ────────────────────────────────
 *
 * `IntegrationConnectionResource` returns a `credential_fingerprint` — twelve
 * characters of a SHA-256 — plus when it was set and by whom. It has no field
 * for the key itself, so a compromised session cannot exfiltrate one, and this
 * client has nothing to display. Replacing a key is `rotate-credential`, which
 * writes without reading.
 *
 * ── Connecting is not the same as switching on ─────────────────────────────
 *
 * A connection carries a `status`. `ResolvePaymentGateway` treats anything but
 * `active` as a refusal and — deliberately — will NOT fall back to the platform
 * key for a connection that exists and is paused. So pausing a provider stops
 * collection through it rather than quietly rerouting somebody's fees into
 * another account.
 */

export type ConnectionStatus = 'active' | 'paused' | 'disabled'

/** The three the payments module can actually charge through. */
export type PaymentProviderKey = 'paystack' | 'flutterwave' | 'stripe'

export interface ProviderConnection {
  id: string
  provider: string
  provider_label: string
  category: string | null
  key: string | null
  display_name: string | null
  status: ConnectionStatus
  is_failing: boolean
  base_url: string | null
  /** Twelve characters of a hash — enough to say "the key changed", never
   *  enough to be one. */
  credential_fingerprint: string | null
  credential_set_at: string | null
  credential_set_by: string | null
  /** Which credential fields this provider expects, named by the API. */
  credential_fields: string[] | null
  config: Record<string, unknown> | null
  last_error: string | null
  consecutive_failures: number
  disabled_at: string | null
  disabled_reason: string | null
  created_at: string | null
}

export interface ConnectInput {
  provider: PaymentProviderKey
  key?: string
  display_name?: string
  credentials: Record<string, string>
  config?: { base_url?: string }
}

const ROOT = '/admin/integrations/connections'

export const paymentProvidersApi = {
  /** Every connection; the screen filters to the payment ones. The endpoint
   *  takes no category filter, and inventing a query parameter the API does
   *  not have would silently return everything anyway. */
  connections: () => get<ProviderConnection[]>(ROOT),

  connect: (input: ConnectInput) => post<ProviderConnection>(ROOT, input),

  update: (
    id: string,
    input: { display_name?: string; status?: ConnectionStatus; config?: { base_url?: string } },
  ) => patch<ProviderConnection>(`${ROOT}/${id}`, input),

  /** Writes a new secret without reading the old one. */
  rotate: (id: string, credentials: Record<string, string>) =>
    post<ProviderConnection>(`${ROOT}/${id}/rotate-credential`, { credentials }),

  disconnect: (id: string) => del(`${ROOT}/${id}`),
}

export const paymentProviderKeys = {
  root: ['admin', 'integrations', 'connections'] as const,
}

/**
 * What each gateway needs, and what to call it.
 *
 * The API names the fields it expects on the connection itself
 * (`credential_fields`), and that is preferred wherever it is present — this is
 * the fallback for a provider that has never been connected, where there is no
 * connection to read them from. Paystack signs its webhooks with the SECRET
 * KEY, so it has no separate webhook secret to ask for.
 */
export const PROVIDER_SETUP: Record<
  PaymentProviderKey,
  { label: string; fields: { name: string; label: string; hint?: string }[]; docs: string }
> = {
  paystack: {
    label: 'Paystack',
    fields: [
      {
        name: 'secret_key',
        label: 'Secret key',
        hint: 'From your Paystack dashboard, under Settings → API Keys & Webhooks. Starts sk_.',
      },
    ],
    docs: 'Paystack signs its webhooks with this same secret key, so there is nothing else to enter.',
  },
  flutterwave: {
    label: 'Flutterwave',
    fields: [
      { name: 'secret_key', label: 'Secret key' },
      {
        name: 'webhook_secret',
        label: 'Secret hash',
        hint: 'Flutterwave calls this the secret hash. It is sent verbatim and is not derived from the secret key.',
      },
    ],
    docs: 'Both values come from your Flutterwave dashboard under Settings → API.',
  },
  stripe: {
    label: 'Stripe',
    fields: [
      { name: 'secret_key', label: 'Secret key' },
      {
        name: 'webhook_secret',
        label: 'Webhook signing secret',
        hint: 'From the endpoint you add in Stripe, starting whsec_.',
      },
    ],
    docs: 'Add a webhook endpoint in Stripe pointing at this institution before entering its signing secret.',
  },
}

/**
 * The address a provider must be told to send its confirmations to.
 *
 * ── Why a school has to be shown this ──────────────────────────────────────
 *
 * A gateway confirms a payment by calling back, and it only calls back to an
 * address somebody pasted into its dashboard. Without that, a parent pays,
 * Paystack takes the money, and the bill stays unpaid until somebody notices
 * and verifies by hand. Connecting the key is half the setup; this is the other
 * half, and it is the half that is invisible until it is missing.
 *
 * Built from the same base the API client uses, so it is right in every
 * environment rather than a value somebody has to keep in step by hand.
 */
export function webhookUrlFor(provider: PaymentProviderKey): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined
  const base =
    configured && configured.trim() !== ''
      ? configured.trim()
      : `${window.location.origin}/rest/v1`

  return `${base.replace(/\/+$/, '')}/payments/webhooks/${provider}`
}
