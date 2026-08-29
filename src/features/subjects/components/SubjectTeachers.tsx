import { useMemo } from 'react'
import { ChalkboardTeacher } from '@phosphor-icons/react'
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import type { SubjectClass } from '../useSubjectWorkspace'

/**
 * Who teaches this subject, and to whom.
 *
 * ── One row per person, not one per assignment ─────────────────────────────
 *
 * A teacher taking three classes in the same subject appears once with three
 * classes listed. The offering-shaped view — three rows with the same name —
 * is already on the classes tab; repeating it here would make this a second
 * copy of that table rather than an answer to "who covers this subject".
 *
 * ── Read-only, and it should be ────────────────────────────────────────────
 *
 * Assigning a teacher is a decision about ONE class's running of the subject:
 * it carries a role and a primary flag, and it belongs on the offering, which
 * is where the API puts it. A control here would have to ask "for which class?"
 * first, at which point it is the classes tab.
 */
export function SubjectTeachers({
  classes,
  loading,
}: {
  classes: SubjectClass[]
  loading: boolean
}) {
  const t = useTerminology()

  const people = useMemo(() => {
    const byStaff = new Map<
      string,
      { name: string; jobTitle: string | null; roles: Set<string>; primaryFor: number; classes: string[] }
    >()

    for (const entry of classes) {
      for (const instructor of entry.offering.instructors) {
        const existing = byStaff.get(instructor.staff_id) ?? {
          name: instructor.name,
          jobTitle: instructor.job_title,
          roles: new Set<string>(),
          primaryFor: 0,
          classes: [],
        }

        existing.roles.add(instructor.role)
        if (instructor.is_primary) existing.primaryFor += 1
        existing.classes.push(entry.offering.learning_group_name ?? entry.offering.code)

        byStaff.set(instructor.staff_id, existing)
      }
    }

    return [...byStaff.entries()]
      .map(([staffId, value]) => ({ staffId, ...value, roles: [...value.roles] }))
      .sort((a, b) => b.classes.length - a.classes.length || a.name.localeCompare(b.name))
  }, [classes])

  if (loading) {
    return (
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title={t('teachers')}
        subtitle={`Taken from the ${t('groups').toLowerCase()} in the selected ${t('session').toLowerCase()} and ${t('period').toLowerCase()}.`}
      />

      {people.length === 0 ? (
        <EmptyState
          icon={<ChalkboardTeacher size={20} />}
          title={`No ${t('teachers').toLowerCase()} assigned`}
          description={`Assign one on the ${t('group').toLowerCase()}’s own record — a ${t('teacher').toLowerCase()} is attached to a ${t('group').toLowerCase()} taking the subject, not to the subject itself.`}
        />
      ) : (
        <ul className="divide-y divide-gray-200">
          {people.map((person) => (
            <li key={person.staffId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={person.name} size="sm" />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {person.name}
                </span>
                <span className="block truncate text-xs text-gray-600">
                  {person.classes.join(', ')}
                </span>
              </span>

              {person.jobTitle && (
                <span className="hidden shrink-0 text-xs text-gray-600 sm:block">
                  {person.jobTitle}
                </span>
              )}

              {person.primaryFor > 0 && (
                <Badge tone="accent">
                  {person.primaryFor === person.classes.length
                    ? 'Lead'
                    : `Lead on ${person.primaryFor}`}
                </Badge>
              )}

              {person.roles
                .filter((role) => role !== 'primary')
                .map((role) => (
                  <Badge key={role}>{humanize(role)}</Badge>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
