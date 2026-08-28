import { useEffect, useState } from 'react'
import { Button, Field, Modal, Textarea } from '@/shared/ui'

/**
 * "Why?", asked once and properly.
 *
 * Cancelling an allocation, waiving a fine, suspending a member, cancelling a
 * trip — the API takes a reason on each, and stores it on the record rather than
 * in a log nobody reads. So the reason is a field with a label, not a
 * `window.prompt`, and it is REQUIRED where the API requires it: a blank reason
 * on a waived fine is a hole in the audit trail that somebody has to answer for
 * six months later.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label = 'Reason',
  confirmLabel,
  destructive,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: string
  label?: string
  confirmLabel: string
  destructive?: boolean
  pending?: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            disabled={reason.trim() === ''}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} required>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        )}
      </Field>
    </Modal>
  )
}
