import { CalendarBlank } from '@phosphor-icons/react'
import { Toolbar } from '@/shared/ui'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { FilterSelect, usePeriodCatalog, useSessionCatalog } from '@/features/academics/components/pickers'

/**
 * Which session and term the page is about.
 *
 * A curriculum is written for a class in a term, so "the classes taking
 * Mathematics" has no answer until this is settled. It defaults to the
 * institution's current session and period upstream, and clearing either widens
 * the question rather than breaking it — "every term" is a legitimate thing to
 * ask, and it is how somebody finds last year's scheme to duplicate.
 */
export function SubjectContextBar({
  sessionId,
  periodId,
  onSessionChange,
  onPeriodChange,
}: {
  sessionId: string
  periodId: string
  onSessionChange: (value: string) => void
  onPeriodChange: (value: string) => void
}) {
  const t = useTerminology()
  const sessions = useSessionCatalog()
  const periods = usePeriodCatalog()

  return (
    <Toolbar
      className="py-0"
      filters={
        <>
          <span className="inline-flex items-center gap-1.5 pr-1 text-xs text-gray-600">
            <CalendarBlank size={13} />
            Showing
          </span>
          <FilterSelect
            value={sessionId}
            onChange={onSessionChange}
            options={sessions.options}
            allLabel={`All ${t('sessions').toLowerCase()}`}
            disabled={sessions.isLoading}
            className="w-44"
          />
          <FilterSelect
            value={periodId}
            onChange={onPeriodChange}
            options={periods.options}
            allLabel={`All ${t('periods').toLowerCase()}`}
            disabled={periods.isLoading}
            className="w-44"
          />
        </>
      }
    />
  )
}
