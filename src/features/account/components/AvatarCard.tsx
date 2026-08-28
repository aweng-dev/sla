import { useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import type { Account, MeResponse } from '@/shared/types/auth.types'
import { Avatar, Button, Card, CardBody, CardHeader, Skeleton } from '@/shared/ui'
import { accountApi, AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '../account.api'
import { useAvatarUrl } from '../useAvatar'

const ACCEPT = AVATAR_MIME_TYPES.join(',')

/** Refuses what the server would refuse, before spending an 8 MB upload on
 *  finding out. Dimensions are not checked here — measuring them means
 *  decoding the image, and the server's message about it is a better one than
 *  any this could write. */
function localRefusal(file: File): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a PNG, JPG or WebP image.'
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'That file is larger than 8 MB. Most phone photographs are well under it.'
  }
  return null
}

export function AvatarCard({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const { url, isLoading } = useAvatarUrl(account.has_avatar)

  function applyAccount(updated: Account) {
    queryClient.setQueryData<MeResponse>(qk.auth.me, (previous) =>
      previous ? { ...previous, user: updated } : previous,
    )
    queryClient.invalidateQueries({ queryKey: qk.auth.me })
  }

  const upload = useMutation({
    mutationFn: (file: File) => accountApi.uploadAvatar(file),
    onSuccess: (updated) => {
      applyAccount(updated)
      /* The blob is keyed on nothing but the caller, so a replacement lands on
       * the same key and the stale bytes have to be evicted by hand. */
      queryClient.invalidateQueries({ queryKey: qk.account.avatar })
      setRefusal(null)
      toast.success('Your photo was updated')
    },
    onError: (error) => {
      /* The server checks the pixel dimensions this side cannot, so its
       * refusal is shown verbatim rather than replaced with a generic line. */
      setRefusal(
        error instanceof ApiError
          ? (error.fieldErrors().avatar ?? error.rootMessage())
          : 'The photo could not be uploaded.',
      )
    },
  })

  const remove = useMutation({
    mutationFn: () => accountApi.deleteAvatar(),
    onSuccess: (updated) => {
      applyAccount(updated)
      queryClient.removeQueries({ queryKey: qk.account.avatar })
      setRefusal(null)
      toast.success('Your photo was removed')
    },
    onError: (error) => {
      setRefusal(
        error instanceof ApiError ? error.rootMessage() : 'The photo could not be removed.',
      )
    },
  })

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    /* Cleared so that picking the same file again still fires a change. */
    event.target.value = ''
    if (!file) return

    const problem = localRefusal(file)
    if (problem) {
      setRefusal(problem)
      return
    }

    setRefusal(null)
    upload.mutate(file)
  }

  const busy = upload.isPending || remove.isPending

  /* Sprig's Avatar card, matched: a heading and a line of help, a hairline, the
   * round image at 64px on the left, and the two actions directly beneath it —
   * yellow Upload New, white Remove. Nothing is centred and neither button
   * carries an icon. The name and email are not repeated here; they are the two
   * fields of the card immediately below, and printing them twice reads as a
   * profile widget rather than as a photo control. */
  return (
    <Card>
      <CardHeader title="Photo" subtitle="Helps colleagues recognise you across the product." />
      <CardBody className="flex flex-col items-start gap-3">
        {isLoading ? (
          <Skeleton className="h-16 w-16 rounded-full" />
        ) : (
          <Avatar name={account.name} src={url} size="xl" />
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            loading={upload.isPending}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {account.has_avatar ? 'Upload New' : 'Upload a Photo'}
          </Button>

          {account.has_avatar && (
            <Button loading={remove.isPending} disabled={busy} onClick={() => remove.mutate()}>
              Remove
            </Button>
          )}
        </div>

        {refusal ? (
          <p role="alert" className="text-xs text-danger-500">
            {refusal}
          </p>
        ) : (
          <p className="text-xs text-gray-500">PNG, JPG or WebP, at least 100 × 100, up to 8 MB.</p>
        )}
      </CardBody>
    </Card>
  )
}
