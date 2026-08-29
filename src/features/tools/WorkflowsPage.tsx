import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle, FlowArrow, Plus, XCircle } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
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
import { toolsApi, toolsKeys } from './tools.api'
import type { ApprovalChain, ApprovalWorkflow, WorkflowStatus, WorkflowSubjectType } from './tools.types'

const SUBJECTS: WorkflowSubjectType[] = ['leave_request', 'payroll_run', 'gradebook', 'application']

/**
 * Who has to say yes, and what is waiting on them.
 *
 * Two halves that are easy to confuse: a CHAIN is the rule ("a leave request
 * needs the head of department, then HR"), and an APPROVAL is one journey
 * through that rule for one record. Chains are configured once; approvals
 * arrive continuously and are the half somebody opens this screen to act on —
 * so they lead.
 */
export function WorkflowsPage() {
  const perms = usePermissions()
  const [tab, setTab] = useState<'approvals' | 'chains'>('approvals')
  const baseId = 'workflow-tabs'

  return (
    <PageStack>
      <PageHeader
        title="Workflow and approvals"
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={[
              { key: 'approvals', label: 'Waiting' },
              { key: 'chains', label: 'Approval chains' },
            ]}
            value={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />
        }
      />

      <div role="tabpanel" id={panelId(baseId, tab)} aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === 'approvals' ? (
          <ApprovalsTab canManage={perms.has('workflow.manage')} />
        ) : (
          <ChainsTab canManage={perms.has('workflow.manage')} />
        )}
      </div>
    </PageStack>
  )
}

