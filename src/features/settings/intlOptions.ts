import type { SelectOption } from '@/shared/ui'

/**
 * Option lists the API does not serve, taken from the runtime's own ICU data.
 *
 * There is no `GET /timezones` and no `GET /currencies`, and inventing either
 * as a hand-written constant would mean a list that drifts from the one the
 * server validates against. `Intl.supportedValuesOf` reads the same IANA and
 * ISO 4217 tables PHP does, so a value picked here is a value the API accepts.
 *
 * Both are computed once: `supportedValuesOf('timeZone')` returns ~450 strings
 * and building it inside a render would do that on every keystroke in the form
 * beside it.
 */

function supported(key: 'timeZone' | 'currency'): string[] {
  try {
    return Intl.supportedValuesOf(key)
  } catch {
    /* Older runtimes have no `supportedValuesOf`. The caller always adds the
     * institution's own value, so an empty list still renders the truth. */
    return []
  }
}

let timezones: SelectOption[] | null = null
let currencies: SelectOption[] | null = null

/** Every IANA zone, plus `current` when the server holds one this runtime has
 *  never heard of — so an unfamiliar value is shown rather than silently
 *  replaced by whatever happens to be first in the list. */
export function timezoneOptions(current?: string | null): SelectOption[] {
  timezones ??= supported('timeZone').map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, ' '),
  }))

  if (current && !timezones.some((option) => option.value === current)) {
    return [{ value: current, label: current.replace(/_/g, ' ') }, ...timezones]
  }
  return timezones
}

/** ISO 4217 codes with the currency's own name beside them — "NGN — Nigerian
 *  Naira" rather than three letters somebody has to recognise. */
export function currencyOptions(current?: string | null): SelectOption[] {
  currencies ??= (() => {
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames(['en'], { type: 'currency' })
    } catch {
      names = null
    }

    return supported('currency').map((code) => {
      const name = names?.of(code)
      return { value: code, label: name && name !== code ? `${code} — ${name}` : code }
    })
  })()

  if (current && !currencies.some((option) => option.value === current)) {
    return [{ value: current, label: current }, ...currencies]
  }
  return currencies
}
