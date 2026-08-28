import { useState } from 'react'
import { CheckCircle, DotsThree, PencilSimple, Trash } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { cn } from '@/shared/lib/cn'
import { Badge, Blank, Menu, StatusBadge } from '@/shared/ui'
import { assessmentKeys, questionsApi } from './assessment.api'
import type { QuestionRow } from './assessment.types'

/**
 * One question, as Sprig draws one in a study.
 *
 * A number in the gutter, the prompt in primary ink, a quiet meta line under
 * it, and the actions on the right. The ANSWER is shown inline rather than
 * hidden behind an edit click — a bank is read far more often than it is
 * written, and the thing a reader is checking is almost always "is the key
 * right".
 *
 * ── Why the answer is drawn per type ───────────────────────────────────────
 *
 * The API stores a discriminated `answer_key`, so the card can render the
 * truth rather than a guess: ticked choices for a multiple choice, the boolean
 * for a true/false, the accepted spellings for a short answer, the pairs for a
 * matching, and an honest "marked by hand" for an essay.
 */
export function QuestionCard({
  question,
  index,
  canManage,
  onEdit,
}: {
  question: QuestionRow
  index: number
  canManage: boolean
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const version = question.current_version

  type CardAction = { kind: 'status'; status: string } | { kind: 'delete' }

  const mutate = useMutation({
    /* Both branches are awaited to `void` so the two return types — a deleted
     * 204 and the updated question — do not have to be reconciled by a caller
     * that uses neither. */
    mutationFn: async (action: CardAction): Promise<void> => {
      if (action.kind === 'delete') {
        await questionsApi.remove(question.id)
        return
      }
      await questionsApi.setStatus(question.id, action.status)
    },
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.all })
      toast.success(action.kind === 'delete' ? 'Question removed' : 'Status updated')
      setConfirming(false)
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  /* draft → active is the common move, so it is the one named on the menu.
   * Retiring is offered from active; a retired question can be revived. */
  const statusActions =
    question.status === 'draft'
      ? [{ key: 'active', label: 'Publish to the bank', status: 'active' }]
      : question.status === 'active'
        ? [{ key: 'retired', label: 'Retire', status: 'retired' }]
        : [{ key: 'active', label: 'Return to the bank', status: 'active' }]

  return (
    <div className="flex gap-3 border-b border-gray-200 px-4 py-4 last:border-b-0">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-[0.6875rem] font-medium text-gray-700 tabular"
        aria-hidden
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{version?.prompt ?? <Blank />}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-gray-600">
          <Badge tone="neutral">{question.type_label}</Badge>
          <span>{question.difficulty_label}</span>
          <span className="text-gray-400" aria-hidden>
            ·
          </span>
          <span className="tabular">
            {version ? `${version.points} ${version.points === 1 ? 'mark' : 'marks'}` : '—'}
          </span>
          {question.topic && (
            <>
              <span className="text-gray-400" aria-hidden>
                ·
              </span>
              <span>{question.topic}</span>
            </>
          )}
          {question.outcome_code && (
            <>
              <span className="text-gray-400" aria-hidden>
                ·
              </span>
              <span className="font-mono text-[0.6875rem]">{question.outcome_code}</span>
            </>
          )}
          {(question.version_count ?? 0) > 1 && (
            <>
              <span className="text-gray-400" aria-hidden>
                ·
              </span>
              <span>v{version?.version_number}</span>
            </>
          )}
          {!question.is_auto_markable && (
            <>
              <span className="text-gray-400" aria-hidden>
                ·
              </span>
              <span>Marked by hand</span>
            </>
          )}
        </div>

        <AnswerPreview question={question} />

        {question.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {question.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.6875rem] text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-2">
        <StatusBadge status={question.status} />

        {canManage && (
          <Menu
            items={[
              { key: 'edit', label: 'Revise', icon: <PencilSimple size={15} />, onSelect: onEdit },
              ...statusActions.map((action) => ({
                key: action.key,
                label: action.label,
                icon: <CheckCircle size={15} />,
                onSelect: () => mutate.mutate({ kind: 'status', status: action.status }),
              })),
              {
                key: 'delete',
                label: confirming ? 'Really remove it?' : 'Remove',
                icon: <Trash size={15} />,
                destructive: true,
                separated: true,
                /* Two clicks, without a second dialog on top of the one this
                 * card may already be inside. */
                onSelect: () =>
                  confirming ? mutate.mutate({ kind: 'delete' }) : setConfirming(true),
              },
            ]}
            trigger={({ toggle, ref, open }) => (
              <button
                ref={ref as never}
                type="button"
                onClick={toggle}
                aria-label={`Actions for question ${index + 1}`}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
                  open && 'bg-gray-100 text-gray-900',
                )}
              >
                <DotsThree size={16} weight="bold" />
              </button>
            )}
          />
        )}
      </div>
    </div>
  )
}

/** The marking rule, drawn the way the type stores it. */
function AnswerPreview({ question }: { question: QuestionRow }) {
  const version = question.current_version
  const key = version?.answer_key
  const options = version?.options ?? []

  if (question.type === 'essay') return null

  if (question.type === 'multiple_choice' && options.length > 0) {
    return (
      <ul className="mt-2 flex flex-col gap-1">
        {options.map((option) => (
          <li key={option.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                option.is_correct ? 'bg-success-500' : 'bg-gray-300',
              )}
              aria-hidden
            />
            <span className={option.is_correct ? 'text-gray-900' : 'text-gray-600'}>
              {option.content}
            </span>
            {option.is_correct && <span className="sr-only">(correct)</span>}
          </li>
        ))}
      </ul>
    )
  }

  if (question.type === 'matching' && options.length > 0) {
    return (
      <ul className="mt-2 flex flex-col gap-1">
        {options.map((option) => (
          <li key={option.id} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-gray-900">{option.content}</span>
            <span className="text-gray-400" aria-hidden>
              →
            </span>
            <span>{option.match_key || <Blank />}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (question.type === 'true_false' && key?.value !== undefined) {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-500" aria-hidden />
        <span className="text-gray-900">{key.value ? 'True' : 'False'}</span>
      </p>
    )
  }

  if (question.type === 'short_answer' && (key?.accepted?.length ?? 0) > 0) {
    return (
      <p className="mt-2 text-sm text-gray-700">
        Accepts <span className="text-gray-900">{key!.accepted!.join(', ')}</span>
        {key?.case_sensitive ? ' · case sensitive' : ''}
      </p>
    )
  }

  return null
}
