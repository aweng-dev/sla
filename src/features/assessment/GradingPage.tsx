import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Plus, Scales, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Field,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useModules, usePermissions } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { ScaleEditor } from './components/ScaleEditor'
import { WeightsEditor } from './components/WeightsEditor'
import {
  gradingApi,
  gradingKeys,
  type GradingScheme,
  type RoundingMode,
  type SchemeStatus,
} from './grading.api'

/**
 * What a mark is out of, what it has to reach, and what it is then called.
 *
 * ── One screen, two module gates ───────────────────────────────────────────
 *
 * The scheme and its SCALE answer to `module:grading`; its WEIGHTS answer to
 * `module:assessments`. An institution can run continuous assessment without
 * letter grades and letter grades with a single unweighted total, so the
 * Weights panel is drawn only when that second module answers. The page itself
 * is gated on grading, because categories live inside a scheme and there is
 * nothing to weight without one.
 *
 * ── The default is the one thing a reader is looking for ───────────────────
 *
 * Every gradebook without a narrower scheme computes through it, so it sorts
 * first and carries a badge. Promoting another demotes it — a POST of its own,
 * not a checkbox on the form.
 */
export function GradingPage() {
  return (
    <ModuleGate
      module="grading"
      title="Grading"
      description="The scales marks are reported on, and how a final mark is put together."
      offTitle="This institution does not run grading schemes"
      offDescription="The grading module is switched off here. An administrator can enable it from the institution's modules."
    >
      <Workspace />
    </ModuleGate>
  )
}

