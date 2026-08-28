import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { GraduationCap, SealCheck, Ticket } from '@phosphor-icons/react'
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
  ReasonDialog,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatDateTime } from '@/shared/lib/format'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  admissionKeys,
  admissionsApi,
  type AdmissionOffer,
  type Conversion,
} from '../admissions.api'

/**
 * The decision, and what it becomes.
 *
 * ── An offer is the only thing that admits anybody ─────────────────────────
 *
 * Reviews recommend and interviews score; neither admits. `POST .../offers`
 * writes the offer with its own expiry, and the application's status follows it.
 * That is why this card is the last one in the rail and why nothing above it
 * offers an "admit" button.
 *
 * ── Accept and decline are recorded here on the applicant's behalf ─────────
 *
 * A family usually answers through their own letter, but somebody rings the
 * office, and the office has to be able to write it down. Both are authorised as
 * `decide` on the application, so this is the staff record of an answer given —
 * not a way to answer for somebody.
 *
 * ── Converting is irreversible, and safe to press twice ────────────────────
 *
 * It creates a person and a learner. The endpoint is idempotent — a second call
 * returns the same student with `was_already_converted` — so a double click
 * cannot produce two children from one offer, and this card reports which of the
 * two happened rather than claiming a new admission each time.
 */
export function OffersCard({
  applicationId,
  canDecide,
}: {
  applicationId: string
  canDecide: boolean
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()
  const [making, setMaking] = useState(false)
  const [withdrawing, setWithdrawing] = useState<AdmissionOffer | null>(null)
  const [converting, setConverting] = useState<AdmissionOffer | null>(null)

  const offers = useQuery({
    queryKey: [...admissionKeys.application(applicationId), 'offers'],
    queryFn: () => admissionsApi.offers(applicationId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: admissionKeys.root })
  }

  const accept = useMutation({
    mutationFn: (offerId: string) => admissionsApi.acceptOffer(applicationId, offerId),
    onSuccess: () => {
      refresh()
      toast.success('Recorded as accepted.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be recorded.')
    },
  })

  const decline = useMutation({
    mutationFn: (offerId: string) => admissionsApi.declineOffer(applicationId, offerId),
    onSuccess: () => {
      refresh()
      toast.success('Recorded as declined.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be recorded.')
    },
  })

  const withdraw = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      admissionsApi.withdrawOffer(applicationId, id, reason),
    onSuccess: () => {
      refresh()
      setWithdrawing(null)
      toast.success('Offer withdrawn.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be withdrawn.')
    },
  })

  const rows = offers.data ?? []
  const hasOpen = rows.some((row) => row.is_open)

  return (
    <>
      <Card>
        <CardHeader
          title="Offer"
          subtitle={rows.length === 0 ? 'No offer has been made' : undefined}
          actions={
            canDecide && !hasOpen ? (
              <Button size="sm" variant="primary" onClick={() => setMaking(true)}>
                Make an offer
              </Button>
            ) : undefined
          }
        />

        {offers.isError ? (
          <ErrorState error={offers.error} onRetry={() => offers.refetch()} />
        ) : offers.isLoading ? (
          <div className="p-4" aria-hidden>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">
            An offer is the decision. Reviews and interviews inform it; they do not make it.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((offer) => (
              <li key={offer.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={offer.status} />
                  {offer.is_converted && (
                    <Badge tone="success">
                      <SealCheck size={11} weight="fill" />
                      Enrolled
                    </Badge>
                  )}
                  <span className="ml-auto text-2xs text-gray-500">
                    {offer.offered_at ? formatDate(offer.offered_at) : '—'}
                  </span>
                </div>

                <p className="mt-1 text-2xs text-gray-600">
                  {offer.expires_at
                    ? `Answer by ${formatDateTime(offer.expires_at)}`
                    : 'No expiry set'}
                  {offer.accepted_at && ` · accepted ${formatDate(offer.accepted_at)}`}
                  {offer.declined_at && ` · declined ${formatDate(offer.declined_at)}`}
                </p>

                {offer.student_id && (
                  <p className="mt-1.5 text-xs">
                    <Link
                      to="/students/$studentId"
                      params={{ studentId: offer.student_id }}
                      className="text-accent-500 underline-offset-2 hover:underline"
                    >
                      Open the {t('learner').toLowerCase()} record
                    </Link>
                  </p>
                )}

                {canDecide && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {offer.is_open && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={accept.isPending && accept.variables === offer.id}
                          onClick={() => accept.mutate(offer.id)}
                        >
                          They accepted
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={decline.isPending && decline.variables === offer.id}
                          onClick={() => decline.mutate(offer.id)}
                        >
                          They declined
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setWithdrawing(offer)}>
                          Withdraw
                        </Button>
                      </>
                    )}

                    {offer.status === 'accepted' && !offer.is_converted && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<GraduationCap size={14} />}
                        onClick={() => setConverting(offer)}
                      >
                        Enrol as {t('learner').toLowerCase()}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MakeOfferDialog
        open={making}
        applicationId={applicationId}
        onClose={() => setMaking(false)}
        onSaved={() => {
          setMaking(false)
          refresh()
        }}
      />

      <ReasonDialog
        open={withdrawing !== null}
        title="Withdraw this offer"
        description="The place is no longer held. The offer stays on the file as withdrawn, with this reason."
        confirmLabel="Withdraw offer"
        destructive
        pending={withdraw.isPending}
        onClose={() => setWithdrawing(null)}
        onConfirm={(reason) => withdrawing && withdraw.mutate({ id: withdrawing.id, reason })}
      />

      <ConvertDialog
        offer={converting}
        applicationId={applicationId}
        onClose={() => setConverting(null)}
        onDone={() => {
          setConverting(null)
          refresh()
        }}
      />
    </>
  )
}

function MakeOfferDialog({
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
  const { access } = useTenant()
  const [expiresAt, setExpiresAt] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const sessionId = access?.calendar?.session?.id ?? null

  const save = useMutation({
    mutationFn: () =>
      admissionsApi.makeOffer(applicationId, {
        academic_session_id: sessionId ?? undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      setExpiresAt('')
      setErrors({})
      toast.success('Offer made.')
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That offer was not made.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Make an offer"
      description="This admits the applicant to the session below. It is the decision — everything before it was advice."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Ticket size={15} />}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Make the offer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="For the session" hint="The session this institution is currently in.">
          {(props) => (
            <Input
              {...props}
              readOnly
              value={access?.calendar?.session?.name ?? 'None is current'}
            />
          )}
        </Field>

        <Field
          label="Answer by"
          error={errors.expires_at}
          hint="Optional. An offer with no expiry stays open until it is answered or withdrawn."
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
      </div>
    </Modal>
  )
}

/**
 * Turning an accepted offer into a learner.
 *
 * The API takes a `person` and a `student` block and fills what it can from the
 * applicant. Only the fields somebody genuinely has to decide are asked for
 * here — a full learner form would duplicate the enrolment screen and go stale
 * against it. Everything else the API defaults.
 */
function ConvertDialog({
  offer,
  applicationId,
  onClose,
  onDone,
}: {
  offer: AdmissionOffer | null
  applicationId: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useTerminology()
  const [studentNumber, setStudentNumber] = useState('')
  const [admissionDate, setAdmissionDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const convert = useMutation({
    mutationFn: () =>
      admissionsApi.convert(applicationId, offer!.id, {
        student: {
          student_number: studentNumber.trim() || undefined,
          admission_date: admissionDate || undefined,
        },
      }),
    onSuccess: (result: Conversion) => {
      setStudentNumber('')
      setAdmissionDate('')
      setErrors({})
      toast.success(
        result.was_already_converted
          ? `Already enrolled as ${result.student_number ?? 'a record that exists'}.`
          : `Enrolled as ${result.student_number ?? 'a new record'}.`,
      )
      onDone()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That conversion did not complete.')
    },
  })

  return (
    <Modal
      open={offer !== null}
      onClose={onClose}
      title={`Enrol as a ${t('learner').toLowerCase()}`}
      description="This creates the person and the record. It cannot be undone — but pressing it twice is safe: the second press returns the same record rather than making another."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<GraduationCap size={15} />}
            loading={convert.isPending}
            onClick={() => convert.mutate()}
          >
            Enrol
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label={`${t('learner')} number`}
          error={errors['student.student_number']}
          hint="Leave blank and the institution's own numbering assigns one."
        >
          {(props) => (
            <Input
              {...props}
              value={studentNumber}
              maxLength={60}
              onChange={(event) => setStudentNumber(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Admitted on" error={errors['student.admission_date']}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={admissionDate}
              onChange={(event) => setAdmissionDate(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
