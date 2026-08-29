import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardHeader, EmptyState, Input } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { gradingApi, type BandInput, type GradingScheme } from '../grading.api'

/**
 * The scale: what each mark is called.
 *
 * ── Edited as a whole, and saved as a whole ────────────────────────────────
 *
 * Every mark must fall in exactly one band, which is a property of the set, so
 * the API takes the entire scale in one PUT and refuses overlaps with a 409. A
 * row-at-a-time editor would have to save through states where B and C both
 * claim 65, which the server will not accept — so the rows are held locally and
 * sent together.
 *
 * ── Overlap is shown before it is sent ─────────────────────────────────────
 *
 * The server is the authority and answers 409 naming the two bands. This checks
 * the same rule locally and marks the offending rows, because finding out which
 * two collided from a toast after pressing save is a worse way to author a scale
 * than seeing it as you type.
 *
 * ── Gaps are NOT an error ──────────────────────────────────────────────────
 *
 * 60–69 then 70–100 leaves 69.6 unclaimed, and a weighted scheme lands there
 * constantly — the server drops such a mark to the highest band whose floor it
 * clears. Flagging that would tell somebody their scale is broken when it is
 * written the way every school writes it.
 */

interface DraftBand extends BandInput {
  key: string
}

function toDraft(scheme: GradingScheme): DraftBand[] {
  return (scheme.bands ?? []).map((band) => ({
    key: band.id,
    label: band.label,
    description: band.description,
    remark: band.remark,
    min_score: band.min_score,
    max_score: band.max_score,
    grade_point: band.grade_point,
    is_passing: band.is_passing,
  }))
}

/**
 * The rows that claim the same marks.
 *
 * Both ends are inclusive, so touching edges collide too: 0–70 and 70–100 are
 * an overlap, not a boundary.
 */
function overlappingKeys(bands: DraftBand[]): Set<string> {
  const clashing = new Set<string>()

  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i]
      const b = bands[j]

      if (Number(a.min_score) <= Number(b.max_score) && Number(b.min_score) <= Number(a.max_score)) {
        clashing.add(a.key)
        clashing.add(b.key)
      }
    }
  }

  return clashing
}

