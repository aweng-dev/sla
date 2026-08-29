import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed'

/**
 * Writing that saves itself.
 *
 * ── Why a state machine and not a debounced mutation ───────────────────────
 *
 * A document editor has to answer "is my work safe?" at every moment, and the
 * honest answer has five values, not two. `dirty` means typed but not yet sent
 * — the window between the keystroke and the debounce firing, which is when
 * somebody closes the tab. `failed` has to survive: a save that 500s must not
 * quietly become `idle` and leave a header saying nothing while the last
 * paragraph exists only in the DOM.
 *
 * ── One save in flight, at most one queued ─────────────────────────────────
 *
 * Typing during a save must not open a second request — two PUTs racing on one
 * record is a coin toss over which paragraph survives. So a change during a
 * save sets a flag, and the flag fires one more save when the first returns.
 * Not a queue of every intermediate value: only the latest matters, because
 * each save sends the whole document.
 *
 * ── The pending value is a ref, deliberately ───────────────────────────────
 *
 * `flush()` is called from an unmount cleanup and from `beforeunload`, both of
 * which run outside React's render cycle and would see a stale closure over
 * state. The ref is the value at the moment of the call.
 */
export function useAutosave<T>({
  save,
  delay = 900,
  enabled = true,
}: {
  save: (value: T) => Promise<unknown>
  delay?: number
  /** False for a published document: the server refuses the write, and a
   *  header cycling "saving… failed" on a read-only page is a lie about what
   *  the reader did. */
  enabled?: boolean
}) {
  const [state, setState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const pending = useRef<{ value: T } | null>(null)
  const inFlight = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* `save` is usually an inline arrow, so it is a new function every render.
   * Holding it in a ref keeps `flush` and the timer stable — otherwise every
   * keystroke would tear down and rebuild the debounce it just set. */
  const saveRef = useRef(save)
  saveRef.current = save

  const run = useCallback(async () => {
    if (!pending.current) return

    if (inFlight.current) {
      again.current = true
      return
    }

    /*
     * The entry, not a copy of its value. What was saved has to be compared by
     * IDENTITY on the way out, because `schedule` replaces the whole entry —
     * and a save that finishes just after a keystroke would otherwise clear
     * pending and throw that keystroke away. That is silent data loss, and it
     * happens on exactly the timing a fast typist produces.
     */
    const entry = pending.current
    inFlight.current = true
    setState('saving')

    try {
      await saveRef.current(entry.value)

      /* Still the same entry: nothing was typed while this was in the air. */
      if (pending.current === entry && !again.current) {
        pending.current = null
        setState('saved')
        setLastSavedAt(new Date())
      }
    } catch {
      /* Kept: `retry` and the next keystroke both need it, and losing it is
       * losing the reader's work. */
      setState('failed')
      again.current = false
      inFlight.current = false
      return
    }

    inFlight.current = false

    /* Either a `run` arrived during the save, or `schedule` left a newer value
     * behind. Both mean one more save, and the one below sends the latest. */
    if (again.current || pending.current !== null) {
      again.current = false
      void run()
    }
  }, [])

  /** Called on every change. Starts the clock; does not save yet. */
  const schedule = useCallback(
    (value: T) => {
      if (!enabled) return

      pending.current = { value }
      setState('dirty')

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void run(), delay)
    },
    [delay, enabled, run],
  )

  /** Save now: leaving the lesson, leaving the page, publishing. */
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    if (pending.current) await run()
  }, [run])

  const retry = useCallback(() => {
    if (pending.current) void run()
  }, [run])

  /** True while work exists only in this tab. What a leave-confirmation and a
   *  publish button both need to know. */
  const hasUnsaved = state === 'dirty' || state === 'saving' || state === 'failed'

  useEffect(() => {
    if (!hasUnsaved) return

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      /* Required by older browsers; the message itself is never shown. */
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  /* One last attempt on the way out. It cannot be awaited — the component is
   * already going — but the request is made, and it is the difference between
   * losing the last nine hundred milliseconds and not. */
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (pending.current) void run()
    }
  }, [run])

  return { state, lastSavedAt, hasUnsaved, schedule, flush, retry }
}
