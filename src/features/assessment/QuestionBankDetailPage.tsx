import { useId, useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Archive,
  Database,
  PencilSimple,
  Plus,
  Stack,
} from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { formatDate } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Blank,
  Button,
  Card,
  CardHeader,
  EmptyState,
  EntityIcon,
  ErrorState,
  Fact,
  Facts,
  Flag,
  MetaDot,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  Toolbar,
} from '@/shared/ui'
import { BankDialog } from './BankDialog'
import { QuestionCard } from './QuestionCard'
import { QuestionDialog } from './QuestionDialog'
import { assessmentKeys, banksApi, questionsApi, type QuestionListQuery } from './assessment.api'
import {
  QUESTION_DIFFICULTIES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  type QuestionRow,
} from './assessment.types'
import { readBankListSearch, toBankListQuery } from './useBankListSearch'

const PER_PAGE = 25

/**
 * One bank, and the questions in it.
 *
 * ── The shape is Sprig's study detail ──────────────────────────────────────
 *
 * An icon tile and the name, a meta line of small facts under it, actions top
 * right, then a two-column body: the numbered question list on the left and a
 * details panel on the right. That is exactly how Sprig lays out a study, and
 * a question bank is the same kind of object — a named container whose whole
 * point is the ordered list inside it.
 *
 * The filters sit above the list rather than in the panel, because they narrow
 * the list and Sprig puts a study's "Received within / Filters" row in the
 * same place.
 */
