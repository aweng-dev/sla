import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CaretRight, ListChecks, Plus, UsersThree } from '@phosphor-icons/react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  Toolbar,
} from '@/shared/ui'
import { get } from '@/shared/api/client'
import { formatMoney } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys, toMinor } from './finance.api'
import { MoneyInput } from './components/money'
import { StudentPicker } from './dialogs/useStudentPicker'
import { useFinanceMutation } from './dialogs/useFinanceMutation'
import { useSessions } from './dialogs/InvoiceDialogs'
import type { FeeStructure } from './finance.types'

interface CatalogRow {
  id: string
  name: string
  code?: string | null
}

/**
 * What a place costs.
 *
 * A structure is a named set of items for a session. It is the thing invoices
 * are generated FROM, which is why assigning one to a learner, a programme or
 * a year group is the action that matters here — an unassigned structure
 * charges nobody.
 */
export function FeeStructuresTab() {
  const perms = usePermissions()
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addingItemTo, setAddingItemTo] = useState<FeeStructure | null>(null)
  const [assigning, setAssigning] = useState<FeeStructure | null>(null)

  const query = useQuery({
    queryKey: financeKeys.structures(),
    queryFn: () => financeApi.structures({ per_page: 50 }),
  })

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []

  return (
    <>
      <Toolbar
        actions={
          perms.has('finance.manage') && (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New structure
            </Button>
          )
        }
      />

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={20} />}
          title="No fee structures yet"
          description="A structure lists what a place costs for a session — tuition, books, anything optional. Invoices are generated from the structure assigned to a learner, so this comes first."
          action={
            perms.has('finance.manage') ? (
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New structure
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((structure) => {
            const open = expanded === structure.id
            const optional = structure.items.filter((i) => i.is_optional)
            return (
              <Card key={structure.id}>
                <CardHeader
                  title={
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : structure.id)}
                      aria-expanded={open}
                      className="flex items-center gap-1.5 text-left"
                    >
                      <CaretRight
                        size={11}
                        weight="bold"
                        className={cn(
                          'text-gray-500 transition-transform duration-150',
                          open && 'rotate-90',
                        )}
                      />
                      {structure.name}
                    </button>
                  }
                  subtitle={
                    <span className="tabular">
                      {structure.code} · {structure.items.length} item
                      {structure.items.length === 1 ? '' : 's'} ·{' '}
                      {formatMoney(structure.total_minor, structure.currency)}
                      {optional.length > 0 &&
                        ` (+${formatMoney(
                          structure.total_with_optional_minor - structure.total_minor,
                          structure.currency,
                        )} optional)`}
                    </span>
                  }
                  actions={
                    <>
                      {structure.status !== 'active' && (
                        <Badge tone="outline" className="capitalize">
                          {structure.status}
                        </Badge>
                      )}
                      {structure.is_assignable && (
                        <Badge tone="neutral">Assignable</Badge>
                      )}
                      {perms.has('finance.manage') && (
                        <>
                          <Button size="sm" onClick={() => setAddingItemTo(structure)}>
                            Add item
                          </Button>
                          <Button
                            size="sm"
                            icon={<UsersThree size={13} />}
                            disabled={!structure.is_assignable}
                            onClick={() => setAssigning(structure)}
                          >
                            Assign
                          </Button>
                        </>
                      )}
                    </>
                  }
                />
                {open && (
                  <CardBody className="p-0">
                    {structure.items.length === 0 ? (
                      <EmptyState
                        title="No items"
                        description="A structure with no items charges nothing. Add tuition, books, or whatever this place costs."
                      />
                    ) : (
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-gray-200 bg-table-head">
                            <th className="w-10 px-4 py-2 text-2xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-2xs font-medium text-gray-600">Item</th>
                            <th className="w-28 px-3 py-2 text-2xs font-medium text-gray-600">
                              Optional
                            </th>
                            <th className="w-32 px-4 py-2 text-right text-2xs font-medium text-gray-600">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...structure.items]
                            .sort((a, b) => a.sequence - b.sequence)
                            .map((item) => (
                              <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                                <td className="px-4 py-2 text-2xs tabular text-gray-500">
                                  {item.sequence}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-900">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-gray-700">
                                  {item.is_optional ? 'Optional' : '—'}
                                </td>
                                <td className="px-4 py-2 text-right text-sm tabular text-gray-900">
                                  {formatMoney(item.amount_minor, structure.currency)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </CardBody>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <NewStructureDialog open={creating} onClose={() => setCreating(false)} />
      {addingItemTo && (
        <AddItemDialog
          structure={addingItemTo}
          open
          onClose={() => setAddingItemTo(null)}
        />
      )}
      {assigning && (
        <AssignDialog structure={assigning} open onClose={() => setAssigning(null)} />
      )}
    </>
  )
}

function NewStructureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tenant } = useTenant()
  const sessions = useSessions()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setName('')
    setCode('')
    setDescription('')
    setErrors({})
    const current = sessions.data?.find((s) => s.is_current) ?? sessions.data?.[0]
    if (current) setSessionId(current.id)
  }, [open, sessions.data])

  const create = useFinanceMutation({
    mutationFn: () =>
      financeApi.createStructure({
        academic_session_id: sessionId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        currency: tenant.default_currency,
        status: 'active',
        description: description.trim() || null,
      }),
    success: 'Fee structure created',
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New fee structure"
      description="What a place costs for a session. Add the items next."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || !code.trim() || !sessionId}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Create
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
              placeholder="Tuition — 2026/2027"
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Code"
          required
          error={errors.code}
          hint="Unique within the institution. Upper case."
        >
          {(props) => (
            <Input
              {...props}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="TUITION-2027"
            />
          )}
        </Field>
        <Field label="Session" required error={errors.academic_session_id}>
          {(props) => (
            <Select
              {...props}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder={sessions.isLoading ? 'Loading…' : 'Choose a session'}
              options={(sessions.data ?? []).map((s) => ({
                value: s.id,
                label: s.is_current ? `${s.name} — current` : s.name,
              }))}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

function AddItemDialog({
  structure,
  open,
  onClose,
}: {
  structure: FeeStructure
  open: boolean
  onClose: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [optional, setOptional] = useState(false)
  const [refundable, setRefundable] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const categories = useQuery({
    queryKey: financeKeys.categories(),
    queryFn: financeApi.feeCategories,
    staleTime: 10 * 60_000,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setName('')
    setAmount('')
    setOptional(false)
    setRefundable(false)
    setErrors({})
    setCategoryId(categories.data?.[0]?.id ?? '')
  }, [open, categories.data])

  const add = useFinanceMutation({
    mutationFn: () =>
      financeApi.addItem(structure.id, {
        fee_category_id: categoryId,
        name: name.trim() || null,
        amount_minor: toMinor(amount, structure.currency),
        is_optional: optional,
        is_refundable: refundable,
      }),
    success: 'Item added',
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add an item to ${structure.name}`}
      footer={
        <>
          <Button onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={!categoryId}
            onClick={() => {
              setErrors({})
              add.mutate()
            }}
          >
            Add item
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Category" required error={errors.fee_category_id}>
          {(props) => (
            <Select
              {...props}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={categories.isLoading ? 'Loading…' : 'Choose a category'}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
        </Field>
        <Field label="Name" error={errors.name} hint="Left blank, the category's name is used.">
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Books and materials"
            />
          )}
        </Field>
        <Field label="Amount" required error={errors.amount_minor}>
          {(props) => (
            <MoneyInput
              {...props}
              value={amount}
              onChange={setAmount}
              currency={structure.currency}
            />
          )}
        </Field>

        <label className="mt-1 flex items-start gap-2.5">
          <Checkbox checked={optional} onChange={(e) => setOptional(e.target.checked)} />
          <span className="text-xs text-gray-700">
            <span className="font-medium text-gray-900">Optional</span> — excluded from the
            structure&rsquo;s total, and only charged when a family opts in.
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2.5">
          <Checkbox checked={refundable} onChange={(e) => setRefundable(e.target.checked)} />
          <span className="text-xs text-gray-700">
            <span className="font-medium text-gray-900">Refundable</span> — a deposit rather than a
            charge.
          </span>
        </label>
      </div>
    </Modal>
  )
}

/**
 * Assigning a structure decides who it charges.
 *
 * The API PROHIBITS `program_id` and `academic_level_id` alongside
 * `student_id`, so this is a single choice of target rather than three
 * independent fields — a form that let both be set would 422 on submit.
 */
function AssignDialog({
  structure,
  open,
  onClose,
}: {
  structure: FeeStructure
  open: boolean
  onClose: () => void
}) {
  const t = useTerminology()
  const [target, setTarget] = useState<'student' | 'program' | 'level'>('student')
  const [learner, setLearner] = useState<{ id: string; name: string } | null>(null)
  const [programId, setProgramId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [optionalIds, setOptionalIds] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const programs = useQuery({
    queryKey: ['finance', 'catalog', 'programs'],
    queryFn: () => get<CatalogRow[]>('/admin/catalog/programs'),
    staleTime: 10 * 60_000,
    enabled: open,
  })

  const levels = useQuery({
    queryKey: ['finance', 'catalog', 'academic-levels'],
    queryFn: () => get<CatalogRow[]>('/admin/catalog/academic-levels'),
    staleTime: 10 * 60_000,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setTarget('student')
    setLearner(null)
    setProgramId('')
    setLevelId('')
    setOptionalIds([])
    setErrors({})
  }, [open])

  const assign = useFinanceMutation({
    mutationFn: () =>
      financeApi.assignStructure(structure.id, {
        student_id: target === 'student' ? learner?.id : null,
        program_id: target === 'program' ? programId : null,
        academic_level_id: target === 'level' ? levelId : null,
        optional_fee_item_ids: optionalIds,
      }),
    success: 'Structure assigned',
    setErrors,
    onDone: onClose,
  })

  const optionalItems = structure.items.filter((i) => i.is_optional)
  const ready =
    (target === 'student' && learner) ||
    (target === 'program' && programId) ||
    (target === 'level' && levelId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign ${structure.name}`}
      description="Whoever it is assigned to can have an invoice generated from it."
      footer={
        <>
          <Button onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={assign.isPending}
            disabled={!ready}
            onClick={() => {
              setErrors({})
              assign.mutate()
            }}
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Assign to">
          {(props) => (
            <Select
              {...props}
              value={target}
              onChange={(e) => setTarget(e.target.value as typeof target)}
              options={[
                { value: 'student', label: `One ${t('learner').toLowerCase()}` },
                { value: 'program', label: `A ${t('programme').toLowerCase()}` },
                { value: 'level', label: `A ${t('level').toLowerCase()}` },
              ]}
            />
          )}
        </Field>

        {target === 'student' && (
          <StudentPicker value={learner} onChange={setLearner} error={errors.student_id} />
        )}

        {target === 'program' && (
          <Field label={t('programme')} required error={errors.program_id}>
            {(props) => (
              <Select
                {...props}
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                placeholder={programs.isLoading ? 'Loading…' : `Choose a ${t('programme').toLowerCase()}`}
                options={(programs.data ?? []).map((row) => ({
                  value: row.id,
                  label: row.code ? `${row.name} (${row.code})` : row.name,
                }))}
              />
            )}
          </Field>
        )}

        {target === 'level' && (
          <Field label={t('level')} required error={errors.academic_level_id}>
            {(props) => (
              <Select
                {...props}
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                placeholder={levels.isLoading ? 'Loading…' : `Choose a ${t('level').toLowerCase()}`}
                options={(levels.data ?? []).map((row) => ({
                  value: row.id,
                  label: row.code ? `${row.name} (${row.code})` : row.name,
                }))}
              />
            )}
          </Field>
        )}

        {optionalItems.length > 0 && (
          <div className="mt-2 border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-600">
              Optional items to include in the charge:
            </p>
            <ul className="space-y-1.5">
              {optionalItems.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2.5">
                    <Checkbox
                      checked={optionalIds.includes(item.id)}
                      onChange={(e) =>
                        setOptionalIds((prev) =>
                          e.target.checked
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span className="text-sm text-gray-900">{item.name}</span>
                    <span className="ml-auto text-sm tabular text-gray-700">
                      {formatMoney(item.amount_minor, structure.currency)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
