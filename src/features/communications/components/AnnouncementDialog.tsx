import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Users, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button, Checkbox, Field, Input, Modal, Select, Skeleton, Textarea } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  audienceLabel,
  communicationKeys,
  communicationsApi,
  recipientLabel,
  type AnnouncementInput,
  type AudienceKind,
  type ManagedAnnouncement,
  type RecipientKind,
} from '../communications.api'

/**
 * Writing a broadcast, and sending it.
 *
 * ── Publishing is not saving ───────────────────────────────────────────────
 *
 * Save keeps a draft. Publish resolves the audience, writes a receipt for every
 * recipient, notifies them, and cannot be re-run or undone. They are two buttons
 * because they are two acts, and the API separates them for the same reason: a
 * publish reachable from an edit form is how somebody sends four hundred emails
 * by fixing a typo.
 *
 * A published announcement never opens here. The API refuses to update one and
 * the caller only ever passes drafts.
 *
 * ── The audience preview answers in counts ─────────────────────────────────
 *
 * "Thirty-one people will receive this" is what somebody needs before pressing
 * send. It is fetched for a SAVED draft only, because the count comes from
 * resolving the audience server-side and there is nothing to resolve until the
 * audience has been written down. Never names: a list of who those thirty-one
 * are would turn a preview into an export of a cohort's family contacts, and
 * the API will not build one.
 */

const AUDIENCE_KINDS: AudienceKind[] = [
  'whole_school',
  'staff',
  'students',
  'guardians',
  'learning_group',
  'course_offering',
  'academic_level',
  'program',
]

const RECIPIENT_KINDS: RecipientKind[] = ['all', 'students', 'guardians', 'staff']

/** The four that name a specific record and therefore need its id. */
const NEEDS_AUDIENCE_ID = new Set<AudienceKind>([
  'learning_group',
  'course_offering',
  'academic_level',
  'program',
])

