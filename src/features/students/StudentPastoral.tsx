import { useQuery } from '@tanstack/react-query'
import { FirstAidKit, Warning } from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { formatDate, humanize } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  Skeleton,
} from '@/shared/ui'
import { studentsApi } from './students.api'

/**
 * Conduct and health, on the record where a form tutor looks for them.
 *
 * ── Two surfaces, one question ─────────────────────────────────────────────
 *
 * These live at `/discipline/*` and `/health/*` rather than under
 * `/admin/students`, because each is gated on its own module and answers to a
 * different set of readers. But somebody asking "how is this child doing" is
 * asking one question, so they are read from the record — the tabs are drawn
 * only when the module is on and the permission is held, exactly as the
 * finance and enrolment tabs are.
 */

export function StudentConductPanel({ studentId }: { studentId: string }) {
  const conduct = useQuery({
    queryKey: [...qk.students.detail(studentId), 'conduct'],
    queryFn: () => studentsApi.conduct(studentId),
  })

  if (conduct.isError) {
    return <ErrorState error={conduct.error} onRetry={() => conduct.refetch()} />
  }

  if (conduct.isLoading || !conduct.data) {
    return (
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    )
  }

  const { summary, behaviour_records: records, incidents, sanctions } = conduct.data
  const nothing =
    summary.incident_count === 0 && records.length === 0 && summary.net_points === 0

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Net points leads because it is the number a tutor reads first, and
          * it is the server's arithmetic — the school's policy defines it. */}
        <Figure
          label="Net points"
          value={summary.net_points > 0 ? `+${summary.net_points}` : String(summary.net_points)}
          tone={summary.net_points > 0 ? 'up' : summary.net_points < 0 ? 'down' : 'flat'}
          hint={`${summary.merit_points} merit · ${summary.demerit_points} demerit`}
        />
        <Figure label="Incidents" value={String(summary.incident_count)} />
        <Figure
          label="Sanctions in force"
          value={String(summary.effective_sanction_count)}
          hint={sanctions.length > 0 ? `${sanctions.length} on record` : undefined}
        />
      </div>

      <Card>
        <CardHeader title="Behaviour record" subtitle={`${records.length} entries`} />
        {nothing ? (
          <EmptyState
            title="Nothing recorded"
            description="No merits, demerits or incidents have been logged for this learner."
          />
        ) : records.length === 0 ? (
          <EmptyState
            title="No individual entries"
            description={`${summary.incident_count} incident${summary.incident_count === 1 ? '' : 's'} are recorded against this learner, but no behaviour entries.`}
          />
        ) : (
          <ul className="divide-y divide-gray-200">
            {records.map((record) => (
              <li key={record.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{humanize(record.kind) || 'Entry'}</p>
                  {record.note && <p className="mt-0.5 text-xs text-gray-600">{record.note}</p>}
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDate(record.occurred_on)}
                    {record.recorded_by ? ` · ${record.recorded_by}` : ''}
                  </p>
                </div>
                {typeof record.points === 'number' && record.points !== 0 && (
                  <Badge tone={record.points > 0 ? 'success' : 'danger'}>
                    {record.points > 0 ? `+${record.points}` : record.points}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {incidents.length > 0 && (
        <Card>
          <CardHeader title="Incidents" subtitle={`${incidents.length} on record`} />
          <p className="px-4 py-3 text-sm text-gray-600">
            Incident detail is held on the discipline surface, where the full account and any
            investigation notes live.
          </p>
        </Card>
      )}
    </div>
  )
}

export function StudentHealthPanel({ studentId }: { studentId: string }) {
  const t = useTerminology()
  const health = useQuery({
    queryKey: [...qk.students.detail(studentId), 'emergency'],
    queryFn: () => studentsApi.emergency(studentId),
  })

  if (health.isError) {
    return <ErrorState error={health.error} onRetry={() => health.refetch()} />
  }

  if (health.isLoading || !health.data) {
    return (
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>
    )
  }

  const h = health.data

  /* `has_record` false means nobody has ever filled one in — which is NOT the
   * same as a record saying there are no conditions. Saying "no conditions"
   * here would be a claim the data does not support. */
  if (!h.has_record) {
    return (
      <Card>
        <EmptyState
          icon={<FirstAidKit size={20} />}
          title="No medical record"
          description={`Nothing has been recorded for this ${t('learner').toLowerCase()}. That is not the same as having no conditions — it means nobody has filled one in.`}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {h.has_critical_condition && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
          <Warning size={18} className="mt-0.5 shrink-0 text-danger-600" />
          <div>
            <p className="text-sm font-medium text-danger-700">Critical condition on record</p>
            <p className="mt-0.5 text-sm text-danger-700">
              Staff supervising this {t('learner').toLowerCase()} should read the full medical
              record before an activity or a trip.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="In an emergency"
          subtitle="The little that may be shown outside the clinic."
        />
        <Facts>
          <Fact label="Blood group">{h.blood_group ?? 'Not recorded'}</Fact>
          <Fact label="Emergency contact">{h.emergency_contact.name ?? 'Not recorded'}</Fact>
          <Fact label="Relationship">
            {humanize(h.emergency_contact.relationship) || 'Not recorded'}
          </Fact>
          <Fact label="Phone">{h.emergency_contact.phone ?? 'Not recorded'}</Fact>
          {h.emergency_contact.alternate_phone && (
            <Fact label="Alternate phone">{h.emergency_contact.alternate_phone}</Fact>
          )}
          <Fact label="Consent to treatment">
            <Flag on={h.consent_to_emergency_treatment}>
              {h.consent_to_emergency_treatment ? 'Given' : 'Not given'}
            </Flag>
          </Fact>
        </Facts>
      </Card>

      <Card>
        <CardHeader title="Conditions" subtitle={`${h.conditions.length} recorded`} />
        {h.conditions.length === 0 ? (
          <EmptyState title="None recorded" description="The record carries no conditions." />
        ) : (
          <ul className="divide-y divide-gray-200">
            {h.conditions.map((condition, index) => (
              <li
                key={`${condition.name ?? 'condition'}-${index}`}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <span className="text-sm text-gray-900">{condition.name ?? 'Condition'}</span>
                {condition.severity && (
                  <Badge tone={condition.severity === 'critical' ? 'danger' : 'warning'}>
                    {humanize(condition.severity)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down' | 'flat'
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p
        className={
          'mt-1.5 text-2xl font-semibold tracking-[-0.02em] tabular ' +
          (tone === 'up' ? 'text-success-600' : tone === 'down' ? 'text-danger-500' : 'text-gray-900')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}
