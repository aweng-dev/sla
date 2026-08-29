import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Info, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Tooltip } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { gradingApi, type CategoryInput, type GradingScheme } from '../grading.api'

/**
 * How a final mark is composed: 40% coursework, 60% exam.
 *
 * ── The id is carried back, and that is the whole safety of this screen ────
 *
 * A category is pointed at: `gradebook_items.assessment_category_id` is how an
 * assessment knows which share of the mark it belongs to. Every row keeps its
 * id through editing and sends it back, so the server updates in place. Drop it
 * and the server would recreate the row, nulling every item's category and
 * silently moving all of them into the unweighted remainder — marks across the
 * institution changed with no error anywhere.
 *
 * ── A category with assessments in it cannot be removed ────────────────────
 *
 * The server refuses to orphan them, so the delete button is not offered on a
 * row that has any. Offering it and letting the server quietly keep the row
 * would leave somebody believing they had deleted something.
 *
 * ── The total is shown and never enforced ──────────────────────────────────
 *
 * The server rescales across whatever carried marks, so a mark given before the
 * exam is out of the coursework rather than out of the whole course. 90 is a
 * working total and 0 falls back to an unweighted mean. So this shows the sum
 * and says when it is not 100 — it does not refuse to save.
 */

interface DraftCategory extends CategoryInput {
  key: string
  itemCount: number
}

function toDraft(scheme: GradingScheme): DraftCategory[] {
  return (scheme.categories ?? []).map((category) => ({
    key: category.id,
    id: category.id,
    name: category.name,
    code: category.code,
    kind: category.kind,
    weight_percent: category.weight_percent,
    aggregation: category.aggregation,
    drop_lowest_count: category.drop_lowest_count,
    max_score: category.max_score,
    itemCount: category.item_count ?? 0,
  }))
}

export function WeightsEditor({
  scheme,
  canEdit,
  onSaved,
}: {
  scheme: GradingScheme
  canEdit: boolean
  onSaved: () => void
}) {
  const [rows, setRows] = useState<DraftCategory[]>(() => toDraft(scheme))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setRows(toDraft(scheme))
    setDirty(false)
  }, [scheme.id, scheme.categories])

  const save = useMutation({
    mutationFn: () =>
      gradingApi.replaceCategories(
        scheme.id,
        rows.map(({ key: _key, itemCount: _count, ...category }) => category),
      ),
    onSuccess: () => {
      setDirty(false)
      toast.success('Weights saved.')
      onSaved()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Those weights were not saved.')
    },
  })

  function patch(key: string, change: Partial<DraftCategory>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)))
    setDirty(true)
  }

  function add() {
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        name: '',
        code: null,
        kind: null,
        weight_percent: 0,
        drop_lowest_count: 0,
        max_score: null,
        itemCount: 0,
      },
    ])
    setDirty(true)
  }

  const total = Math.round(rows.reduce((sum, row) => sum + Number(row.weight_percent || 0), 0) * 100) / 100
  const balanced = total === 100

  return (
    <Card>
      <CardHeader
        title="Weights"
        subtitle={
          rows.length === 0
            ? 'No categories. Every assessment counts equally.'
            : `${formatNumber(rows.length)} ${rows.length === 1 ? 'category' : 'categories'}`
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={balanced ? 'success' : 'neutral'}>{formatNumber(total)}%</Badge>
            {canEdit && (
              <>
                <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={add}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={save.isPending}
                  disabled={!dirty}
                  onClick={() => save.mutate()}
                >
                  Save weights
                </Button>
              </>
            )}
          </div>
        }
      />

      {rows.length > 0 && !balanced && (
        <p className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-2xs text-gray-600">
          <Info size={13} />
          These add up to {formatNumber(total)}%, not 100. That still works — a mark is worked out
          across whichever categories have been assessed so far — but it is worth a second look.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No categories"
          description="Without them every assessment in a gradebook counts equally toward the final mark, which is what a teacher who never set weights plainly meant."
          action={
            canEdit ? (
              <Button variant="primary" onClick={add}>
                Add a category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-gray-200">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Input
                aria-label="Category name"
                value={row.name}
                maxLength={160}
                disabled={!canEdit}
                placeholder="Continuous assessment"
                className="min-w-0 flex-1"
                onChange={(event) => patch(row.key, { name: event.currentTarget.value })}
              />

              <div className="flex items-center gap-1.5">
                <Input
                  aria-label="Weight percent"
                  type="number"
                  value={String(row.weight_percent)}
                  disabled={!canEdit}
                  className="w-20"
                  onChange={(event) =>
                    patch(row.key, { weight_percent: Number(event.currentTarget.value) })
                  }
                />
                <span className="text-xs text-gray-500">%</span>
              </div>

              <span className="w-28 shrink-0 text-2xs text-gray-500">
                {row.itemCount === 0
                  ? 'No assessments'
                  : `${formatNumber(row.itemCount)} ${row.itemCount === 1 ? 'assessment' : 'assessments'}`}
              </span>

              {canEdit &&
                (row.itemCount === 0 ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove category"
                    onClick={() => {
                      setRows((current) => current.filter((entry) => entry.key !== row.key))
                      setDirty(true)
                    }}
                  >
                    <Trash size={14} />
                  </Button>
                ) : (
                  /* Not offered rather than offered and refused: the server
                   * will not orphan assessments, and a button that silently
                   * does nothing is worse than no button. */
                  <Tooltip
                    side="top"
                    content="Move its assessments to another category first."
                  >
                    <span className={cn('flex h-8 w-8 items-center justify-center text-gray-300')}>
                      <Trash size={14} />
                    </span>
                  </Tooltip>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