function ApprovalsTab({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1)
  const [deciding, setDeciding] = useState<{ workflow: ApprovalWorkflow; approve: boolean } | null>(null)

  const query = useQuery({
    queryKey: toolsKeys.approvals({ page }),
    queryFn: () => toolsApi.approvals({ page, per_page: 25 }),
    placeholderData: (prev) => prev,
  })

  const columns: Column<ApprovalWorkflow>[] = [
    {
      key: 'subject',
      header: 'What',
      cell: (row) => <span className="text-gray-900">{humanize(row.subject_type)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '10rem',
      cell: (row) => <WorkflowStatusBadge status={row.status} />,
    },
    {
      key: 'step',
      header: 'Step',
      width: '8rem',
      cell: (row) =>
        row.current_step != null && row.steps ? (
          <span className="tabular text-gray-700">
            {row.current_step} of {row.steps.length}
          </span>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Raised',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{formatRelative(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '11rem',
      cell: (row) =>
        canManage && row.status === 'pending' ? (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              icon={<XCircle size={13} />}
              onClick={() => setDeciding({ workflow: row, approve: false })}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<CheckCircle size={13} weight="fill" />}
              onClick={() => setDeciding({ workflow: row, approve: true })}
            >
              Approve
            </Button>
          </div>
        ) : null,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []

  return (
    <>
      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<FlowArrow size={20} />}
          title="Nothing is waiting for a decision"
          description="When a leave request, payroll run, gradebook or application needs sign-off, it appears here for whoever the chain names."
        />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={5}
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      {deciding && (
        <DecideDialog
          workflow={deciding.workflow}
          approve={deciding.approve}
          open
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  )
}

function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  if (status === 'approved') return <Badge tone="success">Approved</Badge>
  if (status === 'rejected') return <Badge tone="danger">Rejected</Badge>
  if (status === 'pending') return <Badge tone="warning">Waiting</Badge>
  return <Badge tone="outline">{humanize(status)}</Badge>
}

function DecideDialog({
  workflow,
  approve,
  open,
  onClose,
}: {
  workflow: ApprovalWorkflow
  approve: boolean
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState('')

  const decide = useMutation({
    mutationFn: () => toolsApi.decide(workflow.id, { approve, notes: notes.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success(approve ? 'Approved' : 'Rejected')
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'The decision failed.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={approve ? 'Approve this?' : 'Reject this?'}
      description={
        approve
          ? 'It moves to the next step, or completes if this was the last one.'
          : 'The whole request is refused. Later steps are not asked.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button
            variant={approve ? 'primary' : 'danger'}
            loading={decide.isPending}
            onClick={() => decide.mutate()}
          >
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <Field label="Notes" hint="Optional. Kept against the decision.">
        {(props) => (
          <Textarea {...props} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </Modal>
  )
}

function ChainsTab({ canManage }: { canManage: boolean }) {
  const [creating, setCreating] = useState(false)
  const query = useQuery({
    queryKey: toolsKeys.chains(),
    queryFn: () => toolsApi.chains({ per_page: 50 }),
  })

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
              New chain
            </Button>
          )
        }
      />

      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<FlowArrow size={20} />}
          title="No approval chains"
          description="A chain says who must sign off on a kind of record, and in what order. Without one, nothing is held for approval."
          action={
            canManage ? (
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New chain
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((chain: ApprovalChain) => (
            <Card key={chain.id}>
              <CardHeader
                title={chain.name}
                subtitle={`${humanize(chain.subject_type)} · ${chain.steps.length} step${chain.steps.length === 1 ? '' : 's'}`}
              />
              <CardBody className="p-0">
                <ol className="divide-y divide-gray-200">
                  {chain.steps.map((step, i) => (
                    <li key={step.id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xs font-medium tabular text-gray-700">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{step.name}</span>
                      <span className="shrink-0 text-2xs text-gray-600">
                        {step.approver_role
                          ? humanize(step.approver_role)
                          : step.required_permission
                            ? step.required_permission
                            : 'Named approver'}
                      </span>
                      {step.is_optional && <Badge tone="outline">Optional</Badge>}
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <NewChainDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function NewChainDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState<WorkflowSubjectType>('leave_request')
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [steps, setSteps] = useState<{ name: string; approver_role: string }[]>([
    { name: '', approver_role: '' },
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () =>
      toolsApi.createChain({
        subject_type: subject,
        key: key.trim(),
        name: name.trim(),
        steps: steps
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim(), approver_role: s.approver_role.trim() || null })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Chain created')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const merged: Record<string, string> = {}
        for (const [f, m] of Object.entries(error.fieldErrors())) {
          merged[f.startsWith('steps') ? 'steps' : f] = m
        }
        setErrors(merged)
        if (Object.keys(merged).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The chain could not be created.')
    },
  })

  const valid = name.trim() && key.trim() && steps.some((s) => s.name.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New approval chain"
      description="Who must sign off, and in what order."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Create chain
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Applies to" required error={errors.subject_type}>
          {(props) => (
            <Select
              {...props}
              value={subject}
              onChange={(e) => setSubject(e.target.value as WorkflowSubjectType)}
              options={SUBJECTS.map((s) => ({ value: s, label: humanize(s) }))}
            />
          )}
        </Field>
        <Field label="Name" required error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave — head of department then HR"
            />
          )}
        </Field>
        <Field label="Key" required error={errors.key} hint="A short identifier, unique per institution.">
          {(props) => (
            <Input
              {...props}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="leave_standard"
            />
          )}
        </Field>

        <div className="mt-2 border-t border-gray-200 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Steps</h3>
          <p className="mb-3 text-xs text-gray-600">
            Asked in order. Up to 20. A step with no role named waits for a specific person.
          </p>
          {errors.steps && (
            <p role="alert" className="mb-2 text-xs text-danger-500">
              {errors.steps}
            </p>
          )}
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xs font-medium tabular text-gray-700">
                  {i + 1}
                </span>
                <Input
                  value={step.name}
                  placeholder="Head of department"
                  onChange={(e) =>
                    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))
                  }
                />
                <Input
                  value={step.approver_role}
                  placeholder="Role (optional)"
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, approver_role: e.target.value } : s)),
                    )
                  }
                />
                {steps.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <XCircle size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {steps.length < 20 && (
            <Button
              size="sm"
              className="mt-2"
              icon={<Plus size={13} weight="bold" />}
              onClick={() => setSteps((prev) => [...prev, { name: '', approver_role: '' }])}
            >
              Add step
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
