import { useEffect } from 'react'
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { cn } from '@/shared/lib/cn'
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '@/shared/ui'
import { assessmentKeys, banksApi, questionsApi } from './assessment.api'
import {
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  type QuestionPayload,
  type QuestionRow,
  type QuestionType,
} from './assessment.types'

/**
 * Writing a question, and rewriting one.
 *
 * ── The answer editor is the question type ─────────────────────────────────
 *
 * Every survey and assessment builder worth copying — Sprig's own, Maze's,
 * Typeform's — puts the type first and then changes the rest of the form to
 * match it, because a "correct answer" means something different in each:
 *
 *   multiple choice  a set of choices, one or more marked correct
 *   true / false     one boolean
 *   short answer     a list of accepted spellings, and whether case matters
 *   matching         pairs — the left half is shown, the right half is the key
 *   essay            nothing, because a person marks it
 *
 * So the type is a row of buttons at the top rather than a dropdown buried in
 * the middle: it is the decision the rest of the form hangs off.
 *
 * ── Saving an edit writes a VERSION ────────────────────────────────────────
 *
 * `POST /teaching/questions/{id}/revisions` does not overwrite the wording; it
 * writes a new version and makes it current. That is why the footer of an edit
 * says "Save as new version" rather than "Save" — the reader should know the
 * old paper still reads the way it was sat.
 */

const optionSchema = z.object({
  content: z.string().trim().min(1, 'Enter the choice'),
  is_correct: z.boolean(),
  match_key: z.string().trim(),
  feedback: z.string().trim(),
})

const schema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, 'Enter the question').max(20000),
    explanation: z.string().trim().max(20000),
    points: z
      .string()
      .refine((v) => v === '' || (Number(v) > 0 && Number(v) <= 999999), 'Marks must be above zero'),
    difficulty: z.enum(QUESTION_DIFFICULTIES),
    topic: z.string().trim().max(160),
    outcome_code: z.string().trim().max(80),
    tags: z.string().trim(),
    options: z.array(optionSchema),
    true_false_answer: z.enum(['true', 'false']),
    accepted: z.string().trim(),
    case_sensitive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    /* Type-specific rules the API also enforces — checked here so the reader
     * is told before the request rather than by a 422 after it. */
    if (values.type === 'multiple_choice') {
      if (values.options.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two choices' })
      } else if (!values.options.some((option) => option.is_correct)) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Mark one choice as correct' })
      }
    }
    if (values.type === 'matching') {
      if (values.options.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two pairs' })
      } else if (values.options.some((option) => option.match_key.trim() === '')) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Every pair needs a match' })
      }
    }
    if (values.type === 'short_answer' && values.accepted.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['accepted'], message: 'Add at least one accepted answer' })
    }
  })

type Values = z.infer<typeof schema>

const BLANK: Values = {
  type: 'multiple_choice',
  prompt: '',
  explanation: '',
  points: '1',
  difficulty: 'medium',
  topic: '',
  outcome_code: '',
  tags: '',
  options: [
    { content: '', is_correct: true, match_key: '', feedback: '' },
    { content: '', is_correct: false, match_key: '', feedback: '' },
  ],
  true_false_answer: 'true',
  accepted: '',
  case_sensitive: false,
}

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
  essay: 'Essay',
  matching: 'Matching',
}

/** One line each, shown under the type row so the choice is informed. */
const TYPE_HINTS: Record<QuestionType, string> = {
  multiple_choice: 'Marked automatically against the choices you tick.',
  true_false: 'Marked automatically against one answer.',
  short_answer: 'Marked automatically against the spellings you accept.',
  essay: 'Marked by hand. No answer key.',
  matching: 'Marked automatically by pairing each item with its match.',
}

