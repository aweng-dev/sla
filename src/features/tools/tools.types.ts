/**
 * The Tools domain — five modules the API groups under `platform_services`.
 *
 * They share a directory because they share nothing else: each is a small,
 * self-contained utility, and giving each its own feature folder would be five
 * folders of two files. What they do have in common is that every one of them
 * is EMPTY on a fresh institution, so the empty state is the screen most
 * readers will actually see, and it has to explain what the thing is for.
 */

/* ── Documents ─────────────────────────────────────────────────────────────*/

export type DocumentCategory = 'identity' | 'academic' | 'medical' | 'financial' | 'policy' | 'other'
/** Who a document is visible to. NOT a permission — every route behind it
 *  re-runs its own check; this narrows what is offered. */
export type DocumentVisibility = 'staff' | 'students' | 'guardians' | 'public'

export interface DocumentVersion {
  id: string
  version: number
  byte_size: number | null
  mime_type: string | null
  original_filename: string | null
  created_at: string
  [key: string]: unknown
}

export interface DocumentRecord {
  id: string
  document_folder_id: string | null
  owner_type: string | null
  owner_id: string | null
  title: string
  description: string | null
  category: DocumentCategory | null
  visibility: DocumentVisibility | null
  is_confidential: boolean
  created_by_user_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  archived_at: string | null
  current_version: DocumentVersion | null
  versions?: DocumentVersion[]
}

export interface DocumentShare {
  id: string
  document_id: string
  shared_with_user_id: string | null
  shared_with_role: string | null
  can_download: boolean
  expires_at: string | null
  [key: string]: unknown
}

/* ── Workflow and approvals ────────────────────────────────────────────────*/

export type WorkflowSubjectType = 'leave_request' | 'payroll_run' | 'gradebook' | 'application'
export type WorkflowStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn'
export type StepStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export interface ApprovalStep {
  id: string
  name: string
  position?: number
  status?: StepStatus
  approver_staff_id: string | null
  approver_role: string | null
  required_permission: string | null
  is_optional: boolean
  decided_at?: string | null
  notes?: string | null
  [key: string]: unknown
}

export interface ApprovalChain {
  id: string
  subject_type: WorkflowSubjectType
  key: string
  name: string
  description: string | null
  steps: ApprovalStep[]
  [key: string]: unknown
}

export interface ApprovalWorkflow {
  id: string
  approval_chain_id: string | null
  subject_type: WorkflowSubjectType
  subject_id: string | null
  status: WorkflowStatus
  current_step?: number | null
  steps?: ApprovalStep[]
  created_at: string
  [key: string]: unknown
}

/* ── Custom fields ─────────────────────────────────────────────────────────*/

/** The three record kinds the API lets an institution extend. */
export type CustomFieldRecordType = 'student' | 'staff' | 'application'
export type CustomFieldType = 'text' | 'long_text' | 'number' | 'date' | 'boolean' | 'select'

export interface CustomField {
  id: string
  record_type: CustomFieldRecordType
  /** Snake case, starts with a letter — the API enforces
   *  `/^[a-z][a-z0-9_]*$/` because the key becomes a column name in exports. */
  key: string
  label: string
  field_type: CustomFieldType
  help_text: string | null
  is_required: boolean
  position: number
  options: string[] | null
  archived_at?: string | null
  [key: string]: unknown
}

/* ── Import and export ─────────────────────────────────────────────────────*/

export type ImportEntity = 'students' | 'staff' | 'courses'

export interface ImportJob {
  id: string
  entity: ImportEntity
  status: string
  original_filename?: string | null
  total_rows?: number | null
  valid_rows?: number | null
  invalid_rows?: number | null
  committed_at?: string | null
  created_at: string
  [key: string]: unknown
}

export interface ImportRow {
  id: string
  row_number: number
  is_valid?: boolean
  errors?: { field?: string; message: string }[] | null
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/* ── Integrations ──────────────────────────────────────────────────────────*/

export type IntegrationProvider =
  | 'paystack'
  | 'flutterwave'
  | 'stripe'
  | 'sendgrid'
  | 'mailgun'
  | 'twilio'
  | 'whatsapp_cloud'
  | 'google_workspace'
  | 'zoom'

export interface IntegrationConnection {
  id: string
  provider: IntegrationProvider
  key: string | null
  display_name: string | null
  status?: string
  config?: Record<string, unknown> | null
  last_synced_at?: string | null
  created_at: string
  [key: string]: unknown
}

export interface SyncRun {
  id: string
  connection_id?: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  [key: string]: unknown
}

export interface WebhookEndpoint {
  id: string
  name: string
  url: string
  description: string | null
  is_active?: boolean
  subscriptions?: string[]
  created_at: string
  [key: string]: unknown
}

export interface WebhookDelivery {
  id: string
  endpoint_id?: string
  event?: string
  status: string
  response_status?: number | null
  attempts?: number
  created_at: string
  [key: string]: unknown
}
