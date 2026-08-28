import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { financeKeys } from '../finance.api'

/**
 * One shape for every finance write.
 *
 * ── Why they all invalidate the whole branch ───────────────────────────────
 *
 * Because in a ledger almost nothing changes alone. Recording a payment moves
 * the payment list, the invoice it settles, that learner's balance, and the
 * collected total on the overview. Enumerating those per mutation is a list
 * somebody forgets to extend, and the symptom — a figure that is stale until
 * you reload — is one nobody reports as a bug. `financeKeys.all` is one
 * refetch of what is on screen, which is cheap and cannot go stale.
 */
export function useFinanceMutation<TData, TVars>({
  mutationFn,
  success,
  onDone,
  setErrors,
}: {
  mutationFn: (vars: TVars) => Promise<TData>
  success: string | ((data: TData) => string)
  onDone?: (data: TData) => void
  /** Given the API's field errors so a form can attach them to inputs. */
  setErrors?: (errors: Record<string, string>) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all })
      toast.success(typeof success === 'function' ? success(data) : success)
      onDone?.(data)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors?.(fields)
        /* A refusal with no field is a domain rule — "this invoice is frozen",
         * "that payment is already reversed" — and belongs in a toast, not
         * attached to an input the reader did not get wrong. */
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That could not be completed.')
    },
  })
}
