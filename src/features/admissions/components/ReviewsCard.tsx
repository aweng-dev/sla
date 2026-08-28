import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber } from '@/shared/lib/format'
import {
  admissionKeys,
  admissionsApi,
  RECOMMENDATION_LABELS,
  type Recommendation,
} from '../admissions.api'

/**
 * What the people who read this application thought.
 *
 * ── Reviews accumulate; they do not overwrite ──────────────────────────────
 *
 * The endpoint only creates. There is no update and no delete, and that is the
 * design: two reviewers disagreeing is the useful signal, and a screen that let
 * the second one edit the first's note would destroy it. So this adds a review
 * and never edits one.
 *
 * ── The recommendation is not the decision ─────────────────────────────────
 *
 * "Admit" here is one reader's opinion. The decision is an OFFER, made once,
 * from the decision rail. Keeping them apart is what stops a strong review from
 * reading as an accepted place.
 */
export function ReviewsCard({
  applicationId,
  canReview,
}: {
  applicationId: string
  canReview: boolean
}) {
  const queryClient = useQueryClient()
  const [writing, setWriting] = useState(false)

  const reviews = useQuery({
    queryKey: [...admissionKeys.application(applicationId), 'reviews'],
    queryFn: () => admissionsApi.reviews(applicationId),
  })

  const rows = reviews.data ?? []
  const scored = rows.filter((row) => row.score !== null)
  const average =
    scored.length === 0
      ? null
      : scored.reduce((sum, row) => sum + (row.score ?? 0), 0) / scored.length

  return (
    <>
      <Card>
        <CardHeader
          title="Reviews"
          subtitle={
            rows.length === 0
              ? 'Nobody has read this yet'
              : average === null
                ? `${formatNumber(rows.length)} ${rows.length === 1 ? 'review' : 'reviews'}`
                : `${formatNumber(rows.length)} ${rows.length === 1 ? 'review' : 'reviews'} · average score ${average.toFixed(1)}`
          }
          actions={
            canReview ? (
              <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setWriting(true)}>
                Add
              </Button>
            ) : undefined
          }
        />

        {reviews.isError ? (
          <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />
        ) : reviews.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">
            A review is one reader&rsquo;s recommendation, with a score and a note.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((review) => (
              <li key={review.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      review.recommendation === 'admit'
                        ? 'success'
                        : review.recommendation === 'reject'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {review.recommendation_label}
                  </Badge>
                  {review.score !== null && (
                    <span className="text-sm text-gray-900 tabular">{formatNumber(review.score)}</span>
                  )}
                  <span className="ml-auto text-2xs text-gray-500">
                    {review.reviewed_at ? formatDate(review.reviewed_at) : '—'}
                  </span>
                </div>
                {review.notes && (
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{review.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReviewDialog
        open={writing}
        applicationId={applicationId}
        onClose={() => setWriting(false)}
        onSaved={() => {
          setWriting(false)
          queryClient.invalidateQueries({ queryKey: admissionKeys.application(applicationId) })
        }}
      />
    </>
  )
}

function ReviewDialog({
  open,
  applicationId,
  onClose,
  onSaved,
}: {
  open: boolean
  applicationId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [recommendation, setRecommendation] = useState<Recommendation>('interview')
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () =>
      admissionsApi.addReview(applicationId, {
        recommendation,
        score: score.trim() === '' ? undefined : Number(score),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setScore('')
      setNotes('')
      setErrors({})
      toast.success('Review recorded.')
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That review was not saved.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a review"
      description="Your recommendation is recorded alongside everybody else's. It is not the decision."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Record review
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Recommendation" required error={errors.recommendation}>
          {(props) => (
            <Select
              {...props}
              value={recommendation}
              onChange={(event) => setRecommendation(event.currentTarget.value as Recommendation)}
              options={(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((key) => ({
                value: key,
                label: RECOMMENDATION_LABELS[key],
              }))}
            />
          )}
        </Field>

        <Field label="Score" error={errors.score} hint="Optional, on whatever scale this intake uses.">
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="decimal"
              value={score}
              onChange={(event) => setScore(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Notes" error={errors.notes}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
