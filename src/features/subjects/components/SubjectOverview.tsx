import { ListChecks, UsersThree, Warning } from '@phosphor-icons/react'
import { Button, Card, CardHeader, DetailRow, Fact, Facts, StatTile } from '@/shared/ui'
import { formatNumber, humanize } from '@/shared/lib/format'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import type { Course } from '@/features/academics/academics.types'
import type { SubjectClass } from '../useSubjectWorkspace'

/**
 * What this subject is, and where its curriculum stands.
 *
 * ── The tiles count classes, not documents ────────────────────────────────
 *
 * "12 curricula" is not a number anybody needs. "3 of 5 classes have one" is
 * the state of the work, and the gap between the two numbers is the thing to
 * act on — so the third tile names the shortfall directly rather than making
 * the reader subtract.
 *
 * ── The gap is called out, not just counted ───────────────────────────────
 *
 * A class taking a subject with nothing written for it is the failure this
 * screen exists to surface. When there is one, it is a line of text with a way
 * to go and fix it, sitting above the catalogue facts — because the facts do
 * not change and the gap does.
 */
export function SubjectOverview({
  subject,
  classes,
  loading,
  onOpenClasses,
  onOpenCurriculum,
}: {
  subject: Course
  classes: SubjectClass[]
  loading: boolean
  onOpenClasses: () => void
  onOpenCurriculum: () => void
}) {
  const t = useTerminology()
  const { access } = useTenant()

  const withAny = classes.filter((entry) => entry.curricula.length > 0)
  const published = classes.filter((entry) =>
    entry.curricula.some((document) => document.status === 'published'),
  )
  const missing = classes.filter((entry) => entry.curricula.length === 0)

  const showCredits = access?.institution.supports_credit_system ?? false

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={`${t('groups')} taking it`}
          value={formatNumber(classes.length)}
          icon={<UsersThree size={16} />}
          loading={loading}
          hint={`In the selected ${t('session').toLowerCase()} and ${t('period').toLowerCase()}`}
        />
        <StatTile
          label="With a curriculum"
          value={`${formatNumber(withAny.length)} of ${formatNumber(classes.length)}`}
          icon={<ListChecks size={16} />}
          loading={loading}
          hint={`${formatNumber(published.length)} published`}
        />
        <StatTile
          label="Still to write"
          value={formatNumber(missing.length)}
          icon={<Warning size={16} />}
          loading={loading}
          hint={
            missing.length === 0
              ? `Every ${t('group').toLowerCase()} has one`
              : `${t('groups')} with nothing yet`
          }
        />
      </div>

      {!loading && missing.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {missing.length === 1
                  ? `One ${t('group').toLowerCase()} is taking ${subject.title} with nothing written for it`
                  : `${formatNumber(missing.length)} ${t('groups').toLowerCase()} are taking ${subject.title} with nothing written for them`}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-600">
                {missing
                  .map((entry) => entry.offering.learning_group_name ?? entry.offering.code)
                  .join(', ')}
              </p>
            </div>
            <Button onClick={onOpenClasses}>Start one</Button>
          </div>
        </Card>
      )}

      {!loading && classes.length > 0 && missing.length === 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-gray-700">
              Every {t('group').toLowerCase()} taking {subject.title} has a scheme of work.
            </p>
            <Button onClick={onOpenCurriculum}>Read them</Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`About this ${t('course').toLowerCase()}`}
          subtitle="The catalogue entry. It is the same in every term."
        />

        <Facts>
          <Fact label="Code">{subject.code}</Fact>
          <Fact label="Kind">{humanize(subject.course_type) || '—'}</Fact>
          {showCredits && (
            <Fact label="Credit units">{formatNumber(subject.credit_units) || '—'}</Fact>
          )}
          <Fact label="Contact hours">{formatNumber(subject.contact_hours) || '—'}</Fact>
          <Fact label={t('assessments')}>{formatNumber(subject.assessment_count)}</Fact>
          <Fact label={t('learners')}>{formatNumber(subject.enrollment_count)}</Fact>
        </Facts>

        {subject.organizational_unit && (
          <div className="border-t border-gray-200 px-4 py-3">
            <DetailRow label={humanize(access?.institution.organizational_unit_noun ?? 'department')}>
              {subject.organizational_unit.name}
            </DetailRow>
          </div>
        )}

        {subject.description && (
          <div className="border-t border-gray-200 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {subject.description}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
