import { forwardRef } from 'react'
import { Input } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatMoney } from '@/shared/lib/format'
import { minorUnitScale } from '../finance.api'

/**
 * A money field that speaks major units to the person and minor units to the
 * API.
 *
 * ── Why this is a component and not a `<Input type="number">` ──────────────
 *
 * Because the conversion is the bug. A bursar types 202,500 meaning naira;
 * the API wants 20250000. Every place that does that arithmetic inline is a
 * place it can be forgotten, done twice, or done with a currency that has no
 * decimal places at all. Here it happens once, and `minorUnitScale` derives
 * the factor from the currency rather than assuming a hundred.
 *
 * `step` follows the currency too, so the browser's own validation does not
 * reject a legitimate whole-yen amount for having no decimals.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    /** Major units, as a string so an empty field is distinguishable from 0. */
    value: string
    onChange: (value: string) => void
    currency: string
    id?: string
    disabled?: boolean
    invalid?: boolean
    placeholder?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }
>(function MoneyInput({ value, onChange, currency, ...props }, ref) {
  const scale = minorUnitScale(currency)
  const step = scale === 1 ? 1 : 1 / scale

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-2.5 text-sm text-gray-600">
        {symbolFor(currency)}
      </span>
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-7 tabular"
        {...props}
      />
    </div>
  )
})

/** The currency's narrow symbol — ₦, $, £ — for the field's prefix. Falls back
 *  to the code, which is never wrong, only longer. */
function symbolFor(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * An amount in a table.
 *
 * Zero is rendered as a real zero rather than a dash: in a ledger "nothing
 * outstanding" and "not known" are different facts, and a dash claims the
 * second when the truth is the first.
 */
export function Money({
  minor,
  currency,
  className,
  muted,
  emphasis,
}: {
  minor: number | null | undefined
  currency: string
  className?: string
  /** For a figure that is present but uninteresting — a zero balance. */
  muted?: boolean
  /** For the number the row is about. */
  emphasis?: boolean
}) {
  if (minor === null || minor === undefined) {
    return <span className="text-gray-500">—</span>
  }

  return (
    <span
      className={cn(
        'tabular',
        emphasis && 'font-medium text-gray-900',
        muted && 'text-gray-500',
        !emphasis && !muted && 'text-gray-900',
        className,
      )}
    >
      {formatMoney(minor, currency)}
    </span>
  )
}

/**
 * How much of an invoice has been paid.
 *
 * Sprig draws its proportions as a thin track with a filled bar and the
 * figures beside it — see the Usage screen. Same shape here, because "₦120,000
 * of ₦202,500" is much harder to read at a glance than a bar is.
 */
export function PaidBar({
  paid,
  total,
  currency,
}: {
  paid: number
  total: number
  currency: string
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0
  const settled = total > 0 && paid >= total

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm tabular text-gray-900">{formatMoney(paid, currency)}</span>
        <span className="text-2xs tabular text-gray-600">{Math.round(ratio * 100)}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn('h-full rounded-full', settled ? 'bg-success-500' : 'bg-accent-500')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}
