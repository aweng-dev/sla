import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowClockwise, Copy, Plugs, Plus, Trash, WebhooksLogo } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toolbar,
  panelId,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { PageHeader } from '@/shared/ui'
import { formatRelative, humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { generateSecret, toolsApi, toolsKeys } from './tools.api'
import type { IntegrationConnection, IntegrationProvider, WebhookEndpoint } from './tools.types'

const PROVIDERS: IntegrationProvider[] = [
  'paystack',
  'flutterwave',
  'stripe',
  'sendgrid',
  'mailgun',
  'twilio',
  'whatsapp_cloud',
  'google_workspace',
  'zoom',
]

/** The credential field each provider actually wants. Named per provider so the
 *  form asks for "Secret key" rather than a generic blob the reader has to
 *  guess the shape of. */
const CREDENTIAL_FIELDS: Record<string, { key: string; label: string }[]> = {
  paystack: [{ key: 'secret_key', label: 'Secret key' }],
  flutterwave: [{ key: 'secret_key', label: 'Secret key' }],
  stripe: [{ key: 'secret_key', label: 'Secret key' }],
  sendgrid: [{ key: 'api_key', label: 'API key' }],
  mailgun: [
    { key: 'api_key', label: 'API key' },
    { key: 'domain', label: 'Sending domain' },
  ],
  twilio: [
    { key: 'account_sid', label: 'Account SID' },
    { key: 'auth_token', label: 'Auth token' },
  ],
  whatsapp_cloud: [
    { key: 'access_token', label: 'Access token' },
    { key: 'phone_number_id', label: 'Phone number id' },
  ],
  google_workspace: [{ key: 'service_account_json', label: 'Service account JSON' }],
  zoom: [
    { key: 'account_id', label: 'Account id' },
    { key: 'client_id', label: 'Client id' },
    { key: 'client_secret', label: 'Client secret' },
  ],
}

/**
 * What this institution is wired to.
 *
 * ── Two different things, deliberately on one screen ───────────────────────
 *
 *   CONNECTIONS  outbound — we hold a credential and call somebody else.
 *   WEBHOOKS     inbound — somebody else calls us, and we verify a signature.
 *
 * A credential is never read back: the API stores it and returns nothing, so
 * the only honest operations are "set" and "rotate". The forms say so rather
 * than showing an empty box that looks like a bug.
 */
export function IntegrationsPage() {
  const perms = usePermissions()
  const [tab, setTab] = useState<'connections' | 'webhooks'>('connections')
  const baseId = 'integrations-tabs'

  return (
    <PageStack>
      <PageHeader
        title="Integrations"
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={[
              { key: 'connections', label: 'Connections' },
              { key: 'webhooks', label: 'Webhooks' },
            ]}
            value={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />
        }
      />

      <div role="tabpanel" id={panelId(baseId, tab)} aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === 'connections' ? (
          <ConnectionsTab canManage={perms.has('integrations.manage')} />
        ) : (
          <WebhooksTab canManage={perms.has('integrations.manage')} />
        )}
      </div>
    </PageStack>
  )
}

function ConnectionsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)

  const query = useQuery({
    queryKey: toolsKeys.connections(),
    queryFn: () => toolsApi.connections({ per_page: 50 }),
  })

  const sync = useMutation({
    mutationFn: (id: string) => toolsApi.startSync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Sync started')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not start a sync.'),
  })

  const disconnect = useMutation({
    mutationFn: (id: string) => toolsApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Disconnected')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not disconnect.'),
  })

  const columns: Column<IntegrationConnection>[] = [
    {
      key: 'provider',
      header: 'Provider',
      cell: (row) => (
        <div className="min-w-0">
          <div className="text-sm text-gray-900">{humanize(row.provider)}</div>
          {row.display_name && <div className="truncate text-2xs text-gray-600">{row.display_name}</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (row) =>
        row.status ? <Badge tone="neutral">{humanize(row.status)}</Badge> : <Badge tone="success">Connected</Badge>,
    },
    {
      key: 'last_sync',
      header: 'Last sync',
      width: '10rem',
      cell: (row) =>
        row.last_synced_at ? (
          <span className="text-gray-700">{formatRelative(row.last_synced_at)}</span>
        ) : (
          <span className="text-gray-500">Never</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '9rem',
      cell: (row) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Sync ${row.provider}`}
              loading={sync.isPending && sync.variables === row.id}
              onClick={() => sync.mutate(row.id)}
            >
              <ArrowClockwise size={14} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Disconnect ${row.provider}`}
              loading={disconnect.isPending && disconnect.variables === row.id}
              onClick={() => disconnect.mutate(row.id)}
            >
              <Trash size={14} />
            </Button>
          </div>
        ) : null,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []

  return (
    <>
      <Toolbar
        actions={
          canManage && (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setConnecting(true)}
            >
              Connect a provider
            </Button>
          )
        }
      />

      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<Plugs size={20} />}
          title="Nothing connected"
          description="Payment providers, email and SMS senders, calendars. Credentials are stored by the API and never read back — only set and rotated."
          action={
            canManage ? (
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setConnecting(true)}
              >
                Connect a provider
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          skeletonRows={4}
        />
      )}

      <ConnectDialog open={connecting} onClose={() => setConnecting(false)} />
    </>
  )
}