function present(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function fromQuestion(question: QuestionRow): Values {
  const version = question.current_version
  const key = version?.answer_key
  return {
    type: question.type,
    prompt: version?.prompt ?? '',
    explanation: version?.explanation ?? '',
    points: version ? String(version.points) : '1',
    difficulty: question.difficulty,
    topic: question.topic ?? '',
    outcome_code: question.outcome_code ?? '',
    tags: (question.tags ?? []).join(', '),
    options:
      (version?.options ?? []).map((option) => ({
        content: option.content,
        is_correct: option.is_correct,
        match_key: option.match_key ?? '',
        feedback: option.feedback ?? '',
      })) ?? [],
    true_false_answer: key?.value === false ? 'false' : 'true',
    accepted: (key?.accepted ?? []).join('\n'),
    case_sensitive: key?.case_sensitive === true,
  }
}

export function QuestionDialog({
  open,
  onClose,
  bankId,
  /** Absent to write a new question; present to revise one. */
  question,
}: {
  open: boolean
  onClose: () => void
  bankId: string
  question?: QuestionRow
}) {
  const queryClient = useQueryClient()
  const editing = question !== undefined

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const { control, formState, handleSubmit, register, reset, setError, setValue, watch } = form
  const options = useFieldArray({ control, name: 'options' })

  const type = watch('type')

  useEffect(() => {
    if (!open) return
    reset(question ? fromQuestion(question) : BLANK)
  }, [open, question, reset])

  /* Switching to a type that needs choices, from one that does not, must not
   * leave the reader staring at an empty list with no way to start. */
  useEffect(() => {
    if ((type === 'multiple_choice' || type === 'matching') && options.fields.length === 0) {
      options.replace([
        { content: '', is_correct: type === 'multiple_choice', match_key: '', feedback: '' },
        { content: '', is_correct: false, match_key: '', feedback: '' },
      ])
    }
  }, [type, options])

  const save = useMutation({
    mutationFn: (payload: QuestionPayload) =>
      editing ? questionsApi.revise(question.id, payload) : banksApi.addQuestion(bankId, payload),
    onSuccess: () => {
      /* One key clears both branches: a new question changes its bank's counts
       * as well as the question list. */
      queryClient.invalidateQueries({ queryKey: assessmentKeys.all })
      toast.success(editing ? 'New version saved' : 'Question added')
      onClose()
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        toast.error('The question could not be saved.')
        return
      }
      const fields = error.fieldErrors()
      for (const [field, message] of Object.entries(fields)) {
        /* `options.0.content` is exactly the path react-hook-form registered,
         * so the API's own field names land on the right input. */
        setError(field as FieldPath<Values>, { message })
      }
      if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
    },
  })

  function submit(values: Values) {
    const payload: QuestionPayload = {
      type: values.type,
      prompt: values.prompt.trim(),
      explanation: present(values.explanation),
      points: values.points === '' ? undefined : Number(values.points),
      difficulty: values.difficulty,
      topic: present(values.topic),
      outcome_code: present(values.outcome_code),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }

    if (values.type === 'multiple_choice') {
      payload.options = values.options.map((option, index) => ({
        content: option.content.trim(),
        is_correct: option.is_correct,
        feedback: present(option.feedback),
        sequence: index + 1,
      }))
    }
    if (values.type === 'matching') {
      payload.options = values.options.map((option, index) => ({
        content: option.content.trim(),
        match_key: option.match_key.trim(),
        sequence: index + 1,
      }))
    }
    if (values.type === 'true_false') {
      payload.answer_key = { value: values.true_false_answer === 'true' }
    }
    if (values.type === 'short_answer') {
      payload.answer_key = {
        accepted: values.accepted
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }
      payload.settings = { case_sensitive: values.case_sensitive }
    }

    save.mutate(payload)
  }

  const optionError = formState.errors.options?.message ?? formState.errors.options?.root?.message

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Revise question' : 'Add a question'}
      description={
        editing
          ? 'Saving writes a new version. The wording already sat stays readable.'
          : 'The answer editor changes with the type you choose.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit(submit)}>
            {editing ? 'Save as new version' : 'Add question'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
        {/* ── Type ─────────────────────────────────────────────────────── */}
        <div>
          <p className="pb-1.5 text-xs text-gray-600">Type</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Question type">
            {QUESTION_TYPES.map((option) => {
              const active = type === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={editing}
                  onClick={() => setValue('type', option, { shouldDirty: true })}
                  className={cn(
                    'h-8 rounded-md border px-3 text-[0.8125rem] transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    active
                      ? 'border-gray-900 bg-gray-900 font-medium text-white'
                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
                  )}
                >
                  {TYPE_LABELS[option]}
                </button>
              )
            })}
          </div>
          <p className="pt-1.5 text-xs text-gray-600">
            {TYPE_HINTS[type]}
            {editing && ' A revision cannot change the type — write a new question instead.'}
          </p>
        </div>

        <Field label="Question" required error={formState.errors.prompt?.message}>
          {(props) => (
            <Textarea {...props} rows={3} placeholder="What are you asking?" {...register('prompt')} />
          )}
        </Field>

        {/* ── The answer, whatever that means for this type ─────────────── */}
        {(type === 'multiple_choice' || type === 'matching') && (
          <div>
            <div className="flex items-baseline justify-between pb-1.5">
              <p className="text-xs text-gray-600">
                {type === 'multiple_choice' ? 'Choices' : 'Pairs'}
              </p>
              {type === 'multiple_choice' && (
                <p className="text-xs text-gray-500">Tick every choice that is correct</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {options.fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2">
                  {type === 'multiple_choice' ? (
                    <label className="flex h-8 shrink-0 items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer appearance-none rounded-sm border border-gray-400 bg-white transition-colors checked:border-brand-400 checked:bg-brand-400"
                        {...register(`options.${index}.is_correct`)}
                        aria-label={`Choice ${index + 1} is correct`}
                      />
                    </label>
                  ) : (
                    <span className="flex h-8 w-5 shrink-0 items-center justify-center text-xs text-gray-500 tabular">
                      {index + 1}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder={type === 'matching' ? 'Item' : `Choice ${index + 1}`}
                      aria-label={type === 'matching' ? `Item ${index + 1}` : `Choice ${index + 1}`}
                      invalid={Boolean(formState.errors.options?.[index]?.content)}
                      {...register(`options.${index}.content`)}
                    />
                  </div>

                  {type === 'matching' && (
                    <div className="min-w-0 flex-1">
                      <Input
                        placeholder="Matches with"
                        aria-label={`Match for item ${index + 1}`}
                        invalid={Boolean(formState.errors.options?.[index]?.match_key)}
                        {...register(`options.${index}.match_key`)}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => options.remove(index)}
                    disabled={options.fields.length <= 2}
                    aria-label={`Remove ${type === 'matching' ? 'pair' : 'choice'} ${index + 1}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-danger-500 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>

            {optionError && (
              <p role="alert" className="pt-1.5 text-xs text-danger-500">
                {optionError}
              </p>
            )}

            <Button
              size="sm"
              variant="link"
              icon={<Plus size={13} weight="bold" />}
              className="mt-2"
              onClick={() =>
                options.append({ content: '', is_correct: false, match_key: '', feedback: '' })
              }
            >
              Add {type === 'matching' ? 'pair' : 'choice'}
            </Button>
          </div>
        )}

        {type === 'true_false' && (
          <Field label="Correct answer" error={formState.errors.true_false_answer?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('true_false_answer')}
                options={[
                  { value: 'true', label: 'True' },
                  { value: 'false', label: 'False' },
                ]}
              />
            )}
          </Field>
        )}

        {type === 'short_answer' && (
          <>
            <Field
              label="Accepted answers"
              hint="One per line. Any of them is marked correct."
              error={formState.errors.accepted?.message}
            >
              {(props) => <Textarea {...props} rows={3} {...register('accepted')} />}
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <Switch
                checked={watch('case_sensitive')}
                onChange={(next) => setValue('case_sensitive', next, { shouldDirty: true })}
                label="Case sensitive"
              />
              Case sensitive
            </label>
          </>
        )}

        {type === 'essay' && (
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            An essay has no answer key. It appears in the marking queue for whoever is
            marking the paper.
          </p>
        )}

        {/* ── Everything that is true of the question whatever its type ─── */}
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Marks" error={formState.errors.points?.message}>
            {(props) => <Input {...props} type="number" step="0.5" min="0.5" {...register('points')} />}
          </Field>
          <Field label="Difficulty" error={formState.errors.difficulty?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('difficulty')}
                options={QUESTION_DIFFICULTIES.map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }))}
              />
            )}
          </Field>
          <Field label="Topic" error={formState.errors.topic?.message}>
            {(props) => <Input {...props} placeholder="Photosynthesis" {...register('topic')} />}
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Outcome code"
            hint="The syllabus objective this covers."
            error={formState.errors.outcome_code?.message}
          >
            {(props) => <Input {...props} placeholder="BIO.1.2" {...register('outcome_code')} />}
          </Field>
          <Field label="Tags" hint="Comma separated." error={formState.errors.tags?.message}>
            {(props) => <Input {...props} placeholder="biology, plants" {...register('tags')} />}
          </Field>
        </div>

        <Field
          label="Explanation"
          hint="Shown to the learner after marking, where the paper allows it."
          error={formState.errors.explanation?.message}
        >
          {(props) => <Textarea {...props} rows={2} {...register('explanation')} />}
        </Field>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/** Exported so the list, the cards and the dialog agree on wording. */
export const QUESTION_TYPE_LABELS = TYPE_LABELS
