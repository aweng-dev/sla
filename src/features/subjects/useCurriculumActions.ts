import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { reportError } from '@/features/academics/components/useServerErrors'
import { academicsKeys } from '@/features/academics/academics.keys'
import {
  curriculumApi,
  curriculumKeys,
  type OfferingCurriculum,
} from './curriculum.api'

/**
 * The things that happen TO a scheme of work, as opposed to inside one.
 *
 * ── One place, because three screens do the same five things ───────────────
 *
 * The class list, the curriculum list and the editor's own header all publish,
 * withdraw, archive, duplicate and discard. Three copies of those mutations
 * would be three chances for one of them to forget an invalidation and leave a
 * published document still showing "Draft".
 *
 * ── Everything invalidates the list AND the document ───────────────────────
 *
 * Publishing changes the row's badge and freezes the content the editor has
 * open. A caller that refreshed only the one it was looking at would leave the
 * other stale, and the editor going read-only is the half that matters.
 */
export function useCurriculumActions(options?: { onDiscarded?: () => void }) {
  const queryClient = useQueryClient()

  /* Held so a failing duplicate can put its message on the dialog's own fields
   * rather than in a toast the dialog covers. */
  const [duplicateError, setDuplicateError] = useState<unknown>(null)
  const [createError, setCreateError] = useState<unknown>(null)

  function settle(message: string, id?: string) {
    queryClient.invalidateQueries({ queryKey: curriculumKeys.root })
    if (id) queryClient.invalidateQueries({ queryKey: curriculumKeys.detail(id) })
    /* The subject's own counts move with it. */
    queryClient.invalidateQueries({ queryKey: academicsKeys.courses.all })
    toast.success(message)
  }

  const create = useMutation({
    mutationFn: ({
      offeringId,
      input,
    }: {
      offeringId: string
      input: { title: string; summary?: string | null; version?: string }
      /** Named for the toast, so it says which class got the document. */
      className?: string
    }) => curriculumApi.create(offeringId, input),
    onMutate: () => setCreateError(null),
    onSuccess: (created, variables) => {
      settle(
        variables.className
          ? `Curriculum started for ${variables.className}`
          : 'Curriculum started',
        created.id,
      )
    },
    onError: (error) => setCreateError(error),
  })

  const duplicate = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: { course_offering_id: string; title?: string; version?: string }
    }) => curriculumApi.duplicate(id, input),
    onMutate: () => setDuplicateError(null),
    onSuccess: (copy) => {
      settle(
        `Copied to ${copy.learning_group_name ?? 'the other class'} as a draft`,
        copy.id,
      )
    },
    onError: (error) => setDuplicateError(error),
  })

  const publish = useMutation({
    mutationFn: (curriculum: OfferingCurriculum) => curriculumApi.publish(curriculum.id),
    onSuccess: (published) =>
      settle(
        `Published${published.learning_group_name ? ` for ${published.learning_group_name}` : ''}`,
        published.id,
      ),
    /* Wrapped, not passed bare: `reportError`'s second parameter is a fallback
     * message, and TanStack would hand it the mutation variables. */
    onError: (error) => reportError(error),
  })

  const withdraw = useMutation({
    mutationFn: (curriculum: OfferingCurriculum) => curriculumApi.withdraw(curriculum.id),
    onSuccess: (draft) => settle('Back to draft — it can be edited again', draft.id),
    /* Wrapped, not passed bare: `reportError`'s second parameter is a fallback
     * message, and TanStack would hand it the mutation variables. */
    onError: (error) => reportError(error),
  })

  const archive = useMutation({
    mutationFn: (curriculum: OfferingCurriculum) => curriculumApi.archive(curriculum.id),
    onSuccess: (archived) => settle('Archived', archived.id),
    /* Wrapped, not passed bare: `reportError`'s second parameter is a fallback
     * message, and TanStack would hand it the mutation variables. */
    onError: (error) => reportError(error),
  })

  const discard = useMutation({
    mutationFn: (curriculum: OfferingCurriculum) => curriculumApi.discard(curriculum.id),
    onSuccess: () => {
      settle('Draft discarded')
      options?.onDiscarded?.()
    },
    /* Wrapped, not passed bare: `reportError`'s second parameter is a fallback
     * message, and TanStack would hand it the mutation variables. */
    onError: (error) => reportError(error),
  })

  return {
    create,
    createError,
    duplicate,
    duplicateError,
    publish,
    withdraw,
    archive,
    discard,
    /** True while any of them is in flight — for disabling a row's whole menu
     *  rather than letting a second click race the first. */
    busy:
      create.isPending ||
      duplicate.isPending ||
      publish.isPending ||
      withdraw.isPending ||
      archive.isPending ||
      discard.isPending,
  }
}
