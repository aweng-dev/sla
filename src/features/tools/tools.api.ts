import { command, del, get, getPage, http, patch, post, put } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import type {
  ApprovalChain,
  ApprovalWorkflow,
  CustomField,
  CustomFieldRecordType,
  DocumentRecord,
  DocumentShare,
  DocumentVersion,
  ImportJob,
  ImportRow,
  IntegrationConnection,
  IntegrationProvider,
  SyncRun,
  WebhookDelivery,
  WebhookEndpoint,
  WorkflowSubjectType,
} from './tools.types'

export const toolsKeys = {
  all: ['tools'] as const,
  documents: (params?: unknown) => ['tools', 'documents', params] as const,
  document: (id: string) => ['tools', 'document', id] as const,
  versions: (id: string) => ['tools', 'document-versions', id] as const,
  shares: (id: string) => ['tools', 'document-shares', id] as const,
  accessLogs: (id: string) => ['tools', 'document-logs', id] as const,
  approvals: (params?: unknown) => ['tools', 'approvals', params] as const,
  approval: (id: string) => ['tools', 'approval', id] as const,
  chains: (params?: unknown) => ['tools', 'chains', params] as const,
  chain: (id: string) => ['tools', 'chain', id] as const,
  customFields: (recordType: string, includeArchived?: boolean) =>
    ['tools', 'custom-fields', recordType, includeArchived] as const,
  imports: (params?: unknown) => ['tools', 'imports', params] as const,
  importJob: (id: string) => ['tools', 'import', id] as const,
  importRows: (id: string, params?: unknown) => ['tools', 'import-rows', id, params] as const,
  connections: (params?: unknown) => ['tools', 'connections', params] as const,
  syncs: (connectionId: string) => ['tools', 'syncs', connectionId] as const,
  endpoints: (params?: unknown) => ['tools', 'endpoints', params] as const,
  deliveries: (endpointId: string) => ['tools', 'deliveries', endpointId] as const,
} as const

