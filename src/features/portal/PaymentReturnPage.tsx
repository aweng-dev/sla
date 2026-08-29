import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle, Clock, XCircle } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Button, Card, ErrorState, Fact, Facts, PageHeader, Skeleton, Spinner } from '@/shared/ui'
import { formatDateTime, formatMoney } from '@/shared/lib/format'
import { familyFinanceApi, familyFinanceKeys, type PaymentIntent } from './finance.api'

/**
 * Where a payer lands when the provider sends them back.
 *
 * ── The query string is not evidence ───────────────────────────────────────
 *
 * Paystack appends `?status=success` and so do the others, and none of it means
 * anything: it is a redirect a payer's browser can be pointed at by anybody.
 * `config/payments.php` says so in as many words. So this page ignores the URL
 * entirely except for the reference, and asks the SERVER to verify — which asks
 * the provider directly over its own authenticated channel.
 *
 * ── It verifies once, on arrival, and then lets a person retry ─────────────
 *
 * A webhook usually settles the intent before the payer is even redirected, so
 * the first read often already says settled. When it does not, verifying is
 * what closes the gap without waiting for a retry cycle. It fires once — a
 * ref, not state, so a re-render cannot double-charge the throttle — and after
 * that it is a button, because a payment still pending after one check is a
 * matter of seconds and the payer should decide when to look again.
 *
 * ── Pending is its own answer, and it is not failure ───────────────────────
 *
 * Bank transfers and some card flows settle minutes later. Telling somebody
 * their payment failed when it is merely unconfirmed is how a school gets paid
 * twice, so the three states are drawn as three states.
 *
 * ── Reached by the payer, whoever that is ──────────────────────────────────
 *
 * A student paying their own fees and a guardian paying a child's land here
 * identically. It reads `/portal/finance/payment-intents/{reference}`, which
 * narrows to the caller's own intents server-side — so there is nothing on this
 * page that a wrong reference could reveal.
 */
export function PaymentReturnPage() {
  const { reference } = useParams({ from: '/app/finance/return/$reference' })
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState(false)
  const verifiedOnce = useRef(false)

  const intent = useQuery({
    queryKey: familyFinanceKeys.intent(reference),
    queryFn: () => familyFinanceApi.intent(reference),
  })

  const verify = useMutation({
    mutationFn: () => familyFinanceApi.verify(reference),
    onSuccess: (fresh) => {
      queryClient.setQueryData(familyFinanceKeys.intent(reference), fresh)
      /* The balance and the bill both move when this settles. */
      queryClient.invalidateQueries({ queryKey: familyFinanceKeys.root })
      setChecked(true)
    },
    onSettled: () => setChecked(true),
  })

  /*
   * Verify once on arrival, and only when there is something to resolve. A
   * webhook has often settled it already, and re-asking a provider about a
   * settled payment is a request that can only cost the throttle.
   */
  useEffect(() => {
    if (verifiedOnce.current) return
    if (!intent.data || intent.data.is_settled || intent.data.is_terminal) {
      if (intent.data) setChecked(true)
      return
    }

    verifiedOnce.current = true
    verify.mutate()
  }, [intent.data, verify])

  if (intent.isError) {
    return (
      <PageStack>
        <PageHeader title="Payment" />
        <Card>
          <ErrorState
            error={intent.error}
            onRetry={() => intent.refetch()}
          />
        </Card>
      </PageStack>
    )
  }

  if (intent.isLoading || !intent.data) {
    return (
      <PageStack>
        <PageHeader title="Payment" />
        <Card className="space-y-3 p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </PageStack>
    )
  }

  const data = intent.data
  const busy = verify.isPending || (!checked && !data.is_settled && !data.is_terminal)

  return (
    <PageStack>
      <PageHeader title="Payment" description={`Reference ${data.reference}`} />

      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <Outcome intent={data} busy={busy} />
        </div>

        <Facts>
          <Fact label="Amount">{formatMoney(data.amount_minor, data.currency)}</Fact>
          <Fact label="Paid with">{data.provider_label}</Fact>
          <Fact label="Started">
            {data.created_at ? formatDateTime(data.created_at) : '—'}
          </Fact>
          {data.settled_at && <Fact label="Confirmed">{formatDateTime(data.settled_at)}</Fact>}
        </Facts>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-3">
          <Link
            to="/finance"
            className="inline-flex items-center gap-1.5 text-xs text-accent-500 underline-offset-2 hover:underline"
          >
            Back to your fees
            <ArrowRight size={13} />
          </Link>

          {/* Only where there is still something to resolve. Offering "check
            * again" on a settled payment invites somebody to wonder whether it
            * really settled. */}
          {!data.is_settled && !data.is_terminal && (
            <Button loading={verify.isPending} onClick={() => verify.mutate()}>
              Check again
            </Button>
          )}
        </div>
      </Card>
    </PageStack>
  )
}

/** The three states, drawn as three states. */
function Outcome({ intent, busy }: { intent: PaymentIntent; busy: boolean }) {
  if (busy) {
    return (
      <>
        <Spinner className="h-7 w-7 text-gray-500" />
        <p className="text-sm font-medium text-gray-900">Checking with {intent.provider_label}…</p>
        <p className="max-w-md text-xs text-gray-600">
          We are asking them directly rather than trusting the page you were sent back to.
        </p>
      </>
    )
  }

  if (intent.is_settled) {
    return (
      <>
        <CheckCircle size={40} weight="fill" className="text-success-500" />
        <p className="text-md font-semibold text-gray-900">Payment received</p>
        <p className="max-w-md text-xs text-gray-600">
          {formatMoney(intent.amount_minor, intent.currency)} has been applied to the bill. Your
          balance is up to date.
        </p>
      </>
    )
  }

  /* Terminal and unsettled: the provider gave a reason, or the intent expired. */
  if (intent.is_terminal) {
    return (
      <>
        <XCircle size={40} weight="fill" className="text-danger-500" />
        <p className="text-md font-semibold text-gray-900">This payment did not go through</p>
        <p className="max-w-md text-xs text-gray-600">
          {intent.failure_reason
            ? `${intent.provider_label} said: ${intent.failure_reason}`
            : `${intent.provider_label} did not confirm it.`}{' '}
          Nothing has been charged to the bill, so you can try again from your fees.
        </p>
      </>
    )
  }

  /* Pending is not failure — see the file note. */
  return (
    <>
      <Clock size={40} weight="fill" className="text-brand-500" />
      <p className="text-md font-semibold text-gray-900">Not confirmed yet</p>
      <p className="max-w-md text-xs text-gray-600">
        {intent.provider_label} has not confirmed this yet. Some methods — a bank transfer, for
        instance — take a few minutes. The bill still shows as owed until it clears, and it will
        update on its own. Do not pay again.
      </p>
    </>
  )
}
