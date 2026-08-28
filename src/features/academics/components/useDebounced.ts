import { useEffect, useState } from 'react'

/**
 * A value that settles before anybody acts on it.
 *
 * Search boxes on this surface all feed a query key, and a key that changes on
 * every keystroke is a request per keystroke — twelve for "Junior Secondary",
 * eleven of them already stale before they land.
 *
 * Returns the value unchanged on first render so the initial query does not
 * wait 300ms for a box nobody has typed in.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return settled
}
