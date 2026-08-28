import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui'
import { get } from '@/shared/api/client'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys } from '../finance.api'
import { StudentPicker } from './useStudentPicker'
import { useFinanceMutation } from './useFinanceMutation'
import type { Invoice } from '../finance.types'

interface CatalogSession {
  id: string
  name: string
  is_current?: boolean
}
interface CatalogPeriod {
  id: string
  name: string
  academic_session_id: string
}

function useSessions() {
  return useQuery({
    queryKey: ['finance', 'catalog', 'academic-sessions'],
    queryFn: () => get<CatalogSession[]>('/admin/catalog/academic-sessions'),
    staleTime: 10 * 60_000,
  })
}

function usePeriods() {
  return useQuery({
    queryKey: ['finance', 'catalog', 'academic-periods'],
    queryFn: () => get<CatalogPeriod[]>('/admin/catalog/academic-periods'),
    staleTime: 10 * 60_000,
  })
}

/**
 * Generating an invoice.
 *
 * Deliberately NOT a line-item editor. The API takes a learner and a session
 * and builds the invoice from the fee structure ASSIGNED to them — which is
 * the whole point of structures. A form that let somebody type amounts here
 * would produce invoices that no structure explains and no total reconciles.
 */
export function GenerateInvoiceDialog({
  open,
  onClose,
  student,
}: {
  open: boolean
  onClose: () => void
  /** Pre-selected when generating from a learner's own screen. */
  student?: { id: string; name: string }
}) {
  const t = useTerminology()
  const navigate = useNavigate()
  const sessions = useSessions()
  const periods = usePeriods()

  const [learner, setLearner] = useState<{ id: string; name: string } | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      setLearner(student ?? null)
      setPeriodId('')
      setDueOn('')
      setErrors({})
      return
    }
    setLearner(student ?? null)
    const current = sessions.data?.find((s) => s.is_current) ?? sessions.data?.[0]
    if (current) setSessionId(current.id)
  }, [open, student, sessions.data])

  const generate = useFinanceMutation<Invoice, void>({
    mutationFn: () =>
      financeApi.generateInvoice({
        student_id: learner!.id,
        academic_session_id: sessionId,
        academic_period_id: periodId || null,
        due_on: dueOn || null,
      }),
    success: (invoice) => `${invoice.invoice_number} generated`,
    setErrors,
    onDone: (invoice) => {
      onClose()
      navigate({ to: '/finance/invoices/$invoiceId', params: { invoiceId: invoice.id } })
    },
  })

  const periodOptions = (periods.data ?? []).filter((p) => p.academic_session_id === sessionId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate an invoice"
      description={`Built from the fee structure assigned to this ${t('learner').toLowerCase()} for the session.`}
      footer={
        <>
          <Button onClick={onClose} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={generate.isPending}
            disabled={!learner || !sessionId}
            onClick={() => {
              setErrors({})
              generate.mutate()
            }}
          >
            Generate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <StudentPicker
          value={learner}
          onChange={setLearner}
          error={errors.student_id}
          disabled={generate.isPending || Boolean(student)}
        />

        <Field label={t('session')} required error={errors.academic_session_id}>
          {(props) => (
            <Select
              {...props}
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value)
                setPeriodId('')
              }}
              placeholder={sessions.isLoading ? 'Loading…' : 'Choose a session'}
              options={(sessions.data ?? []).map((s) => ({
                value: s.id,
                label: s.is_current ? `${s.name} — current` : s.name,
              }))}
            />
          )}
        </Field>

        {periodOptions.length > 0 && (
          <Field
            label={t('period')}
            error={errors.academic_period_id}
            hint="Leave blank to charge for the whole session."
          >
            {(props) => (
              <Select
                {...props}
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                options={[
                  { value: '', label: `Whole ${t('session').toLowerCase()}` },
                  ...periodOptions.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </Field>
        )}

        <Field
          label="Due date"
          error={errors.due_on}
          hint="Optional. An invoice with no due date is never counted as overdue."
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/** Voiding cancels the charge. It is not a deletion — the invoice stays on the
 *  ledger with its reason, which is what an auditor needs. */
export function VoidInvoiceDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: Invoice
  open: boolean
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setReason('')
      setErrors({})
    }
  }, [open])

  const voidIt = useFinanceMutation({
    mutationFn: () => financeApi.voidInvoice(invoice.id, reason.trim()),
    success: `${invoice.invoice_number} voided`,
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Void ${invoice.invoice_number}?`}
      description="The charge is cancelled. The invoice stays on the ledger with the reason recorded."
      footer={
        <>
          <Button onClick={onClose} disabled={voidIt.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={voidIt.isPending}
            disabled={reason.trim().length < 5}
            onClick={() => {
              setErrors({})
              voidIt.mutate()
            }}
          >
            Void invoice
          </Button>
        </>
      }
    >
      <Field
        label="Reason"
        required
        error={errors.reason}
        hint="At least five characters. It is kept against the invoice permanently."
      >
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raised against the wrong learner"
          />
        )}
      </Field>
    </Modal>
  )
}

/** Splitting an invoice into instalments. */
export function PaymentPlanDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: Invoice
  open: boolean
  onClose: () => void
}) {
  const [count, setCount] = useState('3')
  const [firstDue, setFirstDue] = useState('')
  const [interval, setInterval] = useState('1')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setCount('3')
      setFirstDue('')
      setInterval('1')
      setNotes('')
      setErrors({})
    }
  }, [open])

  const create = useFinanceMutation({
    mutationFn: () =>
      financeApi.createPaymentPlan(invoice.id, {
        installment_count: Number(count),
        first_due_on: firstDue || null,
        interval_months: interval ? Number(interval) : null,
        notes: notes.trim() || null,
      }),
    success: 'Payment plan created',
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Split into instalments"
      description={`${invoice.invoice_number} will be divided into equal instalments.`}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            Create plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Instalments" required error={errors.installment_count} hint="Between 1 and 36.">
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={36}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          )}
        </Field>
        <Field label="First due on" error={errors.first_due_on}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={firstDue}
              onChange={(e) => setFirstDue(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Months between instalments"
          error={errors.interval_months}
          hint="Between 1 and 12."
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={12}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          )}
        </Field>
        <Field label="Notes" error={errors.notes}>
          {(props) => (
            <Textarea {...props} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>
    </Modal>
  )
}

export { useSessions, usePeriods, financeKeys }
