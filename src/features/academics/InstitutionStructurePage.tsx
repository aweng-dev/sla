import { useQuery } from '@tanstack/react-query'
import { Buildings, Tree } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { humanize } from '@/shared/lib/format'
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  PageHeader,
  type Column,
} from '@/shared/ui'
import { academicsCatalog } from './academics.api'
import { academicsKeys } from './academics.keys'
import type { CatalogItem } from './academics.types'

/**
 * How this institution is arranged — and, just as often, how it is not.
 *
 * ── The 404s here are answers, not failures ────────────────────────────────
 *
 * `GET /admin/campuses` replies 404 RESOURCE_NOT_FOUND to a school: "This
 * institution is not arranged into campuses. Its buildings and rooms belong to
 * the institution itself." The same is true of the organizational chart. Those
 * are statements about the institution TYPE, decided when it was created, and
 * a screen that fired the request and rendered the refusal as an error would
 * be reporting a fault where there is none.
 *
 * So the shape of the page comes from `institution.supports_campuses` and
 * `supports_organizational_units`, and the requests are only made when those
 * say the concept exists. What is always shown is the academic structure the
 * institution actually runs, which the profile spells out.
 */
export function InstitutionStructurePage() {
  const t = useTerminology()
  const { access, tenant } = useTenant()
  const institution = access?.institution

  const supportsCampuses = institution?.supports_campuses ?? false
  const supportsUnits = institution?.supports_organizational_units ?? false

  const campuses = useQuery({
    queryKey: academicsKeys.catalog.campuses,
    queryFn: academicsCatalog.campuses,
    enabled: supportsCampuses,
    staleTime: 10 * 60_000,
  })

  const units = useQuery({
    queryKey: academicsKeys.catalog.units,
    queryFn: academicsCatalog.units,
    enabled: supportsUnits,
    staleTime: 10 * 60_000,
  })

  const columns: Column<CatalogItem>[] = [
    { key: 'name', header: 'Name', cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'code',
      header: 'Code',
      width: '10rem',
      cell: (row) => <span className="tabular text-gray-700">{row.code ?? '—'}</span>,
    },
  ]

  return (
    <PageStack>
      <PageHeader
        title="Institution structure"
        description="How this institution is arranged, and the vocabulary the rest of the product speaks because of it."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Academic structure"
            subtitle="Set when the institution was created. It decides the words and the ladder."
          />
          <Facts>
            <Fact label="Type">{institution?.label ?? humanize(tenant.institution_type)}</Fact>
            {institution?.subtype_label && <Fact label="Subtype">{institution.subtype_label}</Fact>}
            <Fact label="Ladder">
              {(institution?.academic_structure ?? []).map(humanize).join(' › ') || '—'}
            </Fact>
            <Fact label={`${t('period')} kind`}>{humanize(institution?.period_label)}</Fact>
            <Fact label="Register">{institution?.attendance_mode_label ?? '—'}</Fact>
            <Fact label={t('assessment')}>{institution?.assessment_model_label ?? '—'}</Fact>
            <Fact label={t('progression')}>{institution?.progression_model_label ?? '—'}</Fact>
            <Fact label="Repeating a year">
              <Flag on={institution?.supports_repetition ?? false}>
                {institution?.supports_repetition ? 'Allowed' : 'Not allowed'}
              </Flag>
            </Fact>
            <Fact label="Credit system">
              <Flag on={institution?.supports_credit_system ?? false}>
                {institution?.supports_credit_system ? 'In use' : 'Not used'}
              </Flag>
            </Fact>
          </Facts>
        </Card>

        <Card>
          <CardHeader
            title="Divisions"
            subtitle="Whether this institution splits into sites and departments at all."
          />
          <Facts>
            <Fact label={humanize(institution?.campuses_label ?? t('campuses'))}>
              <Flag on={supportsCampuses}>
                {supportsCampuses ? 'In use' : 'Not arranged this way'}
              </Flag>
            </Fact>
            <Fact label={humanize(institution?.organizational_unit_collective ?? 'departments')}>
              <Flag on={supportsUnits}>{supportsUnits ? 'In use' : 'No chart kept'}</Flag>
            </Fact>
            <Fact label="Campus services">
              <Flag on={institution?.supports_campus_services ?? false}>
                {institution?.supports_campus_services ? 'Available' : 'Not available'}
              </Flag>
            </Fact>
            <Fact label={t('guardians')}>
              <Flag on={institution?.supports_guardians ?? false}>
                {institution?.supports_guardians ? 'Tracked' : 'Not tracked'}
              </Flag>
            </Fact>
          </Facts>

          {!supportsCampuses && !supportsUnits && (
            <div className="border-t border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-600">
                This institution is not divided into sites or departments — its internal divisions
                are its {t('sections').toLowerCase()}. Buildings and rooms belong to the institution
                itself, and {t('programmes').toLowerCase()} and {t('courses').toLowerCase()} sit
                directly under it.
              </p>
            </div>
          )}
        </Card>
      </div>

      {supportsCampuses && (
        <div className="flex flex-col gap-3">
          <h2 className="text-md font-semibold text-gray-900">{humanize(t('campuses'))}</h2>
          {campuses.isError ? (
            <ErrorState error={campuses.error} onRetry={() => campuses.refetch()} />
          ) : (
            <DataTable
              rows={campuses.data ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={campuses.isLoading}
              skeletonRows={3}
              empty={
                <EmptyState
                  icon={<Buildings size={20} />}
                  title={`No ${t('campuses').toLowerCase()} yet`}
                  description="This institution is arranged into sites, but none have been added."
                />
              }
            />
          )}
        </div>
      )}

      {supportsUnits && (
        <div className="flex flex-col gap-3">
          <h2 className="text-md font-semibold capitalize text-gray-900">
            {humanize(institution?.organizational_unit_collective ?? 'departments')}
          </h2>
          {units.isError ? (
            <ErrorState error={units.error} onRetry={() => units.refetch()} />
          ) : (
            <DataTable
              rows={units.data ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={units.isLoading}
              skeletonRows={3}
              empty={
                <EmptyState
                  icon={<Tree size={20} />}
                  title="No divisions yet"
                  description={`${t('programmes')} and ${t('courses').toLowerCase()} can be placed under a ${institution?.organizational_unit_noun ?? 'department'} once one exists.`}
                />
              }
            />
          )}
        </div>
      )}
    </PageStack>
  )
}
