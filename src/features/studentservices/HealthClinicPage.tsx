import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FirstAidKit, Plus, Syringe, Warning } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { cn } from '@/shared/lib/cn'
import { formatDate, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
/* Shared with the finance dialogs. A learner picker is a single concern and a
 * second copy would drift; if that file moves, this import is the one-line
 * fix that says so. */
import { StudentPicker } from '@/features/finance/dialogs/useStudentPicker'
import {
  Badge,
  Blank,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  PageHeader,
  Skeleton,
  StatusBadge,
  type Column,
} from '@/shared/ui'
import { ConditionDialog, HealthProfileDialog } from './StudentServicesDialogs'
import { healthApi, studentServicesKeys } from './studentServices.api'
import {
  severityTone,
  type HealthCondition,
  type ImmunisationRecord,
} from './studentServices.types'

/**
 * Health and clinic.
 *
 * ── The screen is built around the module's two tiers ──────────────────────
 *
 * The API splits this module in half and the split is the whole design:
 *
 *   The EMERGENCY CARD — blood group, who to ring, and the conditions flagged
 *   for it — is gated on `health_clinic.view`, which the administration,
 *   academic management, teachers, the clinic desk AND the family all hold.
 *   The API's own note gives the reason: a child collapsing in a corridor
 *   cannot wait while somebody works out whether the adult standing over them
 *   holds a clinical permission.
 *
 *   The CLINICAL FILE — conditions in full, immunisations, visits, notes —
 *   additionally requires `health_clinic.clinical_records`.
 *
 * So the card renders first and always, and the file is opened deliberately.
 * Putting them on one screen without that separation would either hide the
 * card behind a permission most readers lack, or leak the file to everyone who
 * can see the card.
 *
 * ── Resolving the profile is a POST, and that is the API's design ──────────
 *
 * There is no `GET /health/profiles?subject_id=`; a clinical file is reached
 * through the child, never browsed. `POST /health/profiles` is idempotent —
 * it answers 201 with a new record or 200 with the existing one — so it is
 * both "create" and "find". That is why opening the file is an explicit act
 * here rather than something that happens on page load: it is a write verb,
 * and a reader without `health_clinic.manage` is refused it.
 */
export function HealthClinicPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const queryClient = useQueryClient()

  const [student, setStudent] = useState<{ id: string; name: string } | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [addingCondition, setAddingCondition] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)

  const canOpenFile = perms.has('health_clinic.clinical_records')

  const summary = useQuery({
    queryKey: studentServicesKeys.emergency(student?.id ?? ''),
    queryFn: () => healthApi.emergencySummary(student!.id),
    enabled: student !== null,
  })

  /** Idempotent: 201 for a new record, 200 for one already on file. */
  const openFile = useMutation({
    mutationFn: () =>
      healthApi.createProfile({ subject_type: 'student_profile', subject_id: student!.id }),
    onSuccess: (profile) => setProfileId(profile.id),
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'The clinical file could not be opened.',
      ),
  })

  const conditions = useQuery({
    queryKey: studentServicesKeys.conditions(profileId ?? ''),
    queryFn: () => healthApi.conditions(profileId!),
    enabled: profileId !== null,
  })

  const immunisations = useQuery({
    queryKey: studentServicesKeys.immunisations(profileId ?? ''),
    queryFn: () => healthApi.immunisations(profileId!),
    enabled: profileId !== null,
  })

  /* A different child is a different file. Without this the previous
   * student's clinical record stays on screen under the new name. */
  function chooseStudent(next: { id: string; name: string } | null) {
    setStudent(next)
    setProfileId(null)
    queryClient.removeQueries({ queryKey: ['student-services', 'health'] })
  }

  const card = summary.data

  return (
    <PageStack>
      <PageHeader
        title="Health and clinic"
        description={`The emergency card is open to anyone who teaches or cares for a ${t('learner').toLowerCase()}. The clinical file is not.`}
      />

      <Card>
        <CardHeader
          title={`Choose a ${t('learner').toLowerCase()}`}
          subtitle="A health record is reached through the child. There is no list to browse, by design."
        />
        <div className="max-w-md px-4 py-4">
          <StudentPicker value={student} onChange={chooseStudent} label={t('learner')} />
        </div>
      </Card>

      {student && summary.isError && (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      )}

      {student && summary.isLoading && (
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </Card>
      )}

      {/* ── The open tier ──────────────────────────────────────────────── */}
      {card && (
        <Card className={cn(card.has_critical_condition && 'border-danger-300')}>
          <CardHeader
            title="Emergency card"
            subtitle={
              card.has_record
                ? 'What anyone caring for this child may see.'
                : 'Nothing is on file for this child yet.'
            }
            actions={
              card.has_critical_condition ? (
                <Badge tone="danger" dot>
                  Critical condition
                </Badge>
              ) : undefined
            }
          />

          {!card.has_record ? (
            <EmptyState
              icon={<FirstAidKit size={20} />}
              title="No health record"
              description={
                /* "Nothing recorded" and "no such child" are different answers,
                 * and the API is careful to give the first. So is this. */
                canOpenFile
                  ? 'Opening the clinical file creates one.'
                  : 'The clinic desk can create one.'
              }
              action={
                canOpenFile ? (
                  <Button
                    variant="primary"
                    loading={openFile.isPending}
                    onClick={() => openFile.mutate()}
                  >
                    Open the clinical file
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Facts>
                <Fact label="Blood group">
                  {card.blood_group ? (
                    <span className="font-medium">{card.blood_group}</span>
                  ) : (
                    <Blank />
                  )}
                </Fact>
                <Fact label="Emergency contact">
                  {card.emergency_contact.name ? (
                    <span>
                      {card.emergency_contact.name}
                      {card.emergency_contact.relationship && (
                        <span className="text-gray-600"> · {card.emergency_contact.relationship}</span>
                      )}
                    </span>
                  ) : (
                    <Blank />
                  )}
                </Fact>
                <Fact label="Phone">
                  {card.emergency_contact.phone ? (
                    <a
                      href={`tel:${card.emergency_contact.phone}`}
                      className="text-accent-500 hover:underline"
                    >
                      {card.emergency_contact.phone}
                    </a>
                  ) : (
                    <Blank />
                  )}
                </Fact>
                {card.emergency_contact.alternate_phone && (
                  <Fact label="Alternate">
                    <a
                      href={`tel:${card.emergency_contact.alternate_phone}`}
                      className="text-accent-500 hover:underline"
                    >
                      {card.emergency_contact.alternate_phone}
                    </a>
                  </Fact>
                )}
                <Fact label="Emergency treatment">
                  <Flag on={card.consent_to_emergency_treatment === true}>
                    {card.consent_to_emergency_treatment ? 'Consented' : 'No consent recorded'}
                  </Flag>
                </Fact>
              </Facts>

              {card.conditions.length > 0 && (
                <div className="border-t border-gray-200 px-4 py-3">
                  <p className="pb-2 text-xs text-gray-600">Flagged for the card</p>
                  <ul className="flex flex-col gap-2">
                    {card.conditions.map((condition, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Warning
                          size={14}
                          className={cn(
                            'mt-0.5 shrink-0',
                            severityTone(String(condition.severity ?? '')) === 'danger'
                              ? 'text-danger-500'
                              : 'text-gray-500',
                          )}
                        />
                        <span className="min-w-0 text-sm text-gray-900">
                          {condition.name}
                          {condition.severity && (
                            <span className="text-gray-600"> · {humanize(String(condition.severity))}</span>
                          )}
                          {condition.emergency_action && (
                            <span className="block text-xs text-gray-600">
                              {String(condition.emergency_action)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── The clinical tier ──────────────────────────────────────────── */}
      {card?.has_record && !profileId && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Clinical file</p>
              <p className="text-xs text-gray-600">
                {canOpenFile
                  ? 'Conditions in full, immunisations and clinic visits.'
                  : 'Reading a clinical file needs the clinical records permission, which this account does not hold.'}
              </p>
            </div>
            {canOpenFile && (
              <Button loading={openFile.isPending} onClick={() => openFile.mutate()}>
                Open the clinical file
              </Button>
            )}
          </div>
        </Card>
      )}

      {profileId && (
        <>
          <Card>
            <CardHeader
              title="Conditions"
              subtitle="Allergies, ongoing conditions, dietary needs and medications."
              actions={
                perms.has('health_clinic.manage') ? (
                  <Button
                    icon={<Plus size={14} weight="bold" />}
                    onClick={() => setAddingCondition(true)}
                  >
                    Add condition
                  </Button>
                ) : undefined
              }
            />
            {conditions.isError ? (
              <ErrorState error={conditions.error} onRetry={() => conditions.refetch()} />
            ) : (
              <DataTable
                rows={conditions.data ?? []}
                columns={conditionColumns}
                rowKey={(row) => row.id}
                loading={conditions.isLoading}
                skeletonRows={2}
                className="border-0"
                empty={
                  <EmptyState
                    icon={<FirstAidKit size={20} />}
                    title="Nothing recorded"
                    description="Conditions flagged as emergency-relevant appear on the card above."
                  />
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Immunisations" subtitle="What has been given, and what is due." />
            {immunisations.isError ? (
              <ErrorState error={immunisations.error} onRetry={() => immunisations.refetch()} />
            ) : (
              <DataTable
                rows={immunisations.data ?? []}
                columns={immunisationColumns}
                rowKey={(row) => row.id}
                loading={immunisations.isLoading}
                skeletonRows={2}
                className="border-0"
                empty={
                  <EmptyState icon={<Syringe size={20} />} title="No immunisations recorded" />
                }
              />
            )}
          </Card>
        </>
      )}

      {profileId && (
        <>
          <ConditionDialog
            open={addingCondition}
            onClose={() => setAddingCondition(false)}
            profileId={profileId}
            studentId={student?.id ?? ''}
          />
          <HealthProfileDialog
            open={editingProfile}
            onClose={() => setEditingProfile(false)}
            profileId={profileId}
          />
        </>
      )}
    </PageStack>
  )
}

const conditionColumns: Column<HealthCondition>[] = [
  { key: 'name', header: 'Condition', cell: (row) => row.name },
  { key: 'kind', header: 'Kind', width: '8rem', cell: (row) => humanize(row.kind) },
  {
    key: 'severity',
    header: 'Severity',
    width: '10rem',
    cell: (row) =>
      row.severity ? (
        <span
          className={cn(
            severityTone(row.severity) === 'danger' && 'font-medium text-danger-500',
          )}
        >
          {humanize(row.severity)}
        </span>
      ) : (
        <Blank />
      ),
  },
  {
    key: 'card',
    header: 'On the card',
    width: '9rem',
    /* `on_emergency_card` is the API's own decision, not a synonym for
     * `is_emergency_relevant` — a condition can be relevant and still be kept
     * off the card. Shown as the API reports it. */
    cell: (row) => <Flag on={row.on_emergency_card}>{row.on_emergency_card ? 'Shown' : 'Hidden'}</Flag>,
  },
  {
    key: 'diagnosed',
    header: 'Diagnosed',
    className: 'tabular',
    width: '9rem',
    cell: (row) => (row.diagnosed_on ? formatDate(row.diagnosed_on) : <Blank />),
  },
  {
    key: 'resolved',
    header: 'Resolved',
    className: 'tabular',
    width: '9rem',
    cell: (row) =>
      row.resolved_on ? formatDate(row.resolved_on) : <span className="text-gray-500">Ongoing</span>,
  },
]

const immunisationColumns: Column<ImmunisationRecord>[] = [
  { key: 'vaccine', header: 'Vaccine', cell: (row) => row.vaccine },
  {
    key: 'dose',
    header: 'Dose',
    width: '6rem',
    className: 'tabular',
    cell: (row) => (row.dose_number === null ? <Blank /> : row.dose_number),
  },
  {
    key: 'given',
    header: 'Given',
    className: 'tabular',
    width: '9rem',
    cell: (row) => (row.administered_on ? formatDate(row.administered_on) : <Blank />),
  },
  {
    key: 'due',
    header: 'Next due',
    className: 'tabular',
    width: '11rem',
    /* `is_due` is the API's reading against today. Recomputing it from
     * `next_due_on` would disagree with it across a timezone. */
    cell: (row) =>
      row.next_due_on ? (
        <span className={row.is_due ? 'font-medium text-danger-500' : undefined}>
          {formatDate(row.next_due_on)}
          {row.is_due && ' · due'}
        </span>
      ) : (
        <Blank />
      ),
  },
  { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
]
