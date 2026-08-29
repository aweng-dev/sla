import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowSquareOut, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button, Field, Input, Modal, Select, Skeleton } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatMoney } from '@/shared/lib/format'
import {
  familyFinanceApi,
  familyFinanceKeys,
  type FamilyInvoice,
  type PaymentIntent,
} from '../finance.api'

/**
 * Paying a bill.
 *
 * ── Starting a checkout is not paying ──────────────────────────────────────
 *
 * The API is explicit about this and so is the screen. `POST .../checkout`
 * creates an INTENT: it answers 201 with `is_settled: false`, and the money has
 * not moved. The payer is then sent to the provider, and the account is credited
 * only when the provider's webhook arrives or an explicit verify asks it
 * directly. So this dialog never says "paid" — it says a payment has been
 * started, and hands over.
 *
 * ── The amount is optional, and the ceiling is not ours ────────────────────
 *
 * Omitted, the whole balance is charged. A part payment is allowed, and the
 * upper bound is enforced server-side against the invoice's LIVE balance — so a
 * screen left open while somebody else paid cannot start a checkout for more
 * than is owed. This validates for shape and lets the server own the limit.
 *
 * ── The reference is kept before the redirect ──────────────────────────────
 *
 * A payer who closes the provider's tab has nothing to come back to unless the
 * intent reference survives. It is handed to the caller before the window
 * opens, so the bill can show "a payment is in progress" and offer to check it.
 */
export function PayInvoiceDialog({
  invoice,
  onClose,
  onStarted,
}: {
  invoice: FamilyInvoice | null
  onClose: () => void
  onStarted: (intent: PaymentIntent) => void
}) {
  const [provider, setProvider] = useState('')
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const options = useQuery({
    queryKey: familyFinanceKeys.providers(invoice?.id ?? 'none'),
    queryFn: () => familyFinanceApi.providers(invoice!.id),
    enabled: invoice !== null,
  })

  useEffect(() => {
    if (invoice === null) return
    setErrors({})
    setAmount('')
    setProvider(options.data?.providers[0]?.provider ?? '')
  }, [invoice, options.data])

  const start = useMutation({
    mutationFn: () => {
      const whole = amount.trim() === ''

      return familyFinanceApi.startCheckout(invoice!.id, {
        provider,
        amount_minor: whole ? undefined : Math.round(Number(amount) * 100),
        /*
         * A key the server can recognise a repeat by. Without it, a payer who
         * double-clicks or whose connection retries can open two checkouts for
         * one bill — and two checkouts is two chances to be charged twice.
         */
        idempotency_key: `${invoice!.id}:${whole ? 'full' : amount.trim()}:${provider}`,
      })
    },
    onSuccess: (intent) => {
      /* Handed up BEFORE the redirect, so a payer who closes the provider's tab
       * still has something to come back to. */
      onStarted(intent)

      if (intent.checkout_url) {
        window.open(intent.checkout_url, '_blank', 'noopener,noreferrer')
      }

      toast.success('Payment started. It is not complete until the provider confirms it.')
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That payment could not be started.')
    },
  })

  const balance = options.data?.balanceMinor ?? invoice?.balance_minor ?? 0
  const currency = options.data?.currency ?? invoice?.currency ?? 'NGN'
  const available = options.data?.providers ?? []

  const asMinor = amount.trim() === '' ? balance : Math.round(Number(amount) * 100)
  const overBalance = amount.trim() !== '' && (Number.isNaN(asMinor) || asMinor > balance)
  const notPositive = amount.trim() !== '' && (Number.isNaN(asMinor) || asMinor < 1)

  return (
    <Modal
      open={invoice !== null}
      onClose={onClose}
      title="Pay this bill"
      description={invoice ? `Invoice ${invoice.invoice_number}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<ArrowSquareOut size={15} />}
            loading={start.isPending}
            disabled={provider === '' || overBalance || notPositive}
            onClick={() => start.mutate()}
          >
            Continue to payment
          </Button>
        </>
      }
    >
      {options.isLoading ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : available.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-gray-700">
          <Warning size={16} className="mt-0.5 shrink-0 text-gray-500" />
          This institution has no online payment method set up for {currency}. The finance office
          can tell you how to pay.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="pb-1 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{formatMoney(balance, currency)}</span>{' '}
            is outstanding on this bill.
          </p>

          <Field label="Pay with" required error={errors.provider}>
            {(props) => (
              <Select
                {...props}
                value={provider}
                onChange={(event) => setProvider(event.currentTarget.value)}
                options={available.map((option) => ({
                  value: option.provider,
                  label: option.label,
                }))}
              />
            )}
          </Field>

          <Field
            label="Amount"
            error={
              errors.amount_minor ??
              (overBalance
                ? `That is more than the ${formatMoney(balance, currency)} outstanding.`
                : notPositive
                  ? 'Enter an amount greater than zero.'
                  : undefined)
            }
            hint="Leave blank to pay the whole balance. Part payments are accepted."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                placeholder={String((balance / 100).toFixed(2))}
                onChange={(event) => setAmount(event.currentTarget.value)}
              />
            )}
          </Field>

          <p className="pt-1 text-2xs text-gray-500">
            You will be taken to{' '}
            {available.find((option) => option.provider === provider)?.label ?? 'the provider'} to
            pay. Nothing is charged to your account here, and the bill is only marked paid once they
            confirm it.
          </p>
        </div>
      )}
    </Modal>
  )
}
