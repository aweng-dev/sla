import { ArrowClockwise, Check, CloudSlash, Spinner, WarningCircle } from '@phosphor-icons/react'
import type { SaveState } from '../useAutosave'

/**
 * Whether the reader's work is safe.
 *
 * ── It sits in the header, quiet, and only speaks when it must ─────────────
 *
 * Dovetail puts one word — "Saved" — in the document's own header bar, and
 * that is the right weight for a thing that is true almost all the time. A
 * toast per save would be an interruption every nine hundred milliseconds.
 *
 * ── Failure is the only loud state, and it offers the fix ──────────────────
 *
 * The other four are informational. `failed` means text exists in this tab and
 * nowhere else, so it is red, it says what to do, and it carries the button
 * that does it. It never decays back to "Saved" on its own.
 */
export function SaveIndicator({
  state,
  lastSavedAt,
  editable,
  onRetry,
}: {
  state: SaveState
  /** When the last save landed. On the tooltip rather than in the label: the
   *  answer somebody wants at a glance is "is it safe", and a clock ticking in
   *  the header answers a question nobody asked. */
  lastSavedAt: Date | null
  /** A frozen document is not "unsaved" — there is nothing to save. */
  editable: boolean
  onRetry: () => void
}) {
  if (!editable) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
        <CloudSlash size={13} aria-hidden />
        Read only
      </span>
    )
  }

  if (state === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-600">
        <WarningCircle size={13} weight="fill" aria-hidden />
        Not saved
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded border border-danger-200 px-1.5 py-0.5 text-2xs text-danger-700 transition-colors hover:bg-danger-50"
        >
          <ArrowClockwise size={11} />
          Try again
        </button>
      </span>
    )
  }

  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <Spinner size={13} className="animate-spin" aria-hidden />
        Saving…
      </span>
    )
  }

  if (state === 'dirty') {
    return <span className="text-xs text-gray-500">Unsaved changes</span>
  }

  if (state === 'saved') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-gray-600"
        title={lastSavedAt ? `Last saved at ${lastSavedAt.toLocaleTimeString()}` : undefined}
      >
        <Check size={13} weight="bold" className="text-success-600" aria-hidden />
        Saved
      </span>
    )
  }

  /* `idle` — opened and not yet touched. Saying "Saved" would claim credit for
   * a save that never happened. */
  return <span className="text-xs text-gray-500">All changes save automatically</span>
}
