import type { ReactNode } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { Button, Modal } from '@/shared/ui'

/**
 * The create/edit dialog every Academics resource opens.
 *
 * ── Why this is one component and not eight ────────────────────────────────
 *
 * Nine screens on this surface create and edit a record, and every one of them
 * needs the same four things done identically: the form element wired so that
 * Enter submits, the submit button disabled while the mutation is in flight, a
 * root-level error rendered above the fields when the server refused for a
 * reason no single field owns, and the dialog left OPEN on failure so the
 * reader does not lose what they typed. Written eight times, at least one of
 * them closes on failure.
 *
 * Field-level errors are NOT handled here — they belong on the inputs, and
 * `useServerErrors` puts them there.
 */
export function FormDialog<T extends FieldValues>({
  open,
  onClose,
  title,
  description,
  form,
  onSubmit,
  pending = false,
  submitLabel = 'Save',
  size = 'md',
  destructive = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  form: UseFormReturn<T>
  onSubmit: (values: T) => void | Promise<void>
  pending?: boolean
  submitLabel?: string
  size?: 'sm' | 'md' | 'lg'
  destructive?: boolean
  children: ReactNode
}) {
  /* `errors.root` is where `useServerErrors` puts a refusal that named no
   * field — a conflict, a domain rule, a rate limit. */
  const rootError = form.formState.errors.root?.message

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            onClick={form.handleSubmit(onSubmit)}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-1"
        noValidate
      >
        {rootError && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          >
            {rootError}
          </p>
        )}
        {children}
        {/* Submits on Enter without giving the dialog a second visible button. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/** Two fields side by side on `sm` and up. The dialogs on this surface are
 *  mostly pairs — starts/ends, code/type — and a column of eight single
 *  fields is a lot of scrolling for a form that fits in a box. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 sm:grid-cols-2">{children}</div>
}