function Workspace() {
  const permissions = usePermissions()
  const modules = useModules()
  const queryClient = useQueryClient()

  const canManageScheme = permissions.has('grading.manage')
  const canManageWeights = modules.has('assessments') && permissions.has('assessments.manage')
  const showWeights = modules.has('assessments')

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [status, setStatus] = useState<SchemeStatus | ''>('active')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const params = useMemo(() => ({ search, status, page }), [search, status, page])

  const schemes = useQuery({
    queryKey: gradingKeys.schemes(params),
    queryFn: () => gradingApi.schemes(params),
    placeholderData: (previous) => previous,
  })

  const rows = schemes.data?.rows ?? []

  /* Land on the institution's default, which is what most readers came for. */
  useEffect(() => {
    if (selectedId !== null || rows.length === 0) return
    setSelectedId((rows.find((row) => row.is_default) ?? rows[0]).id)
  }, [rows, selectedId])

  const selected = rows.some((row) => row.id === selectedId) ? selectedId : null

  if (schemes.isError) {
    return (
      <Card>
        <ErrorState error={schemes.error} onRetry={() => schemes.refetch()} />
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
            <SearchInput
              value={draft}
              placeholder="Search schemes"
              className="w-full"
              onChange={(event) => {
                setDraft(event.currentTarget.value)
                setPage(1)
              }}
            />
            {canManageScheme && (
              <Button
                size="icon"
                variant="primary"
                aria-label="New scheme"
                onClick={() => setComposing(true)}
              >
                <Plus size={15} weight="bold" />
              </Button>
            )}
          </div>

          <div className="border-b border-gray-200 px-3 py-2">
            <Segmented
              label="Which schemes to show"
              value={status || 'all'}
              onChange={(value) => {
                setStatus(value === 'all' ? '' : (value as SchemeStatus))
                setPage(1)
              }}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-2 py-2">
            {schemes.isLoading && (
              <ul className="flex flex-col gap-0.5" aria-hidden>
                {['w-3/4', 'w-1/2', 'w-2/3'].map((width, index) => (
                  <li key={index} className="space-y-1.5 px-2 py-2">
                    <Skeleton className={cn('h-3', width)} />
                    <Skeleton className="h-2.5 w-24" />
                  </li>
                ))}
              </ul>
            )}

            {!schemes.isLoading && rows.length === 0 && (
              <EmptyState
                icon={<Scales size={20} />}
                title={search ? 'Nothing matches that' : 'No schemes yet'}
                description={
                  search
                    ? 'Try part of a name or a code.'
                    : 'A scheme says what a mark is out of, what it has to reach, and what it is then called.'
                }
                action={
                  canManageScheme && !search ? (
                    <Button variant="primary" onClick={() => setComposing(true)}>
                      Write one
                    </Button>
                  ) : undefined
                }
              />
            )}

            <ul className="flex flex-col gap-0.5">
              {rows.map((scheme) => (
                <li key={scheme.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(scheme.id)}
                    aria-current={scheme.id === selected ? 'true' : undefined}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                      scheme.id === selected ? 'bg-rail-active' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
                        {scheme.name}
                      </span>
                      {scheme.is_default && <Badge tone="brand">Default</Badge>}
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs text-gray-500">
                      {scheme.applies_to}
                      {/* A scheme with no scale grades nothing — the server's
                        * own answer, not a band count this screen interprets. */}
                      {!scheme.is_usable && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1 text-danger-600">
                            <Warning size={11} weight="fill" />
                            No scale
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {schemes.data && schemes.data.pagination.total > 0 && (
            <Pagination
              className="border-t border-gray-200 px-3"
              pagination={schemes.data.pagination}
              onPageChange={setPage}
            />
          )}
        </Card>

        {selected ? (
          <SchemeDetail
            key={selected}
            schemeId={selected}
            canManageScheme={canManageScheme}
            canManageWeights={canManageWeights}
            showWeights={showWeights}
            onChanged={() => queryClient.invalidateQueries({ queryKey: gradingKeys.root })}
          />
        ) : (
          <Card className="flex items-center justify-center py-16">
            <EmptyState
              icon={<Scales size={20} />}
              title="Pick a scheme"
              description="Its scale and its weights appear here."
            />
          </Card>
        )}
      </div>

      <SchemeDialog
        open={composing}
        scheme={null}
        onClose={() => setComposing(false)}
        onSaved={(saved) => {
          setComposing(false)
          setSelectedId(saved.id)
          queryClient.invalidateQueries({ queryKey: gradingKeys.root })
        }}
      />
    </>
  )
}

function SchemeDetail({
  schemeId,
  canManageScheme,
  canManageWeights,
  showWeights,
  onChanged,
}: {
  schemeId: string
  canManageScheme: boolean
  canManageWeights: boolean
  showWeights: boolean
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const scheme = useQuery({
    queryKey: gradingKeys.scheme(schemeId),
    queryFn: () => gradingApi.scheme(schemeId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: gradingKeys.root })
    onChanged()
  }

  const promote = useMutation({
    mutationFn: () => gradingApi.setDefault(schemeId),
    onSuccess: () => {
      refresh()
      toast.success('This is now the scheme that applies when nothing narrower does.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const archive = useMutation({
    mutationFn: () => gradingApi.archive(schemeId),
    onSuccess: () => {
      refresh()
      toast.success('Archived. Everything already computed through it is untouched.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be archived.')
    },
  })

  if (scheme.isError) {
    return (
      <Card>
        <ErrorState error={scheme.error} onRetry={() => scheme.refetch()} />
      </Card>
    )
  }

  if (scheme.isLoading || !scheme.data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }

  const data = scheme.data

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-gray-900">{data.name}</h2>
                {data.is_default && <Badge tone="brand">Default</Badge>}
                {data.status === 'archived' && <Badge tone="neutral">Archived</Badge>}
              </div>
              <p className="mt-0.5 text-2xs text-gray-600">{data.applies_to}</p>
            </div>

            {canManageScheme && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {!data.is_default && (
                  <Button
                    size="sm"
                    icon={<Check size={14} weight="bold" />}
                    loading={promote.isPending}
                    onClick={() => promote.mutate()}
                  >
                    Make default
                  </Button>
                )}
                <Button size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {!data.is_default && data.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Archive size={14} />}
                    loading={archive.isPending}
                    onClick={() => archive.mutate()}
                  >
                    Archive
                  </Button>
                )}
              </div>
            )}
          </div>

          <Facts>
            <Fact label="Marks are out of">{formatNumber(data.max_score)}</Fact>
            <Fact label="Passes at">
              {data.pass_mark === null ? 'Not set' : formatNumber(data.pass_mark)}
            </Fact>
            <Fact label="Grade points">
              {data.uses_grade_points
                ? `Yes, out of ${formatNumber(data.grade_point_max ?? 0)}`
                : 'No'}
            </Fact>
            <Fact label="Weighted by credit">{data.is_credit_weighted ? 'Yes' : 'No'}</Fact>
            <Fact label="Rounding">
              {data.rounding_mode.replace(/_/g, ' ')} to {formatNumber(data.decimal_places)} places
            </Fact>
          </Facts>
        </Card>

        <ScaleEditor scheme={data} canEdit={canManageScheme} onSaved={refresh} />

        {/* Drawn only where the assessments module answers — a different
          * module from the scale above it, deliberately. */}
        {showWeights && (
          <WeightsEditor scheme={data} canEdit={canManageWeights} onSaved={refresh} />
        )}
      </div>

      <SchemeDialog
        open={editing}
        scheme={data}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          refresh()
        }}
      />
    </>
  )
}

function SchemeDialog({
  open,
  scheme,
  onClose,
  onSaved,
}: {
  open: boolean
  scheme: GradingScheme | null
  onClose: () => void
  onSaved: (scheme: GradingScheme) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [passMark, setPassMark] = useState('40')
  const [usesGradePoints, setUsesGradePoints] = useState(false)
  const [gradePointMax, setGradePointMax] = useState('5')
  const [rounding, setRounding] = useState<RoundingMode>('half_up')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setName(scheme?.name ?? '')
    setCode(scheme?.code ?? '')
    setMaxScore(String(scheme?.max_score ?? 100))
    setPassMark(scheme?.pass_mark === null || scheme?.pass_mark === undefined ? '' : String(scheme.pass_mark))
    setUsesGradePoints(scheme?.uses_grade_points ?? false)
    setGradePointMax(scheme?.grade_point_max === null || scheme?.grade_point_max === undefined ? '5' : String(scheme.grade_point_max))
    setRounding(scheme?.rounding_mode ?? 'half_up')
  }, [open, scheme])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        max_score: Number(maxScore),
        pass_mark: passMark.trim() === '' ? null : Number(passMark),
        uses_grade_points: usesGradePoints,
        grade_point_max: usesGradePoints ? Number(gradePointMax) : null,
        rounding_mode: rounding,
      }

      return scheme ? gradingApi.updateScheme(scheme.id, payload) : gradingApi.createScheme(payload)
    },
    onSuccess: (saved) => {
      toast.success(scheme ? 'Saved.' : 'Scheme created. It needs a scale before it can grade.')
      onSaved(saved)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That scheme was not saved.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scheme ? 'Edit scheme' : 'New grading scheme'}
      description={
        scheme
          ? 'The next calculation of every gradebook using this scheme uses the new numbers.'
          : 'A new scheme is not the institution default, and cannot grade until it has a scale.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={name.trim() === ''}
            onClick={() => save.mutate()}
          >
            {scheme ? 'Save' : 'Create scheme'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Name" required error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Code" error={errors.code} hint="Optional, and unique when given.">
          {(props) => (
            <Input
              {...props}
              value={code}
              maxLength={80}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
          )}
        </Field>

        <div className="grid gap-1 sm:grid-cols-2">
          <Field label="Marks are out of" error={errors.max_score}>
            {(props) => (
              <Input
                {...props}
                type="number"
                value={maxScore}
                onChange={(event) => setMaxScore(event.currentTarget.value)}
              />
            )}
          </Field>

          <Field label="Passes at" error={errors.pass_mark}>
            {(props) => (
              <Input
                {...props}
                type="number"
                value={passMark}
                onChange={(event) => setPassMark(event.currentTarget.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-1 sm:grid-cols-2">
          <Field label="Grade points">
            {(props) => (
              <Select
                {...props}
                value={usesGradePoints ? 'yes' : 'no'}
                onChange={(event) => setUsesGradePoints(event.currentTarget.value === 'yes')}
                options={[
                  { value: 'no', label: 'Not used' },
                  { value: 'yes', label: 'Used' },
                ]}
              />
            )}
          </Field>

          {usesGradePoints && (
            <Field label="Out of" required error={errors.grade_point_max}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  value={gradePointMax}
                  onChange={(event) => setGradePointMax(event.currentTarget.value)}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Rounding" error={errors.rounding_mode}>
          {(props) => (
            <Select
              {...props}
              value={rounding}
              onChange={(event) => setRounding(event.currentTarget.value as RoundingMode)}
              options={[
                { value: 'half_up', label: 'Half up' },
                { value: 'half_down', label: 'Half down' },
                { value: 'up', label: 'Always up' },
                { value: 'down', label: 'Always down' },
              ]}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
