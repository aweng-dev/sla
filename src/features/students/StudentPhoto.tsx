import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Camera, Trash } from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { Avatar, Button } from '@/shared/ui'
import { reportError } from '@/features/academics/components/useServerErrors'
import { PHOTO_RULES, studentsApi } from './students.api'
import { useStudentPhoto } from './useStudentPhoto'

/**
 * The learner's photograph.
 *
 * ── Checked here as well as on the server, and for a reason ────────────────
 *
 * The API validates the file as an image, png/jpg/jpeg/webp, at most 8 MB and
 * between 100 and 6000 pixels a side. A photo straight off a phone camera roll
 * routinely fails the size rule — and finding that out after uploading eight
 * megabytes over a school's connection is a bad way to learn it. So the same
 * rules run before the request, and the server's answer is still surfaced if
 * the two ever disagree.
 *
 * The dimension check needs the image decoded, which is why it is async and
 * why the object URL is revoked either way.
 */
export function StudentPhoto({
  studentId,
  name,
  hasPhoto,
}: {
  studentId: string
  name: string
  hasPhoto: boolean
}) {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)

  /* Returns an object URL, or null when there is no photo — the hook owns
   * fetching the bytes and revoking the URL on unmount. */
  const photoUrl = useStudentPhoto(studentId, hasPhoto)
  const canManage = perms.has('students.manage')

  function refresh() {
    queryClient.invalidateQueries({ queryKey: qk.students.detail(studentId) })
    queryClient.invalidateQueries({ queryKey: qk.students.all })
  }

  const upload = useMutation({
    mutationFn: (file: File) => studentsApi.uploadPhoto(studentId, file),
    onSuccess: () => {
      refresh()
      toast.success('Photograph updated')
    },
    onError: (error) => reportError(error, 'The photograph could not be uploaded.'),
  })

  const remove = useMutation({
    mutationFn: () => studentsApi.removePhoto(studentId),
    onSuccess: () => {
      refresh()
      toast.success('Photograph removed')
    },
    onError: (error) => reportError(error, 'The photograph could not be removed.'),
  })

  async function choose(file: File) {
    setChecking(true)
    try {
      if (file.size > PHOTO_RULES.maxBytes) {
        toast.error(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${PHOTO_RULES.maxBytes / 1024 / 1024} MB.`,
        )
        return
      }

      const dimensions = await readDimensions(file)
      if (dimensions === null) {
        toast.error('That file could not be read as an image.')
        return
      }

      const { width, height } = dimensions
      const smallest = Math.min(width, height)
      const largest = Math.max(width, height)
      if (smallest < PHOTO_RULES.minPixels || largest > PHOTO_RULES.maxPixels) {
        toast.error(
          `That image is ${width}×${height}. It must be between ${PHOTO_RULES.minPixels} and ${PHOTO_RULES.maxPixels} pixels on each side.`,
        )
        return
      }

      upload.mutate(file)
    } finally {
      setChecking(false)
      /* Cleared so choosing the same file twice fires `change` again. */
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={photoUrl} size="xl" />

      {canManage && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              icon={<Camera size={14} />}
              loading={upload.isPending || checking}
              onClick={() => inputRef.current?.click()}
            >
              {hasPhoto ? 'Replace' : 'Add a photo'}
            </Button>
            {hasPhoto && (
              <Button
                size="sm"
                icon={<Trash size={14} />}
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-600">
            PNG, JPEG or WebP, up to {PHOTO_RULES.maxBytes / 1024 / 1024} MB.
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_RULES.accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void choose(file)
        }}
      />
    </div>
  )
}

/** Decodes just far enough to read the intrinsic size. Resolves null rather
 *  than throwing so the caller reports one clear message either way. */
function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
