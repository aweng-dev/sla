import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Field, Input, Modal, Textarea } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import {
  communicationKeys,
  communicationsApi,
  type DirectoryEntry,
  type ThreadRow,
} from '../communications.api'
import { DirectoryPicker } from './DirectoryPicker'

/**
 * Starting a conversation.
 *
 * ── One call, not two ──────────────────────────────────────────────────────
 *
 * The first message travels with the thread. `POST /portal/threads` takes a
 * `body` for exactly this reason: "start a thread" with nothing in it is not
 * something anybody does, and two calls leave a window in which the recipients
 * are looking at an empty conversation with a subject and no message.
 *
 * ── Field errors are put back on their fields ──────────────────────────────
 *
 * The API returns `errors[]` entries carrying `field`, and `Field` takes the
 * message straight. A subject over 255 characters or a participant list over
 * 200 is a rule the server owns; re-implementing either here would give this
 * form its own opinion about what is valid, which drifts.
 */
export function ComposeThreadDialog({
  open,
  onClose,
  onStarted,
}: {
  open: boolean
  onClose: () => void
  onStarted: (thread: ThreadRow) => void
}) {
  const queryClient = useQueryClient()

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [people, setPeople] = useState<DirectoryEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setSubject('')
    setBody('')
    setPeople([])
    setErrors({})
  }

  const start = useMutation({
    mutationFn: () =>
      communicationsApi.startThread({
        subject: subject.trim(),
        body: body.trim() || undefined,
        participant_user_ids: people.map((entry) => entry.user_id),
        kind: people.length > 1 ? 'group' : 'direct',
      }),
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: communicationKeys.threadsRoot })
      reset()
      onStarted(thread)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors())
        /* A validation failure has already been said on the fields; a toast
         * would say it a second time and cover one of them. */
        if (Object.keys(error.fieldErrors()).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That conversation could not be started.')
    },
  })

  function toggle(entry: DirectoryEntry) {
    setPeople((current) =>
      current.some((chosen) => chosen.user_id === entry.user_id)
        ? current.filter((chosen) => chosen.user_id !== entry.user_id)
        : [...current, entry],
    )
  }

  const ready = subject.trim() !== '' && people.length > 0

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="New conversation"
      description="Only the people you add can read this, and it stays that way."
      size="lg"
      footer={
        <>
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={start.isPending}
            disabled={!ready}
            onClick={() => start.mutate()}
          >
            Start conversation
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Subject" required error={errors.subject}>
          {(props) => (
            <Input
              {...props}
              value={subject}
              maxLength={255}
              placeholder="What is this about?"
              onChange={(event) => setSubject(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field
          label="Who is in it"
          required
          error={errors.participant_user_ids ?? errors['participant_user_ids.0']}
          hint="You are added automatically."
        >
          {() => <DirectoryPicker selected={people} onToggle={toggle} />}
        </Field>

        <Field label="First message" error={errors.body}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              value={body}
              maxLength={20000}
              placeholder="Optional, but a conversation with nothing in it is an odd thing to receive."
              onChange={(event) => setBody(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