export function QuestionBankDetailPage() {
  const { bankId } = useParams({ from: '/app/question-bank/$bankId' })
  const t = useTerminology()
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const headingId = useId()

  const [editingBank, setEditingBank] = useState(false)
  const [composing, setComposing] = useState(false)
  const [revising, setRevising] = useState<QuestionRow | undefined>(undefined)

  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const canManage = perms.has('question_bank.manage')

  /* The list's own filters travel in this route's query string, so the way
   * back lands on the page of the list the reader came from. */
  const rawSearch = useSearch({ strict: false })
  const listSearch = useMemo(() => readBankListSearch(rawSearch), [rawSearch])

  const bank = useQuery({
    queryKey: assessmentKeys.bank(bankId),
    queryFn: () => banksApi.detail(bankId),
  })

  const listQuery = useMemo<QuestionListQuery>(
    () => ({
      question_bank_id: bankId,
      search: search || undefined,
      type: type || undefined,
      difficulty: difficulty || undefined,
      status: status || undefined,
      page,
      per_page: PER_PAGE,
    }),
    [bankId, search, type, difficulty, status, page],
  )

  const questions = useQuery({
    queryKey: assessmentKeys.questionList(listQuery),
    queryFn: () => questionsApi.list(listQuery),
    placeholderData: (previous) => previous,
  })

  const archive = useMutation({
    mutationFn: (archived: boolean) => banksApi.setArchived(bankId, archived),
    onSuccess: (_data, archived) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.all })
      toast.success(archived ? 'Bank archived' : 'Bank restored')
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.'),
  })

  const backLink = (
    <Link
      to="/question-bank"
      search={toBankListQuery(listSearch)}
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={12} weight="bold" />
      All banks
    </Link>
  )

  if (bank.isError) {
    return (
      <PageStack>
        {backLink}
        <ErrorState error={bank.error} onRetry={() => bank.refetch()} />
      </PageStack>
    )
  }

  const data = bank.data
  const rows = questions.data?.rows ?? []
  const pagination = questions.data?.pagination
  const isFiltered = Boolean(search || type || difficulty || status)

  function clearFilters() {
    setSearch('')
    setType('')
    setDifficulty('')
    setStatus('')
    setPage(1)
  }

  return (
    <PageStack>
      {backLink}

      <PageHeader
        title={data?.name ?? ' '}
        icon={
          <EntityIcon>
            <Database size={18} />
          </EntityIcon>
        }
        meta={
          data && (
            <>
              <StatusBadge status={data.status} />
              {data.code && (
                <>
                  <MetaDot />
                  <span className="font-mono text-[0.6875rem]">{data.code}</span>
                </>
              )}
              {data.course_title && (
                <>
                  <MetaDot />
                  <span>{data.course_title}</span>
                </>
              )}
              {data.academic_level && (
                <>
                  <MetaDot />
                  <span>{data.academic_level}</span>
                </>
              )}
              <MetaDot />
              <Flag on={data.is_shared}>{data.is_shared ? 'Shared' : 'Private'}</Flag>
            </>
          )
        }
        actions={
          data && canManage ? (
            <>
              <Button
                icon={<Archive size={14} />}
                loading={archive.isPending}
                onClick={() => archive.mutate(data.status !== 'archived')}
              >
                {data.status === 'archived' ? 'Restore' : 'Archive'}
              </Button>
              <Button icon={<PencilSimple size={14} />} onClick={() => setEditingBank(true)}>
                Edit
              </Button>
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setComposing(true)}
              >
                Add question
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ── The questions ────────────────────────────────────────────── */}
        <div className="min-w-0">
          <Toolbar
            className="pt-0"
            filters={
              <>
                <div className="w-36">
                  <Select
                    value={type}
                    onChange={(event) => {
                      setType(event.target.value)
                      setPage(1)
                    }}
                    aria-label="Filter by type"
                    options={[
                      { value: '', label: 'Any type' },
                      ...QUESTION_TYPES.map((value) => ({
                        value,
                        label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                      })),
                    ]}
                  />
                </div>
                <div className="w-32">
                  <Select
                    value={difficulty}
                    onChange={(event) => {
                      setDifficulty(event.target.value)
                      setPage(1)
                    }}
                    aria-label="Filter by difficulty"
                    options={[
                      { value: '', label: 'Any level' },
                      ...QUESTION_DIFFICULTIES.map((value) => ({
                        value,
                        label: value.charAt(0).toUpperCase() + value.slice(1),
                      })),
                    ]}
                  />
                </div>
                <div className="w-32">
                  <Select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value)
                      setPage(1)
                    }}
                    aria-label="Filter by status"
                    options={[
                      { value: '', label: 'Any status' },
                      ...QUESTION_STATUSES.map((value) => ({
                        value,
                        label: value.charAt(0).toUpperCase() + value.slice(1),
                      })),
                    ]}
                  />
                </div>
                {isFiltered && (
                  <Button variant="link" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            actions={
              <div className="w-52">
                <SearchInput
                  className="w-full"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Search questions"
                  aria-label="Search questions by prompt or topic"
                />
              </div>
            }
          />

          <Card
            className={questions.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
          >
            <div id={headingId} className="sr-only">
              Questions in {data?.name}
            </div>

            {questions.isLoading && (
              <div className="divide-y divide-gray-200">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex flex-col gap-2 px-4 py-4">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ))}
              </div>
            )}

            {questions.isError && (
              <ErrorState error={questions.error} onRetry={() => questions.refetch()} />
            )}

            {!questions.isLoading && !questions.isError && rows.length === 0 && (
              <EmptyState
                icon={<Stack size={20} />}
                title={isFiltered ? 'No questions match these filters' : 'No questions yet'}
                description={
                  isFiltered
                    ? 'Nothing in this bank answers to this search and these filters together.'
                    : 'A question carries its own marks, difficulty and answer key. Add the first one.'
                }
                action={
                  isFiltered ? (
                    <Button onClick={clearFilters}>Clear filters</Button>
                  ) : canManage ? (
                    <Button variant="primary" onClick={() => setComposing(true)}>
                      Add question
                    </Button>
                  ) : undefined
                }
              />
            )}

            {!questions.isLoading &&
              rows.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={((pagination?.current_page ?? 1) - 1) * PER_PAGE + index}
                  canManage={canManage}
                  onEdit={() => setRevising(question)}
                />
              ))}
          </Card>

          {pagination && pagination.last_page > 1 && (
            <Pagination pagination={pagination} onPageChange={setPage} />
          )}
        </div>

        {/* ── Bank details, as Sprig's right-hand panel ─────────────────── */}
        <div className="min-w-0">
          <Card>
            <CardHeader title="Bank details" />
            {bank.isLoading && (
              <div className="divide-y divide-gray-200">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            )}
            {data && (
              <Facts>
                <Fact label="Questions">
                  <span className="tabular">{data.question_count ?? rows.length}</span>
                </Fact>
                {/* How much of the bank may actually go on a paper — `active`
                  * and carrying a usable key. Both counts are `whenCounted`,
                  * so a payload that omits one says so rather than showing a
                  * zero that is not a zero. */}
                <Fact label="Ready to assemble">
                  {data.assemblable_count === undefined ? (
                    <span className="text-gray-500">Not counted</span>
                  ) : (
                    <span className="tabular">{data.assemblable_count}</span>
                  )}
                </Fact>
                <Fact label={t('course')}>
                  {data.course_title ? (
                    <>
                      {data.course_title}
                      {data.course_code && (
                        <span className="text-gray-600"> · {data.course_code}</span>
                      )}
                    </>
                  ) : (
                    <Blank />
                  )}
                </Fact>
                <Fact label={t('level')}>{data.academic_level || <Blank />}</Fact>
                <Fact label="Visibility">
                  <Flag on={data.is_shared}>
                    {data.is_shared ? `All ${t('teachers').toLowerCase()}` : 'Owner only'}
                  </Flag>
                </Fact>
                <Fact label="Owner">{data.owner || <Blank />}</Fact>
                <Fact label="Created">{formatDate(data.created_at)}</Fact>
                <Fact label="Updated">{formatDate(data.updated_at)}</Fact>
              </Facts>
            )}
          </Card>

          {data?.description && (
            <Card className="mt-5">
              <CardHeader title="About" />
              <p className="px-4 py-3 text-sm text-gray-700">{data.description}</p>
            </Card>
          )}

          {data?.status === 'archived' && (
            <Card className="mt-5">
              <div className="flex items-start gap-2 px-4 py-3">
                <Badge tone="neutral">Archived</Badge>
                <p className="text-xs text-gray-600">
                  Archived banks stay readable and keep their code, but are not offered when a
                  paper is assembled.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {data && (
        <BankDialog open={editingBank} onClose={() => setEditingBank(false)} bank={data} />
      )}
      <QuestionDialog open={composing} onClose={() => setComposing(false)} bankId={bankId} />
      <QuestionDialog
        open={revising !== undefined}
        onClose={() => setRevising(undefined)}
        bankId={bankId}
        question={revising}
      />
    </PageStack>
  )
}
