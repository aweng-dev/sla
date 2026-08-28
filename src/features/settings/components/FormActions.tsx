import { Button } from '@/shared/ui'

/**
 * The save action, where Sprig puts it.
 *
 * ── Not a footer strip ─────────────────────────────────────────────────────
 *
 * Sprig's settings forms end with a small button sitting INLINE under the last
 * field, left-aligned, inside the card body, with no rule above it. Every card
 * on its Settings screens does this — Personal Info, Product Name, Dismiss on
 * Page Change, Weekly Digest. A bordered footer with right-aligned actions is a
 * different product's idiom: it reads as a dialog that happens to be embedded
 * in the page, and it pushes the button as far from the field the reader just
 * typed in as the card allows.
 *
 * ── Why Save changes variant when there is nothing to save ─────────────────
 *
 * A disabled `primary` is a washed-out yellow, which reads as a live button
 * rendered badly rather than as an inert one. Sprig's own disabled Save is a
 * plain white button with a hairline and grey text — sampled from the Configure
 * screen — so the variant swaps with the dirty state and the disabled control
 * looks deliberately inert.
 */
export function FormActions({
  formId,
  label = 'Save changes',
  dirty,
  saving,
  onDiscard,
}: {
  /** The `<form id>` this button submits, so the actions can sit outside the
   *  `<form>` element without a nested-form trick. */
  formId: string
  label?: string
  dirty: boolean
  saving: boolean
  onDiscard: () => void
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <Button
        type="submit"
        form={formId}
        variant={dirty ? 'primary' : 'secondary'}
        loading={saving}
        disabled={!dirty}
      >
        {label}
      </Button>
      {dirty && (
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
      )}
    </div>
  )
}
