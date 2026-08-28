import { useId, useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, PencilSimple, Student, UsersThree } from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Button,
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  panelId,
  StatusBadge,
  Tabs,
  type TabItem,
} from '@/shared/ui'
import { GuardianDialog } from './GuardianDialog'
import { GuardianChildren, GuardianOverview, GuardianRecordSkeleton } from './GuardianPanels'
import { guardiansApi } from './guardians.api'
import { readGuardianListSearch, toGuardianListQuery } from './useGuardianListSearch'

/**
 * One guardian's record.
 *
 * Staff only, and deliberately without a portal branch: unlike `/students/{id}`
 * there is no route a learner or a parent can arrive here from — `/search`
 * returns student and discipline hits, not guardians, and the rail's guardians
 * item for the guardian portal goes to the list, which has its own portal
 * screen. A reader who hand-types this URL gets the API's own 403 through
 * `ErrorState`, which says "you do not have access to this" rather than
 * pretending the record is missing.
 */
export function GuardianDetailPage() {
  const { guardianId } = useParams({ from: '/app/guardians/$guardianId' })
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const tabsId = useId()

  const [editing, setEditing] = useState(false)

  /* The list's filters travel in this route's own query string, so the way
   * back lands on the page of the list the reader came from — after a reload
   * or from a pasted link, not only from history. */
  const rawSearch = useSearch({ strict: false })
  const listSearch = useMemo(() => readGuardianListSearch(rawSearch), [rawSearch])

  const record = useQuery({
    queryKey: qk.guardians.detail(guardianId),
    queryFn: () => guardiansApi.detail(guardianId),
  })

  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview', icon: <UsersThree size={14} /> },
  ]

  /* The children tab is `GET /admin/guardians/{id}/children` — the same
   * permission and module as the record itself, so unlike a student's tabs
   * there is nothing extra to gate on. It is still hidden for an institution
   * whose learners are adults: `supports_guardians` false means there is no
   * tie to show, which is an absence rather than a refusal. */
  if (access?.institution.supports_guardians !== false) {
    tabs.push({ key: 'children', label: t('learners'), icon: <Student size={14} /> })
  }

  const [tab, setTab] = useState('overview')
  const active = tabs.some((item) => item.key === tab) ? tab : 'overview'

  const backLink = (
    <Link
      to="/guardians"
      search={toGuardianListQuery(listSearch)}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={12} weight="bold" />
      All {t('guardians').toLowerCase()}
    </Link>
  )

  if (record.isError) {
    return (
      <PageStack>
        {backLink}
        <ErrorState error={record.error} onRetry={() => record.refetch()} />
      </PageStack>
    )
  }

  const data = record.data

  return (
    <PageStack>
      {backLink}

      <PageHeader
        title={data?.person.full_name ?? ' '}
        icon={
          <EntityIcon>
            <UsersThree size={18} />
          </EntityIcon>
        }
        meta={
          data && (
            <>
              <StatusBadge status={data.status} />
              <MetaDot />
              <span>
                <span className="tabular">{data.children_count}</span>{' '}
                {(data.children_count === 1 ? t('learner') : t('learners')).toLowerCase()}
              </span>
              {data.occupation && (
                <>
                  <MetaDot />
                  <span>{data.occupation}</span>
                </>
              )}
              {data.person.email && (
                <>
                  <MetaDot />
                  <span>{data.person.email}</span>
                </>
              )}
            </>
          )
        }
        actions={
          data && perms.has('guardians.manage') ? (
            <Button icon={<PencilSimple size={14} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null
        }
      />

      {record.isLoading && <GuardianRecordSkeleton />}

      {data && (
        <div>
          <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />

          <div
            role="tabpanel"
            id={panelId(tabsId, active)}
            aria-labelledby={`${tabsId}-tab-${active}`}
            className="pt-4"
          >
            {active === 'overview' && <GuardianOverview record={data} />}
            {active === 'children' && <GuardianChildren guardianId={guardianId} />}
          </div>
        </div>
      )}

      {data && (
        <GuardianDialog open={editing} onClose={() => setEditing(false)} guardian={data} />
      )}
    </PageStack>
  )
}
