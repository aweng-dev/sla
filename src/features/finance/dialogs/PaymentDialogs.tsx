import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/shared/ui'
import { formatMoney } from '@/shared/lib/format'
import { useTenant } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys, toMinor, toMajor } from '../finance.api'
import { MoneyInput, Money } from '../components/money'
import { StudentPicker } from './useStudentPicker'
import { useFinanceMutation } from './useFinanceMutation'
import type { Payment, PaymentMethod } from '../finance.types'

const METHODS: { value: PaymentMethod; label: string; hint?: string }[] = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
  {
    value: 'waiver',
    label: 'Waiver',
    hint: 'No money changed hands — the charge is being forgiven. It still reduces the balance.',
  },
]

/**
 * Recording money in.
 *
 * ── Why `confirmed` is a checkbox and not implicit ─────────────────────────
 *
 * A pending payment does NOT reduce a balance. That is correct — a transfer
 * somebody says they have sent is not money the school has — but it means a
 * bursar who records a payment and sees the balance unchanged will think the
 * app is broken. So the choice is explicit, defaulted to confirmed, and the
 * unconfirmed case says what it will do.
 */
export function RecordPaymentDialog({
  open,
  onClose,
  student,
  invoiceId,
  suggestedMinor,
}: {
  open: boolean
  onClose: () => void
  student?: { id: string; name: string }
  /** Pre-applies the payment to one invoice when recorded from its screen. */
  invoiceId?: string
  suggestedMinor?: number
}) {
  const { tenant } = useTenant()
  const currency = tenant.default_currency

  const [learner, setLearner] = useState<{ id: string; name: string } | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('bank')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [reference, setReference] = useState('')
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setLearner(student ?? null)
    setMethod('bank')
    setAmount(suggestedMinor ? String(toMajor(suggestedMinor, currency)) : '')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setReference('')
    setExternalRef('')
    setNotes('')
    setConfirmed(true)
    setErrors({})
  }, [open, student, suggestedMinor, currency])

  const record = useFinanceMutation<Payment, void>({
    mutationFn: () =>
      financeApi.recordPayment({
        student_id: learner!.id,
        invoice_id: invoiceId ?? null,
        method,
        amount_minor: toMinor(amount, currency),
        currency,
        paid_at: paidAt || null,
        reference: reference.trim() || null,
        external_reference: externalRef.trim() || null,
        notes: notes.trim() || null,
        confirmed,
      }),
    success: (payment) => `${payment.reference} recorded`,
    setErrors,
    onDone: onClose,
  })

  const minor = toMinor(amount, currency)
  const methodHint = METHODS.find((m) => m.value === method)?.hint

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record a payment"
      description={
        invoiceId
          ? 'It will be applied to this invoice.'
          : 'Money received. You can apply it to invoices afterwards.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={record.isPending}
            disabled={!learner || minor < 1}
            onClick={() => {
              setErrors({})
              record.mutate()
            }}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <StudentPicker
          value={learner}
          onChange={setLearner}
          error={errors.student_id}
          disabled={record.isPending || Boolean(student)}
        />

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Amount" required error={errors.amount_minor}>
            {(props) => (
              <MoneyInput
                {...props}
                value={amount}
                onChange={setAmount}
                currency={currency}
                disabled={record.isPending}
              />
            )}
          </Field>

          <Field label="Method" required error={errors.method} hint={methodHint}>
            {(props) => (
              <Select
                {...props}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            )}
          </Field>

          <Field label="Received on" error={errors.paid_at}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Reference"
            error={errors.reference}
            hint="Left blank, the API assigns one."
          >
            {(props) => (
              <Input
                {...props}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PAY-2026-000123"
              />
            )}
          </Field>
        </div>

        <Field
          label="Bank or provider reference"
          error={errors.external_reference}
          hint="The number on the statement, so this can be reconciled later."
        >
          {(props) => (
            <Input
              {...props}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          )}
        </Field>

        <Field label="Notes" error={errors.notes}>
          {(props) => (
            <Textarea {...props} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>

        <label className="mt-1 flex items-start gap-2.5 rounded-md border border-gray-200 bg-gray-50 p-3">
          <Checkbox
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={record.isPending}
          />
          <span className="text-xs text-gray-700">
            <span className="font-medium text-gray-900">Confirmed</span> — the money has arrived.
            {!confirmed && (
              <span className="mt-0.5 block text-gray-600">
                Left unconfirmed it is recorded as pending and does <strong>not</strong> reduce any
                balance until confirmed.
              </span>
            )}
          </span>
        </label>
      </div>
    </Modal>
  )
}

/**
 * Applying received money to invoices.
 *
 * The API settles as much of an invoice as the credit covers when no amount is
 * given, so the form offers the outstanding invoices with a tick and an
 * optional amount. The running total against the available credit is shown
 * because over-allocating is the mistake this screen exists to prevent.
 */
export function AllocatePaymentDialog({
  payment,
  open,
  onClose,
}: {
  payment: Payment
  open: boolean
  onClose: () => void
}) {
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const invoices = useQuery({
    queryKey: financeKeys.invoices({ student: payment.student_id, outstanding: true }),
    queryFn: () =>
      financeApi.invoices({ student_id: payment.student_id, outstanding: true, per_page: 50 }),
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setPicked({})
      setErrors({})
    }
  }, [open])

  const rows = invoices.data?.rows ?? []

  const allocatedMinor = useMemo(
    () =>
      Object.entries(picked).reduce((sum, [invoiceId, value]) => {
        const invoice = rows.find((r) => r.id === invoiceId)
        if (!invoice) return sum
        const explicit = value.trim() === '' ? null : toMinor(value, invoice.currency)
        return sum + (explicit ?? Math.min(invoice.balance_minor, payment.unallocated_minor))
      }, 0),
    [picked, rows, payment.unallocated_minor],
  )

  const over = allocatedMinor > payment.unallocated_minor

  const allocate = useFinanceMutation({
    mutationFn: () =>
      financeApi.allocate(payment.id, {
        allocations: Object.entries(picked).map(([invoice_id, value]) => {
          const invoice = rows.find((r) => r.id === invoice_id)
          const amount = value.trim() === '' ? undefined : toMinor(value, invoice?.currency ?? payment.currency)
          return amount === undefined ? { invoice_id } : { invoice_id, amount_minor: amount }
        }),
      }),
    success: 'Payment applied',
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Apply this payment"
      description={
        <>
          <Money minor={payment.unallocated_minor} currency={payment.currency} emphasis /> is
          unapplied. Leave an amount blank to settle as much of that invoice as the credit covers.
        </>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={allocate.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={allocate.isPending}
            disabled={Object.keys(picked).length === 0 || over}
            onClick={() => {
              setErrors({})
              allocate.mutate()
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      {invoices.isLoading ? (
        <p className="text-sm text-gray-600">Loading outstanding invoices…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">
          This {`learner`} has no outstanding invoices. The credit stays on the account until one is
          raised.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {rows.map((invoice) => {
              const on = invoice.id in picked
              return (
                <li key={invoice.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox
                    checked={on}
                    aria-label={`Apply to ${invoice.invoice_number}`}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = { ...prev }
                        if (on) delete next[invoice.id]
                        else next[invoice.id] = ''
                        return next
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm tabular text-gray-900">
                      {invoice.invoice_number}
                    </p>
                    <p className="text-2xs text-gray-600">
                      {formatMoney(invoice.balance_minor, invoice.currency)} outstanding
                    </p>
                  </div>
                  <div className="w-36 shrink-0">
                    <MoneyInput
                      value={picked[invoice.id] ?? ''}
                      onChange={(v) => setPicked((prev) => ({ ...prev, [invoice.id]: v }))}
                      currency={invoice.currency}
                      disabled={!on}
                      placeholder="Full"
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs font-medium text-gray-600">Applying</span>
            <span className={over ? 'text-sm font-medium tabular text-danger-500' : 'text-sm font-medium tabular text-gray-900'}>
              {formatMoney(allocatedMinor, payment.currency)} of{' '}
              {formatMoney(payment.unallocated_minor, payment.currency)}
            </span>
          </div>
          {over && (
            <p role="alert" className="mt-1 text-xs text-danger-500">
              That is more than the unapplied credit on this payment.
            </p>
          )}
          {errors.allocations && (
            <p role="alert" className="mt-1 text-xs text-danger-500">
              {errors.allocations}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}

/** Money back to the payer. Distinct from a reversal — see the panel copy. */
export function RefundDialog({
  payment,
  open,
  onClose,
}: {
  payment: Payment
  open: boolean
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setAmount(String(toMajor(payment.amount_minor, payment.currency)))
      setReason('')
      setErrors({})
    }
  }, [open, payment])

  const refund = useFinanceMutation({
    mutationFn: () =>
      financeApi.refund(payment.id, {
        amount_minor: toMinor(amount, payment.currency),
        reason: reason.trim(),
      }),
    success: 'Refund recorded',
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Refund ${payment.reference}`}
      description="Records money returned to the payer."
      footer={
        <>
          <Button onClick={onClose} disabled={refund.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={refund.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => {
              setErrors({})
              refund.mutate()
            }}
          >
            Refund
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label="Amount"
          error={errors.amount_minor}
          hint={`Up to ${formatMoney(payment.amount_minor, payment.currency)}.`}
        >
          {(props) => (
            <MoneyInput
              {...props}
              value={amount}
              onChange={setAmount}
              currency={payment.currency}
            />
          )}
        </Field>
        <Field label="Reason" required error={errors.reason} hint="At least three characters.">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Overpayment returned by transfer"
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/** Undoing the record entirely. */
export function ReversePaymentDialog({
  payment,
  open,
  onClose,
}: {
  payment: Payment
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

  const reverse = useFinanceMutation({
    mutationFn: () => financeApi.reverse(payment.id, reason.trim()),
    success: `${payment.reference} reversed`,
    setErrors,
    onDone: onClose,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Reverse ${payment.reference}?`}
      description="Use this when the payment should never have been recorded — a duplicate, or the wrong learner. Its allocations are undone and the balances it settled go back up."
      footer={
        <>
          <Button onClick={onClose} disabled={reverse.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={reverse.isPending}
            disabled={reason.trim().length < 5}
            onClick={() => {
              setErrors({})
              reverse.mutate()
            }}
          >
            Reverse
          </Button>
        </>
      }
    >
      <Field label="Reason" required error={errors.reason} hint="At least five characters.">
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Duplicate of PAY-2026-000118"
          />
        )}
      </Field>
    </Modal>
  )
}
