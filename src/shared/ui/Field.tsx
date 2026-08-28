import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Label, control, hint and error, wired together.
 *
 * The error is rendered in a fixed slot rather than inserted, so a form does
 * not jump when validation fires — the most common way a login screen loses
 * a click is the submit button moving out from under the cursor.
 *
 * Pass the API's field error straight in: `errors[]` entries carry `field`,
 * which is the input's own name.
 */
export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  /** Receives the id to put on the control. */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Sprig's field labels are grey and REGULAR weight, sitting quietly
        * above the input — the value is the thing to read, not the label. The
        * required mark is grey for the same reason: red is reserved for
        * something that has actually gone wrong. */}
      {label && (
        <label htmlFor={id} className="text-xs font-normal text-gray-600">
          {label}
          {required && (
            <span className="ml-0.5 text-gray-500" aria-hidden>
              *
            </span>
          )}
        </label>
      )}

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error) || undefined,
      })}

      {/* Reserved space: 18px whether or not there is a message. */}
      <div className="min-h-[1.125rem]">
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-xs text-danger-500">
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-xs text-gray-500">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