export function ScaleEditor({
  scheme,
  canEdit,
  onSaved,
}: {
  scheme: GradingScheme
  canEdit: boolean
  onSaved: () => void
}) {
  const [bands, setBands] = useState<DraftBand[]>(() => toDraft(scheme))
  const [dirty, setDirty] = useState(false)

  /* Reseeded when a different scheme is opened or the server answers with a
   * new scale. Keyed on both so a save's response replaces the draft. */
  useEffect(() => {
    setBands(toDraft(scheme))
    setDirty(false)
  }, [scheme.id, scheme.bands])

  const save = useMutation({
    mutationFn: () =>
      gradingApi.replaceScale(
        scheme.id,
        bands.map(({ key: _key, ...band }) => band),
      ),
    onSuccess: () => {
      setDirty(false)
      toast.success('Scale saved.')
      onSaved()
    },
    onError: (error) => {
      /* The server names the two bands that collided; a message keyed to an
       * array index could not say which other row it hit. */
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That scale was not saved.')
    },
  })

  function patch(key: string, change: Partial<DraftBand>) {
    setBands((current) => current.map((band) => (band.key === key ? { ...band, ...change } : band)))
    setDirty(true)
  }

  function add() {
    setBands((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        label: '',
        min_score: 0,
        max_score: 0,
        grade_point: null,
        is_passing: true,
        description: null,
        remark: null,
      },
    ])
    setDirty(true)
  }

  function remove(key: string) {
    setBands((current) => current.filter((band) => band.key !== key))
    setDirty(true)
  }

  const clashing = overlappingKeys(bands)
  const lowest = bands.length === 0 ? null : Math.min(...bands.map((band) => Number(band.min_score)))
  const missingFloor = lowest !== null && lowest > 0
  const blocked = bands.length === 0 || clashing.size > 0 || missingFloor

  return (
    <Card>
      <CardHeader
        title="Scale"
        subtitle={
          bands.length === 0
            ? 'No bands. This scheme cannot put a letter on any mark.'
            : `${formatNumber(bands.length)} ${bands.length === 1 ? 'band' : 'bands'}`
        }
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={add}>
                Add band
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={save.isPending}
                disabled={!dirty || blocked}
                onClick={() => save.mutate()}
              >
                Save scale
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* The two things the server will refuse, said before it refuses them. */}
      {clashing.size > 0 && (
        <p className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-2xs text-danger-600">
          <Warning size={13} weight="fill" />
          Two bands claim the same marks. Every mark must fall in exactly one.
        </p>
      )}
      {missingFloor && (
        <p className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-2xs text-danger-600">
          <Warning size={13} weight="fill" />
          The lowest band starts at {formatNumber(lowest)}. A scale that does not reach 0 leaves
          failing marks with no grade at all.
        </p>
      )}

      {bands.length === 0 ? (
        <EmptyState
          title="No scale yet"
          description="Until a scale exists, every mark computed through this scheme lands with no letter, no grade point and no pass flag."
          action={
            canEdit ? (
              <Button variant="primary" onClick={add}>
                Add the first band
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-2xs text-gray-600">
                <th className="px-4 py-2 font-medium">Grade</th>
                <th className="px-2 py-2 font-medium">From</th>
                <th className="px-2 py-2 font-medium">To</th>
                {scheme.uses_grade_points && <th className="px-2 py-2 font-medium">Point</th>}
                <th className="px-2 py-2 font-medium">Remark</th>
                <th className="px-2 py-2 font-medium">Passes</th>
                {canEdit && <th className="w-10 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {bands
                .slice()
                .sort((a, b) => Number(b.min_score) - Number(a.min_score))
                .map((band) => (
                  <tr
                    key={band.key}
                    className={cn(
                      'border-b border-gray-100 last:border-0',
                      clashing.has(band.key) && 'bg-danger-50',
                    )}
                  >
                    <td className="px-4 py-1.5">
                      <Input
                        aria-label="Grade label"
                        value={band.label}
                        maxLength={20}
                        disabled={!canEdit}
                        className="w-20"
                        onChange={(event) => patch(band.key, { label: event.currentTarget.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Lowest mark"
                        type="number"
                        value={String(band.min_score)}
                        disabled={!canEdit}
                        className="w-24"
                        onChange={(event) =>
                          patch(band.key, { min_score: Number(event.currentTarget.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Highest mark"
                        type="number"
                        value={String(band.max_score)}
                        disabled={!canEdit}
                        className="w-24"
                        onChange={(event) =>
                          patch(band.key, { max_score: Number(event.currentTarget.value) })
                        }
                      />
                    </td>
                    {scheme.uses_grade_points && (
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label="Grade point"
                          type="number"
                          value={band.grade_point === null ? '' : String(band.grade_point)}
                          disabled={!canEdit}
                          className="w-20"
                          onChange={(event) =>
                            patch(band.key, {
                              grade_point:
                                event.currentTarget.value === ''
                                  ? null
                                  : Number(event.currentTarget.value),
                            })
                          }
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label="Remark"
                        value={band.remark ?? ''}
                        maxLength={160}
                        disabled={!canEdit}
                        onChange={(event) =>
                          patch(band.key, { remark: event.currentTarget.value || null })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-label={band.is_passing ? 'Mark as failing' : 'Mark as passing'}
                        onClick={() => patch(band.key, { is_passing: !band.is_passing })}
                        className="disabled:cursor-not-allowed"
                      >
                        <Badge tone={band.is_passing ? 'success' : 'neutral'}>
                          {band.is_passing ? 'Pass' : 'Fail'}
                        </Badge>
                      </button>
                    </td>
                    {canEdit && (
                      <td className="px-2 py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove band"
                          onClick={() => remove(band.key)}
                        >
                          <Trash size={14} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