function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<IntegrationProvider>('paystack')
  const [displayName, setDisplayName] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fields = CREDENTIAL_FIELDS[provider] ?? [{ key: 'api_key', label: 'API key' }]

  const connect = useMutation({
    mutationFn: () =>
      toolsApi.connect({
        provider,
        display_name: displayName.trim() || null,
        credentials,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Connected')
      setCredentials({})
      setDisplayName('')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const merged: Record<string, string> = {}
        for (const [f, m] of Object.entries(error.fieldErrors())) {
          merged[f.startsWith('credentials') ? 'credentials' : f] = m
        }
        setErrors(merged)
        if (Object.keys(merged).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The connection failed.')
    },
  })

  const ready = fields.every((f) => (credentials[f.key] ?? '').trim().length > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect a provider"
      description="The credential is stored by the API and never shown again."
      footer={
        <>
          <Button onClick={onClose} disabled={connect.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={connect.isPending}
            disabled={!ready}
            onClick={() => {
              setErrors({})
              connect.mutate()
            }}
          >
            Connect
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Provider" required error={errors.provider}>
          {(props) => (
            <Select
              {...props}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as IntegrationProvider)
                setCredentials({})
              }}
              options={PROVIDERS.map((p) => ({ value: p, label: humanize(p) }))}
            />
          )}
        </Field>
        <Field label="Label" error={errors.display_name} hint="Optional. Useful when two of the same provider are connected.">
          {(props) => (
            <Input {...props} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          )}
        </Field>
        {errors.credentials && (
          <p role="alert" className="mb-1 text-xs text-danger-500">
            {errors.credentials}
          </p>
        )}
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required>
            {(props) =>
              f.key === 'service_account_json' ? (
                <Textarea
                  {...props}
                  rows={4}
                  value={credentials[f.key] ?? ''}
                  onChange={(e) => setCredentials((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  {...props}
                  type="password"
                  autoComplete="off"
                  value={credentials[f.key] ?? ''}
                  onChange={(e) => setCredentials((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              )
            }
          </Field>
        ))}
      </div>
    </Modal>
  )
}

function WebhooksTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: toolsKeys.endpoints(),
    queryFn: () => toolsApi.endpoints({ per_page: 50 }),
    retry: false,
  })

  const remove = useMutation({
    mutationFn: (id: string) => toolsApi.removeEndpoint(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Endpoint removed')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not remove it.'),
  })

  const columns: Column<WebhookEndpoint>[] = [
    {
      key: 'name',
      header: 'Endpoint',
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-900">{row.name}</div>
          <div className="truncate text-2xs text-gray-600">{row.url}</div>
        </div>
      ),
    },
    {
      key: 'events',
      header: 'Events',
      numeric: true,
      width: '7rem',
      cell: (row) => row.subscriptions?.length ?? <span className="text-gray-500">—</span>,
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{formatRelative(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '4rem',
      cell: (row) =>
        canManage ? (
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${row.name}`}
              loading={remove.isPending && remove.variables === row.id}
              onClick={() => remove.mutate(row.id)}
            >
              <Trash size={14} />
            </Button>
          </div>
        ) : null,
    },
  ]

  /* The API answers 403 "This feature has been turned off for this
   * institution" when webhooks are not part of the plan. That is a real
   * answer, not a failure, and it deserves its own state rather than an
   * error card. */
  const featureOff =
    query.isError && query.error instanceof ApiError && query.error.isForbidden

  if (featureOff) {
    return (
      <EmptyState
        icon={<WebhooksLogo size={20} />}
        title="Webhooks are not enabled here"
        description="Inbound webhooks are switched off for this institution. A platform administrator can turn them on."
      />
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []

  return (
    <>
      <Toolbar
        actions={
          canManage && (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New endpoint
            </Button>
          )
        }
      />

      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<WebhooksLogo size={20} />}
          title="No endpoints"
          description="An endpoint is a URL of yours that we call when something happens here. Each carries a shared secret so you can verify the call really came from us."
          action={
            canManage ? (
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New endpoint
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          skeletonRows={4}
        />
      )}

      <NewEndpointDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function NewEndpointDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState(() => generateSecret())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () => toolsApi.createEndpoint({ name: name.trim(), url: url.trim(), secret }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Endpoint registered')
      setName('')
      setUrl('')
      setSecret(generateSecret())
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The endpoint could not be registered.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New webhook endpoint"
      description="We call this URL when something happens here."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || !url.trim()}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Register
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Name" required error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finance system"
              autoFocus
            />
          )}
        </Field>
        <Field label="URL" required error={errors.url} hint="Must be https.">
          {(props) => (
            <Input
              {...props}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.org/hooks/schoollink"
            />
          )}
        </Field>
        <Field
          label="Signing secret"
          required
          error={errors.secret}
          hint="Generated in your browser. Copy it now — it is not shown again."
        >
          {(props) => (
            <div className="flex items-center gap-2">
              <Input {...props} value={secret} readOnly className="font-mono text-xs" />
              <Button
                size="icon"
                aria-label="Copy the signing secret"
                onClick={() => {
                  navigator.clipboard?.writeText(secret)
                  toast.success('Secret copied')
                }}
              >
                <Copy size={14} />
              </Button>
              <Button size="sm" onClick={() => setSecret(generateSecret())}>
                New
              </Button>
            </div>
          )}
        </Field>
      </div>
    </Modal>
  )
}