export const toolsApi = {
  /* ── Documents ──────────────────────────────────────────────────────── */

  documents: (params?: Record<string, unknown>): Promise<Paginated<DocumentRecord>> =>
    getPage<DocumentRecord>('/admin/documents', { params: prune(params ?? {}) }),

  document: (id: string) => get<DocumentRecord>(`/admin/documents/${id}`),

  /**
   * Upload.
   *
   * Multipart, and POST rather than PUT because PHP only populates `$_FILES`
   * on POST. The `Content-Type` header is deliberately left unset so the
   * browser writes its own boundary — setting it by hand produces a body the
   * server cannot parse.
   */
  upload: async (form: FormData): Promise<DocumentRecord> => {
    const response = await http.post('/admin/documents', form, {
      headers: { 'Content-Type': undefined as unknown as string },
    })
    return response.data.data as DocumentRecord
  },

  removeDocument: (id: string) => del(`/admin/documents/${id}`),

  moveDocument: (id: string, folderId: string | null) =>
    command(`/admin/documents/${id}/move`, { document_folder_id: folderId }),

  versions: (id: string) => get<DocumentVersion[]>(`/admin/documents/${id}/versions`),

  shares: (id: string) => get<DocumentShare[]>(`/admin/documents/${id}/shares`),

  share: (
    id: string,
    payload: {
      shared_with_user_id?: string | null
      shared_with_role?: string | null
      can_download?: boolean
      expires_at?: string | null
    },
  ) => post<DocumentShare>(`/admin/documents/${id}/shares`, payload),

  unshare: (id: string, shareId: string) => del(`/admin/documents/${id}/shares/${shareId}`),

  /* ── Workflow ───────────────────────────────────────────────────────── */

  approvals: (params?: Record<string, unknown>): Promise<Paginated<ApprovalWorkflow>> =>
    getPage<ApprovalWorkflow>('/admin/approvals', { params: prune(params ?? {}) }),

  approval: (id: string) => get<ApprovalWorkflow>(`/admin/approvals/${id}`),

  /** `approve: false` is a rejection — the same endpoint, not a separate one. */
  decide: (id: string, payload: { approve: boolean; notes?: string | null }) =>
    post<ApprovalWorkflow>(`/admin/approvals/${id}/decide`, payload),

  cancelApproval: (id: string, reason: string) =>
    post<ApprovalWorkflow>(`/admin/approvals/${id}/cancel`, { reason }),

  chains: (params?: Record<string, unknown>): Promise<Paginated<ApprovalChain>> =>
    getPage<ApprovalChain>('/admin/approval-chains', { params: prune(params ?? {}) }),

  chain: (id: string) => get<ApprovalChain>(`/admin/approval-chains/${id}`),

  createChain: (payload: {
    subject_type: WorkflowSubjectType
    key: string
    name: string
    description?: string | null
    steps: {
      name: string
      approver_role?: string | null
      approver_staff_id?: string | null
      required_permission?: string | null
      is_optional?: boolean
    }[]
  }) => post<ApprovalChain>('/admin/approval-chains', payload),

  /* ── Custom fields ──────────────────────────────────────────────────── */

  /**
   * The catalogue for ONE record kind.
   *
   * `record_type` is required — the endpoint 422s without it, because a field
   * only means anything against the record it extends. There is deliberately
   * no "all custom fields" view for the same reason.
   */
  customFields: (recordType: CustomFieldRecordType, includeArchived = false) =>
    get<CustomField[]>('/admin/custom-fields', {
      params: { record_type: recordType, include_archived: includeArchived || undefined },
    }),

  createCustomField: (payload: {
    record_type: CustomFieldRecordType
    key: string
    label: string
    field_type: string
    help_text?: string | null
    is_required?: boolean
    position?: number
    options?: string[]
  }) => post<CustomField>('/admin/custom-fields', payload),

  updateCustomField: (id: string, payload: Record<string, unknown>) =>
    patch<CustomField>(`/admin/custom-fields/${id}`, payload),

  /** Archived rather than deleted: values already recorded against the field
   *  keep their meaning, and the field stops being offered on new records. */
  archiveCustomField: (id: string) => post<CustomField>(`/admin/custom-fields/${id}/archive`),

  /* ── Import ─────────────────────────────────────────────────────────── */

  imports: (params?: Record<string, unknown>): Promise<Paginated<ImportJob>> =>
    getPage<ImportJob>('/admin/imports', { params: prune(params ?? {}) }),

  importJob: (id: string) => get<ImportJob>(`/admin/imports/${id}`),

  importRows: (id: string, params?: Record<string, unknown>): Promise<Paginated<ImportRow>> =>
    getPage<ImportRow>(`/admin/imports/${id}/rows`, { params: prune(params ?? {}) }),

  /** Uploads and VALIDATES. Nothing is written until `commitImport`. */
  createImport: async (form: FormData): Promise<ImportJob> => {
    const response = await http.post('/admin/imports', form, {
      headers: { 'Content-Type': undefined as unknown as string },
    })
    return response.data.data as ImportJob
  },

  commitImport: (id: string) => post<ImportJob>(`/admin/imports/${id}/commit`),

  discardImport: (id: string) => del(`/admin/imports/${id}`),

  /* ── Integrations ───────────────────────────────────────────────────── */

  connections: (params?: Record<string, unknown>): Promise<Paginated<IntegrationConnection>> =>
    getPage<IntegrationConnection>('/admin/integrations/connections', { params: prune(params ?? {}) }),

  connect: (payload: {
    provider: IntegrationProvider
    key?: string | null
    display_name?: string | null
    credentials: Record<string, string>
    config?: Record<string, unknown>
  }) => post<IntegrationConnection>('/admin/integrations/connections', payload),

  updateConnection: (id: string, payload: Record<string, unknown>) =>
    patch<IntegrationConnection>(`/admin/integrations/connections/${id}`, payload),

  disconnect: (id: string) => del(`/admin/integrations/connections/${id}`),

  rotateCredential: (id: string, credentials: Record<string, string>) =>
    post(`/admin/integrations/connections/${id}/rotate-credential`, { credentials }),

  syncs: (connectionId: string): Promise<Paginated<SyncRun>> =>
    getPage<SyncRun>(`/admin/integrations/connections/${connectionId}/syncs`),

  startSync: (connectionId: string) =>
    post<SyncRun>(`/admin/integrations/connections/${connectionId}/syncs`),

  /* ── Webhooks ───────────────────────────────────────────────────────── */

  endpoints: (params?: Record<string, unknown>): Promise<Paginated<WebhookEndpoint>> =>
    getPage<WebhookEndpoint>('/admin/webhooks/endpoints', { params: prune(params ?? {}) }),

  createEndpoint: (payload: {
    name: string
    url: string
    secret: string
    description?: string | null
  }) => post<WebhookEndpoint>('/admin/webhooks/endpoints', payload),

  updateEndpoint: (id: string, payload: Record<string, unknown>) =>
    patch<WebhookEndpoint>(`/admin/webhooks/endpoints/${id}`, payload),

  removeEndpoint: (id: string) => del(`/admin/webhooks/endpoints/${id}`),

  setSubscriptions: (id: string, events: string[]) =>
    put(`/admin/webhooks/endpoints/${id}/subscriptions`, { events }),

  rotateSecret: (id: string, secret: string) =>
    post(`/admin/webhooks/endpoints/${id}/rotate-secret`, { secret }),

  deliveries: (endpointId: string): Promise<Paginated<WebhookDelivery>> =>
    getPage<WebhookDelivery>(`/admin/webhooks/endpoints/${endpointId}/deliveries`),

  replayDelivery: (deliveryId: string) =>
    post(`/admin/webhooks/deliveries/${deliveryId}/replay`),
}

/** Drop empty filters — `category=""` is not the same request as an absent
 *  `category`, and the API would filter on an empty string. */
function prune<T extends object>(params: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v === null || v === undefined || v === false) continue
    out[k] = v
  }
  return out as Partial<T>
}

/** A webhook secret the API will accept: at least 32 characters. Generated in
 *  the browser so it is never transmitted from anywhere else, and shown once. */
export function generateSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Pull a document down through the authenticated client — the endpoint
 *  streams bytes and hands out no URL, so it cannot be a plain link. */
export async function downloadDocument(doc: DocumentRecord): Promise<void> {
  const response = await http.get<Blob>(`/admin/documents/${doc.id}/download`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = doc.current_version?.original_filename ?? doc.title
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
