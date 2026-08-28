import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Field, Modal, Select } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import {
  communicationsApi,
  type DirectoryEntry,
  type ParticipantRole,
} from '../communications.api'
import { DirectoryPicker } from './DirectoryPicker'

/**
 * Adding somebody to a conversation in progress.
 *
 * ── This is how a third party gets in, and the only way ────────────────────
 *
 * There is no administrative route into a thread anywhere in the API — not for
 * a head of year, not for the institution's owner. Somebody who needs to read a
 * conversation is added to it here, and the Action posts a system message, so
 * the people already in the room find out that the audience changed rather than
 * discovering later that it had. That visibility is the reason the route exists
 * in this shape, and the dialog says so.
 *
 * `manage` here means an OWNER participant, not the `communications.manage`
 * permission — holding the permission does not put anybody in a room.
 */
export function AddParticipantDialog({
  open,
  threadId,
  existing,
  onClose,
  onAdded,
}: {
  open: boolean
  threadId: string
  existing: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [chosen, setChosen] = useState<DirectoryEntry | null>(null)
  const [role, setRole] = useState<ParticipantRole>('participant')

  const add = useMutation({
    mutationFn: () => communicationsApi.addParticipant(threadId, chosen!.user_id, role),
    onSuccess: () => {
      toast.success(`${chosen?.name ?? 'They'} can now read this conversation.`)
      setChosen(null)
      setRole('participant')
      onAdded()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'They could not be added.',
      )
    },
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        setChosen(null)
        onClose()
      }}
      title="Add someone"
      description="Everybody in the conversation is told that you did this."
      footer={
        <>
          <Button
            onClick={() => {
              setChosen(null)
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={chosen === null}
            onClick={() => add.mutate()}
          >
            Add to conversation
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Who">
          {() => (
            <DirectoryPicker
              multiple={false}
              exclude={existing}
              selected={chosen ? [chosen] : []}
              onToggle={(entry) =>
                setChosen((current) => (current?.user_id === entry.user_id ? null : entry))
              }
            />
          )}
        </Field>

        <Field
          label="As"
          hint={
            role === 'observer'
              ? 'An observer reads the conversation and cannot write in it.'
              : 'A participant can read and reply.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) => setRole(event.currentTarget.value as ParticipantRole)}
              options={[
                { value: 'participant', label: 'Participant' },
                { value: 'observer', label: 'Observer' },
              ]}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
