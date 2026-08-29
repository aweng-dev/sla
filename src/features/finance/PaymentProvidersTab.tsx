import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Key, Pause, Play, Plug, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { useModules, usePermissions } from '@/features/tenant/TenantProvider'
import {
  PROVIDER_SETUP,
  paymentProviderKeys,
  paymentProvidersApi,
  webhookUrlFor,
  type PaymentProviderKey,
  type ProviderConnection,
} from './paymentProviders.api'

/**
 * How the institution takes money.
 *
 * ── Without this, nothing else in the money loop can run ───────────────────
 *
 * `ResolvePaymentGateway::availableFor()` returns the providers this
 * institution has an ACTIVE connection for. With none, the family's Pay button
 * is replaced by "this institution has no online payment method set up" — which
 * is honest, and useless, because until now there was nowhere to set one up.
 *
 * ── A different module from the screen it sits on ──────────────────────────
 *
 * Connections are `module:integrations` and `integrations.manage`; everything
 * else on this page is `module:finance`. So the tab renders only where that
 * second module answers — an institution can run fees without ever plugging in
 * a gateway, and collect at the desk.
 *
 * ── A secret is written and never read ─────────────────────────────────────
 *
 * The API returns a twelve-character fingerprint and no key. There is nothing
 * to reveal, no "show" toggle, and replacing a key is a rotate that writes
 * without reading. The fingerprint is shown because it is the one way to answer
 * "did the key I just pasted actually land".
 */

const PAYMENT_PROVIDERS: PaymentProviderKey[] = ['paystack', 'flutterwave', 'stripe']

