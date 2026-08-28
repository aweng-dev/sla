import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

/**
 * A failed request, explained.
 *
 * Reads the API's own error rather than saying "something went wrong": the
 * envelope carries a human sentence and a `request_id`, and quoting the id is
 * the difference between a support ticket that can be traced and one that
 * cannot.
 *
 * A 403 is not offered a retry — the same request will be refused again — and
 * is worded as a permissions answer rather than a failure, because it is one.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null

  if (api?.isForbidden) {
    return (
      <EmptyState
        icon={<WarningCircle size={20} />}
        title="You do not have access to this"
        description={api.message}
      />
    )
  }

  const message =
    api?.message ??
    (error instanceof Error ? error.message : 'The request could not be completed.')

  return (
    <EmptyState
      icon={<WarningCircle size={20} className="text-danger-500" />}
      title="Could not load this"
      description={
        <>
          {message}
          {api?.requestId && (
            <span className="mt-1 block font-mono text-2xs text-gray-500">
              Reference {api.requestId}
            </span>
          )}
        </>
      }
      action={
        onRetry && (!api || api.status >= 500 || api.retryable || api.status === 0) ? (
          <Button icon={<ArrowClockwise size={14} />} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  )
}
