import { useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { Badge, Select, Textarea } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatNumber } from '@/shared/lib/format'
import type { AnswerResponse, AttemptAnswer } from '../exams.api'

/**
 * One question, as the candidate is being asked it.
 *
 * ── The options are already in the right order ─────────────────────────────
 *
 * They come from the snapshot frozen onto this attempt, in the sequence this
 * candidate was served — which on a shuffled paper is not the order anybody
 * else saw. Re-sorting them here would undo the shuffle, and on a paper where
 * the shuffle is the anti-collusion measure that is the whole point of it.
 *
 * ── Text is reported up as the candidate types, and saved by the parent ────
 *
 * This component holds the keystrokes so typing is never laggy, and tells the
 * runner on every change. The runner debounces and saves. Splitting it that way
 * keeps one place responsible for what has reached the server, which is the
 * only question that matters when a clock runs out mid-sentence.
 */
export function QuestionField({
  answer,
  readOnly,
  onChange,
  onCommit,
}: {
  answer: AttemptAnswer
  /** A submitted paper, or one whose time has gone. */
  readOnly: boolean
  /** Every keystroke, for the runner to debounce. */
  onChange: (response: AnswerResponse | null) => void
  /** A choice worth writing immediately — a radio, a select, a blur. */
  onCommit: (response: AnswerResponse | null) => void
}) {
  const [text, setText] = useState(answer.response?.text ?? '')
  const lastAnswerId = useRef(answer.id)

  /* Seeded per question rather than per render, so moving between questions
   * shows what is stored and typing is never overwritten mid-word. */
  useEffect(() => {
    if (lastAnswerId.current !== answer.id) {
      lastAnswerId.current = answer.id
      setText(answer.response?.text ?? '')
    }
  }, [answer.id, answer.response?.text])

  if (answer.type === 'multiple_choice') {
    return (
      <fieldset className="flex flex-col gap-1.5" disabled={readOnly}>
        <legend className="sr-only">Choose one</legend>
        {answer.options.map((option) => {
          const chosen = answer.response?.option_id === option.id

          return (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors',
                readOnly && 'cursor-not-allowed',
                chosen ? 'border-gray-400 bg-rail-active' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <input
                type="radio"
                name={`answer-${answer.id}`}
                checked={chosen}
                disabled={readOnly}
                onChange={() => onCommit({ option_id: option.id })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
              />
              <span className="min-w-0 flex-1 text-gray-900">{option.content}</span>
            </label>
          )
        })}
      </fieldset>
    )
  }

  if (answer.type === 'true_false') {
    return (
      <fieldset className="flex gap-2" disabled={readOnly}>
        <legend className="sr-only">True or false</legend>
        {[
          { value: true, label: 'True' },
          { value: false, label: 'False' },
        ].map((option) => {
          const chosen = answer.response?.value === option.value

          return (
            <label
              key={option.label}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors',
                readOnly && 'cursor-not-allowed',
                chosen ? 'border-gray-400 bg-rail-active' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <input
                type="radio"
                name={`answer-${answer.id}`}
                checked={chosen}
                disabled={readOnly}
                onChange={() => onCommit({ value: option.value })}
                className="h-4 w-4 accent-gray-900"
              />
              <span className="text-gray-900">{option.label}</span>
            </label>
          )
        })}
      </fieldset>
    )
  }

  if (answer.type === 'matching') {
    const pairs = answer.response?.pairs ?? {}

    return (
      <ul className="flex flex-col gap-2">
        {answer.options.map((left) => (
          <li key={left.id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-sm text-gray-900">{left.content}</span>
            <div className="w-full sm:w-56">
              <Select
                aria-label={`Match for ${left.content}`}
                value={pairs[left.id] ?? ''}
                disabled={readOnly}
                onChange={(event) =>
                  onCommit({
                    pairs: { ...pairs, [left.id]: event.currentTarget.value || null },
                  })
                }
                placeholder="Choose"
                options={answer.match_options.map((right) => ({
                  value: right.id,
                  label: right.content,
                }))}
              />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  /* short_answer and essay */
  return (
    <Textarea
      aria-label="Your answer"
      rows={answer.type === 'essay' ? 12 : 3}
      value={text}
      readOnly={readOnly}
      maxLength={50000}
      placeholder={readOnly ? '' : 'Type your answer'}
      onChange={(event) => {
        setText(event.currentTarget.value)
        onChange({ text: event.currentTarget.value })
      }}
      /* A blur is a decision point: leaving the box should not depend on a
       * debounce that has not fired yet. */
      onBlur={() => onCommit({ text })}
    />
  )
}

/**
 * What a released paper says about one answer.
 *
 * Drawn only from fields the server chose to send. `is_correct` arrives solely
 * where the sitting is released AND the paper reveals answers, so its absence
 * is not "we do not know" — it is "you are not being told", and the screen
 * simply says nothing rather than guessing.
 */
export function AnswerVerdict({ answer }: { answer: AttemptAnswer }) {
  if (answer.awaiting_marking) {
    return <Badge tone="neutral">Waiting to be marked</Badge>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {answer.is_correct === true && (
        <span className="inline-flex items-center gap-1 text-xs text-success-600">
          <CheckCircle size={14} weight="fill" />
          Correct
        </span>
      )}
      {answer.is_correct === false && (
        <span className="inline-flex items-center gap-1 text-xs text-danger-600">
          <XCircle size={14} weight="fill" />
          Not correct
        </span>
      )}
      {answer.score !== null && (
        <span className="text-xs text-gray-900 tabular">
          {formatNumber(answer.score)} / {formatNumber(answer.max_score)}
        </span>
      )}
      {answer.feedback && <p className="w-full text-xs text-gray-600">{answer.feedback}</p>}
      {answer.explanation && (
        <p className="w-full text-xs text-gray-600">{answer.explanation}</p>
      )}
    </div>
  )
}