export function PaymentProvidersTab() {
  const modules = useModules()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const [connecting, setConnecting] = useState<PaymentProviderKey | null>(null)
  const [rotating, setRotating] = useState<ProviderConnection | null>(null)

  const canManage = permissions.has('integrations.manage')

  const connections = useQuery({
    queryKey: paymentProviderKeys.root,
    queryFn: paymentProvidersApi.connections,
    enabled: modules.has('integrations'),
  })

  /* One row per gateway the payments module can charge through, whether or not
   * it has been connected — the empty ones are the point of the screen. */
  const rows = useMemo(() => {
    const byProvider = new Map(
      (connections.data ?? []).map((connection) => [connection.provider, connection]),
    )

    return PAYMENT_PROVIDERS.map((provider) => ({
      provider,
      setup: PROVIDER_SETUP[provider],
      connection: byProvider.get(provider) ?? null,
    }))
  }, [connections.data])

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      paymentProvidersApi.update(id, { status }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentProviderKeys.root })
      toast.success(
        variables.status === 'active'
          ? 'Switched on. Families can now pay through it.'
          : 'Paused. No new payments will be taken through it.',
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  if (!modules.has('integrations')) {
    return (
      <Card>
        <EmptyState
          icon={<Plug size={20} />}
          title="Integrations are not switched on here"
          description="Connecting a payment gateway needs the integrations module. Without it, fees are collected at the desk and recorded by hand."
        />
      </Card>
    )
  }

  if (connections.isError) {
    return (
      <Card>
        <ErrorState error={connections.error} onRetry={() => connections.refetch()} />
      </Card>
    )
  }

  const live = rows.filter((row) => row.connection?.status === 'active').length

  return (
    <>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title="Payment providers"
            subtitle={
              live === 0
                ? 'None switched on — families have no way to pay online.'
                : `${formatNumber(live)} switched on. Families can pay their bills online.`
            }
          />

          {connections.isLoading ? (
            <div className="space-y-2 p-4" aria-hidden>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {rows.map(({ provider, setup, connection }) => (
                <li key={provider} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600"
                    aria-hidden
                  >
                    <Plug size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-gray-900">{setup.label}</h3>
                      {connection === null ? (
                        <Badge tone="neutral">Not connected</Badge>
                      ) : connection.status === 'active' ? (
                        <Badge tone="success">
                          <CheckCircle size={11} weight="fill" />
                          Taking payments
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{connection.status}</Badge>
                      )}
                      {connection?.is_failing && (
                        <span className="inline-flex items-center gap-1 text-2xs text-danger-600">
                          <Warning size={12} weight="fill" />
                          {formatNumber(connection.consecutive_failures)} failures in a row
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-2xs text-gray-600">
                      {connection === null
                        ? setup.docs
                        : /* The one way to answer "did the key I pasted land". */
                          `Key ending ${connection.credential_fingerprint ?? '—'}${
                            connection.credential_set_at
                              ? `, set ${formatDate(connection.credential_set_at)}`
                              : ''
                          }`}
                    </p>

                    {connection?.last_error && (
                      <p className="mt-1 text-2xs text-danger-600">{connection.last_error}</p>
                    )}

                    {/* Connecting the key is half the setup. Without this
                      * pasted into the provider's dashboard, a family pays,
                      * the money moves, and the bill stays unpaid until
                      * somebody verifies by hand. */}
                    {connection !== null && (
                      <WebhookHint provider={provider} label={setup.label} />
                    )}
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {connection === null ? (
                        <Button size="sm" variant="primary" onClick={() => setConnecting(provider)}>
                          Connect
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Key size={14} />}
                            onClick={() => setRotating(connection)}
                          >
                            Replace key
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={
                              connection.status === 'active' ? (
                                <Pause size={14} />
                              ) : (
                                <Play size={14} />
                              )
                            }
                            loading={setStatus.isPending && setStatus.variables?.id === connection.id}
                            onClick={() =>
                              setStatus.mutate({
                                id: connection.id,
                                status: connection.status === 'active' ? 'paused' : 'active',
                              })
                            }
                          >
                            {connection.status === 'active' ? 'Pause' : 'Switch on'}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-2xs text-gray-500">
          Paused is a refusal, not a fallback: a provider that is connected and paused stops
          collection through it rather than quietly routing fees somewhere else.
        </p>
      </div>

      <CredentialDialog
        provider={connecting}
        connection={null}
        onClose={() => setConnecting(null)}
        onSaved={() => {
          setConnecting(null)
          queryClient.invalidateQueries({ queryKey: paymentProviderKeys.root })
        }}
      />

      <CredentialDialog
        provider={(rotating?.provider as PaymentProviderKey) ?? null}
        connection={rotating}
        onClose={() => setRotating(null)}
        onSaved={() => {
          setRotating(null)
          queryClient.invalidateQueries({ queryKey: paymentProviderKeys.root })
        }}
      />
    </>
  )
}

/**
 * Entering keys, for a new connection or a replacement.
 *
 * One dialog for both because the fields are identical and the difference is
 * one endpoint. A rotate never shows what it is replacing — there is nothing to
 * show, and a form that pre-filled a secret would be a form that leaked one.
 */
/**
 * The callback address, with a way to copy it.
 *
 * Shown on a connected provider rather than in the connect dialog, because it
 * is the answer to the question that comes AFTER the key is in: "it is
 * connected, so why has nothing confirmed?"
 */
function WebhookHint({ provider, label }: { provider: PaymentProviderKey; label: string }) {
  const url = webhookUrlFor(provider)
  const [copied, setCopied] = useState(false)

  return (
    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
      <p className="text-2xs text-gray-600">
        Paste this into {label} as the webhook URL, or payments will not confirm on their own:
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-2xs text-gray-900">{url}</code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
              .catch(() => toast.error('Could not copy. Select the address and copy it by hand.'))
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

function CredentialDialog({
  provider,
  connection,
  onClose,
  onSaved,
}: {
  provider: PaymentProviderKey | null
  /** Present when replacing a key rather than connecting. */
  connection: ProviderConnection | null
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setup = provider ? PROVIDER_SETUP[provider] : null

  /* The API names the fields it wants on the connection itself; the static map
   * is the fallback for a provider nobody has connected yet. */
  const fields = useMemo(() => {
    if (connection?.credential_fields?.length) {
      return connection.credential_fields.map((name) => ({
        name,
        label: setup?.fields.find((field) => field.name === name)?.label ?? name,
        hint: setup?.fields.find((field) => field.name === name)?.hint,
      }))
    }
    return setup?.fields ?? []
  }, [connection, setup])

  const save = useMutation({
    mutationFn: () => {
      const credentials = Object.fromEntries(
        fields.map((field) => [field.name, (values[field.name] ?? '').trim()]),
      )

      return connection
        ? paymentProvidersApi.rotate(connection.id, credentials)
        : paymentProvidersApi.connect({
            provider: provider!,
            display_name: setup?.label,
            credentials,
          })
    },
    onSuccess: () => {
      setValues({})
      setErrors({})
      toast.success(
        connection
          ? 'Key replaced. New payments use it immediately.'
          : `${setup?.label} connected. Families can pay through it now.`,
      )
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors()
        setErrors(fieldErrors)
        if (Object.keys(fieldErrors).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That could not be saved.')
    },
  })

  const complete = fields.every((field) => (values[field.name] ?? '').trim() !== '')

  return (
    <Modal
      open={provider !== null}
      onClose={() => {
        setValues({})
        onClose()
      }}
      title={connection ? `Replace the ${setup?.label} key` : `Connect ${setup?.label}`}
      description={
        connection
          ? 'The current key is never shown. Entering a new one replaces it for the next payment onwards.'
          : setup?.docs
      }
      footer={
        <>
          <Button
            onClick={() => {
              setValues({})
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!complete}
            onClick={() => save.mutate()}
          >
            {connection ? 'Replace key' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            required
            hint={field.hint}
            error={errors[`credentials.${field.name}`] ?? errors.credentials}
          >
            {(props) => (
              <Input
                {...props}
                /* A secret. Never a text input, and never pre-filled. */
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={values[field.name] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.currentTarget.value }))
                }
              />
            )}
          </Field>
        ))}

        <p className="pt-1 text-2xs text-gray-500">
          Keys are stored encrypted and are never sent back to this screen — only a short
          fingerprint, so you can tell that the right one landed.
        </p>
      </div>
    </Modal>
  )
}
