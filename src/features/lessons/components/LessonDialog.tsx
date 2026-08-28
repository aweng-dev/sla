import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Field, Input, Modal, Skeleton, Textarea } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { lessonKeys, lessonsApi, type Lesson } from '../lessons.api'

/**
 * Writing one lesson.
 *
 * ── The body is fetched when the dialog opens, not carried in from the list ─
 *
 * A contents page sends titles without bodies — deliberately, so a unit with
 * twelve lessons is not twelve documents on the wire. The consequence is that
 * the list row this dialog was opened from has no text on it, and reading
 * `lesson.body` there would blank somebody's lesson the moment they pressed
 * save. So an existing lesson is re-fetched whole, and the form waits for it.
 *
 * A NEW lesson has nothing to fetch and opens immediately.
 */
export function LessonDialog({
  open,
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  open: boolean
  moduleId: string
  /** An existing lesson being edited, or null for a new one. */
  lesson: Lesson | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const existing = useQuery({
    queryKey: lessonKeys.lesson(moduleId, lesson?.id ?? 'new'),
    queryFn: () => lessonsApi.lesson(moduleId, lesson!.id),
    enabled: open && lesson !== null,
  })

  useEffect(() => {
    if (!open) return
    setErrors({})

    if (lesson === null) {
      setTitle('')
      setBody('')
      return
    }

    /* Only once the whole lesson has landed — see the note above. */
    if (existing.data) {
      setTitle(existing.data.title)
      setBody(existing.data.body ?? '')
    }
  }, [open, lesson, existing.data])

  const save = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), body: body.trim() || null }

      return lesson
        ? lessonsApi.updateLesson(moduleId, lesson.id, payload)
        : lessonsApi.createLesson(moduleId, payload)
    },
    onSuccess: () => {
      toast.success(
        lesson ? 'Saved.' : 'Lesson added at the end of the unit, as a draft.',
      )
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That lesson was not saved.')
    },
  })

  const loading = lesson !== null && existing.isLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lesson ? 'Edit lesson' : 'New lesson'}
      description={
        lesson?.is_published
          ? 'This lesson is live. Your changes appear to the class as soon as you save.'
          : 'Saved as a draft. Publish it when the class should see it.'
      }
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={title.trim() === '' || loading}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
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

          <Field
            label="Lesson"
            error={errors.body}
            hint="Can be left empty — a title on its own is a placeholder in a sequence you are still writing."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={14}
                value={body}
                maxLength={200000}
                onChange={(event) => setBody(event.currentTarget.value)}
              />
            )}
          </Field>
        </div>
      )}
    </Modal>
  )
}
