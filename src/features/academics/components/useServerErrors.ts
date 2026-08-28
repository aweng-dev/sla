import { useCallback } from 'react'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'

/**
 * Puts the API's refusal where the reader is looking.
 *
 * The envelope carries field errors in `errors[]`, each naming the input it is
 * about — `starts_on`, `academic_session_id` — and those names are the form's
 * own field names, so they attach directly. Anything the server refused
 * WITHOUT naming a field (a conflict, a domain rule, a rate limit) has no
 * input to sit under and goes to the form root, which `FormDialog` renders
 * above the fields.
 *
 * ── Why a toast is the fallback and not the default ────────────────────────
 *
 * A message shown in a toast is a message shown away from the thing it is
 * about, and it disappears. So a toast fires only when the dialog is not the
 * right place — a mutation with no form behind it, like archiving a row from a
 * menu. When there IS a form, the message stays on it.
 */
export function useServerErrors<T extends FieldValues>(form: UseFormReturn<T>) {
  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError)) {
        form.setError('root', {
          message: error instanceof Error ? error.message : 'Something went wrong.',
        })
        return
      }

      const fields = error.fieldErrors()
      let attached = 0

      for (const [field, message] of Object.entries(fields)) {
        /* The API names nested inputs with dots — `person.first_name` — which
         * is exactly how react-hook-form addresses them, so no translation is
         * needed. A name the form does not have falls through to the root
         * rather than being silently dropped. */
        if (field in form.getValues() || field.includes('.')) {
          form.setError(field as Path<T>, { message })
          attached += 1
        }
      }

      if (attached === 0) {
        form.setError('root', { message: error.rootMessage() })
      }
    },
    [form],
  )
}

/** For a mutation with no form behind it — an archive, a make-current, a
 *  delete from a row menu. There is nowhere on screen to attach the message,
 *  so it is announced. */
export function reportError(error: unknown, fallback = 'That could not be completed.'): void {
  if (error instanceof ApiError) {
    toast.error(error.rootMessage())
    return
  }
  toast.error(error instanceof Error ? error.message : fallback)
}