export function AnnouncementDialog({
  open,
  announcement,
  onClose,
  onSaved,
}: {
  open: boolean
  /** A DRAFT being corrected, or null for a new one. */
  announcement: ManagedAnnouncement | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTerminology()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('whole_school')
  const [audienceId, setAudienceId] = useState('')
  const [recipientKind, setRecipientKind] = useState<RecipientKind>('all')
  const [pinned, setPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  /* Seeded from the draft each time the dialog opens on a different one, so
   * reopening on another row does not show the previous row's words. */
  useEffect(() => {
    if (!open) return
    setErrors({})
    setTitle(announcement?.title ?? '')
    setBody(announcement?.body ?? '')
    setAudienceKind((announcement?.audience_kind as AudienceKind) ?? 'whole_school')
    setAudienceId(announcement?.audience_id ?? '')
    setRecipientKind((announcement?.recipient_kind as RecipientKind) ?? 'all')
    setPinned(announcement?.is_pinned ?? false)
    setExpiresAt(announcement?.expires_at ? announcement.expires_at.slice(0, 16) : '')
  }, [open, announcement])

  const draftId = announcement?.id ?? null

  const audience = useQuery({
    queryKey: communicationKeys.audience(draftId ?? 'none'),
    queryFn: () => communicationsApi.audience(draftId!),
    enabled: open && draftId !== null,
  })

  function payload(publish: boolean): AnnouncementInput {
    return {
      title: title.trim(),
      body: body.trim(),
      audience_kind: audienceKind,
      audience_id: NEEDS_AUDIENCE_ID.has(audienceKind) ? audienceId.trim() || null : null,
      recipient_kind: recipientKind,
      is_pinned: pinned,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      publish,
    }
  }

  function fail(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
      const fields = error.fieldErrors()
      setErrors(fields)
      if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
      return
    }
    toast.error(fallback)
  }

  const save = useMutation({
    mutationFn: () =>
      draftId
        ? communicationsApi.updateAnnouncement(draftId, { ...payload(false), publish: undefined })
        : communicationsApi.createAnnouncement(payload(false)),
    onSuccess: () => {
      toast.success('Draft saved. Nobody has been sent it yet.')
      onSaved()
    },
    onError: (error) => fail(error, 'That draft could not be saved.'),
  })

  const send = useMutation({
    mutationFn: async () => {
      /* An existing draft is corrected first, then published, so what goes out
       * is what is on screen rather than what was last saved. */
      if (draftId) {
        await communicationsApi.updateAnnouncement(draftId, {
          ...payload(false),
          publish: undefined,
        })
        return communicationsApi.publishAnnouncement(draftId)
      }
      return communicationsApi.createAnnouncement(payload(true))
    },
    onSuccess: (row) => {
      toast.success(
        row.recipient_count === undefined
          ? 'Published.'
          : `Published to ${formatNumber(row.recipient_count)} ${
              row.recipient_count === 1 ? 'person' : 'people'
            }.`,
      )
      onSaved()
    },
    onError: (error) => fail(error, 'That announcement could not be published.'),
  })

  const busy = save.isPending || send.isPending
  const ready = title.trim() !== '' && body.trim() !== ''
  const needsId = NEEDS_AUDIENCE_ID.has(audienceKind)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draftId ? 'Edit draft' : 'Write an announcement'}
      description="Saving keeps a draft. Publishing sends it, resolves who receives it, and cannot be undone."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!ready || busy} onClick={() => save.mutate()}>
            Save draft
          </Button>
          <Button
            variant="primary"
            icon={<Users size={15} />}
            loading={send.isPending}
            disabled={!ready || busy || (needsId && audienceId.trim() === '')}
            onClick={() => send.mutate()}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Title" required error={errors.title}>
          {(props) => (
            <Input
              {...props}
              value={title}
              maxLength={255}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Message" required error={errors.body}>
          {(props) => (
            <Textarea
              {...props}
              rows={6}
              value={body}
              maxLength={50000}
              onChange={(event) => setBody(event.currentTarget.value)}
            />
          )}
        </Field>

        <div className="grid gap-1 sm:grid-cols-2">
          <Field label="Audience" required error={errors.audience_kind}>
            {(props) => (
              <Select
                {...props}
                value={audienceKind}
                onChange={(event) => setAudienceKind(event.currentTarget.value as AudienceKind)}
                options={AUDIENCE_KINDS.map((kind) => ({
                  value: kind,
                  label: audienceLabel(kind, t),
                }))}
              />
            )}
          </Field>

          <Field
            label="Who in it receives it"
            error={errors.recipient_kind}
            hint="A group's notice can go to its learners, their guardians, or both."
          >
            {(props) => (
              <Select
                {...props}
                value={recipientKind}
                onChange={(event) => setRecipientKind(event.currentTarget.value as RecipientKind)}
                options={RECIPIENT_KINDS.map((kind) => ({
                  value: kind,
                  label: recipientLabel(kind, t),
                }))}
              />
            )}
          </Field>
        </div>

        {needsId && (
          <Field
            label={`Which ${audienceLabel(audienceKind, t).replace(/^One /, '')}`}
            required
            error={errors.audience_id}
            hint="The record's id. Copy it from that record's screen."
          >
            {(props) => (
              <Input
                {...props}
                value={audienceId}
                placeholder="00000000-0000-0000-0000-000000000000"
                onChange={(event) => setAudienceId(event.currentTarget.value)}
              />
            )}
          </Field>
        )}

        <div className="grid gap-1 sm:grid-cols-2">
          <Field
            label="Comes off the board on"
            error={errors.expires_at}
            hint="Optional. It stays until archived otherwise."
          >
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.currentTarget.value)}
              />
            )}
          </Field>

          <Field label="Pin">
            {() => (
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-sm text-gray-800">
                <Checkbox
                  checked={pinned}
                  onChange={(event) => setPinned(event.currentTarget.checked)}
                />
                Keep it at the top
              </label>
            )}
          </Field>
        </div>

        {/* ── Who this reaches ──────────────────────────────────────────── */}
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
          {draftId === null ? (
            <p className="text-xs text-gray-600">
              Save the draft to see how many people this audience resolves to.
            </p>
          ) : audience.isLoading ? (
            <Skeleton className="h-3 w-56" />
          ) : audience.isError ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <Warning size={13} />
              The audience could not be counted.
            </p>
          ) : audience.data ? (
            <p className="text-xs text-gray-800">
              <span className="font-semibold tabular">
                {formatNumber(audience.data.recipient_count)}
              </span>{' '}
              {audience.data.recipient_count === 1 ? 'person receives' : 'people receive'} this as
              saved
              {audience.data.student_count > 0 && (
                <span className="text-gray-600">
                  {' '}
                  · {formatNumber(audience.data.student_count)}{' '}
                  {t('learners').toLowerCase()} in the audience
                </span>
              )}
              .
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
