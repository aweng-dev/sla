import { useEffect, useMemo, useState } from 'react'

/**
 * The countdown, anchored to the server and ticked locally.
 *
 * ── Why not `expires_at` minus the browser clock ───────────────────────────
 *
 * Because a candidate's device clock is the one clock in the system nobody
 * controls. A phone twenty minutes fast would show a paper as already over; one
 * twenty minutes slow would show time remaining after the server had stopped
 * accepting answers. Both are the same bug and both surface as "the system lost
 * my exam".
 *
 * So the server sends `seconds_remaining` — computed from the attempt's own row
 * at render time — and this measures ELAPSED time locally from the moment that
 * payload landed. Elapsed time is the one thing a local clock is reliable for:
 * it uses `performance.now()`, which is monotonic and unaffected by the device
 * clock being corrected, by daylight saving, or by the user changing it.
 *
 * ── It re-anchors on every save ────────────────────────────────────────────
 *
 * `PUT .../answers/{id}` answers with the whole attempt, so every answer a
 * candidate records refreshes `seconds_remaining` from the server. Drift is
 * therefore bounded by the gap between two answers rather than by the length of
 * the paper.
 *
 * ── Null means untimed, and is not zero ────────────────────────────────────
 *
 * An untimed paper sends `seconds_remaining: null`. Rendering that as 00:00
 * would tell a candidate their time was up on a paper that has no limit, so it
 * stays null all the way to the screen.
 */
export function useExamClock(secondsRemaining: number | null | undefined): {
  /** Seconds left, floored at zero. Null on an untimed paper. */
  remaining: number | null
  /** True once the server's allowance has run out. Never true when untimed. */
  expired: boolean
} {
  const [, tick] = useState(0)

  /*
   * The server's figure, paired with the monotonic reading when it arrived.
   *
   * `useMemo` and not a ref written during render: it recomputes exactly when
   * `seconds_remaining` changes, which is exactly when the clock should
   * re-anchor. Comparing the VALUE rather than the object matters — React Query
   * hands back a new attempt object on every refetch, and re-anchoring on
   * identity would restart the elapsed measurement about once a second and
   * freeze the countdown at its starting number.
   */
  const anchor = useMemo(
    () =>
      secondsRemaining === null || secondsRemaining === undefined
        ? null
        : { seconds: secondsRemaining, at: performance.now() },
    [secondsRemaining],
  )

  const timed = anchor !== null

  useEffect(() => {
    if (!timed) return

    const timer = window.setInterval(() => tick((count) => count + 1), 1000)

    return () => window.clearInterval(timer)
  }, [timed])

  if (anchor === null) {
    return { remaining: null, expired: false }
  }

  const elapsed = (performance.now() - anchor.at) / 1000
  const remaining = Math.max(0, Math.round(anchor.seconds - elapsed))

  return { remaining, expired: remaining <= 0 }
}

/** "1:04:09" over an hour, "04:09" under it. Padded so the digits do not
 *  jump about as a candidate watches them. */
export function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(rest).padStart(2, '0')

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
