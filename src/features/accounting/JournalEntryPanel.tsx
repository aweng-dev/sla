import { useQuery } from '@tanstack/react-query'
import { formatDate, formatDateTime, formatMoney, humanize } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import {
  Blank,
  Fact,
  Facts,
  Modal,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { accountingApi, accountingKeys } from './accounting.api'
import type { JournalLine } from './accounting.types'

/**
 * One entry, opened out.
 *
 * ── A dialog rather than a side panel ──────────────────────────────────────
 *
 * The other detail surfaces in this app sit beside their list, because the
 * list is what the reader is working through. A journal entry is the opposite:
 * it is a document with its own two columns that must be read together, and
 * squeezing debit and credit into a third of the width is how a reader loses
 * track of which side they are on.
 *
 * ── It fetches its own entry ───────────────────────────────────────────────
 *
 * `lines` are only sent by the detail endpoint — a page of twenty-five entries
 * would otherwise carry several hundred rows to render a date and a total. So
 * the panel asks for the entry it was given the id of, rather than reading one
 * the list never had.
 */
export function JournalEntryPanel({
  entryId,
  onClose,
}: {
  entryId: string | null
  onClose: () => void
}) {
  const entry = useQuery({
    queryKey: accountingKeys.entry(entryId ?? ''),
    queryFn: () => accountingApi.entry(entryId!),
    enabled: entryId !== null,
  })

  const data = entry.data

  return (
    <Modal
      open={entryId !== null}
      onClose={onClose}
      size="lg"
      title={data ? data.entry_number : 'Journal entry'}
      description={data?.description}
    >
      {entry.isLoading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-gray-200">
            <Facts>
              <Fact label="Date">{data.entry_date ? formatDate(data.entry_date) : <Blank />}</Fact>
              <Fact label="Source">
                {data.source_type ? humanize(data.source_type) : <Blank />}
              </Fact>
              <Fact label="Status">
                <StatusBadge status={data.status} />
              </Fact>
              <Fact label="Posted">
                {data.posted_at ? formatDateTime(data.posted_at) : <Blank />}
              </Fact>
            </Facts>
          </div>

          <div>
            <div className="flex items-baseline justify-between pb-2">
              <p className="text-sm font-semibold text-gray-900">Lines</p>
              {/* The API's own comparison. Comparing the two totals in the
                * client risks doing it in floating point, and a ledger that
                * says "balanced" because 0.1 + 0.2 was close enough is the
                * exact failure double-entry exists to prevent. */}
              <p
                className={cn(
                  'text-xs font-medium',
                  data.is_balanced ? 'text-success-600' : 'text-danger-500',
                )}
              >
                {data.is_balanced ? 'Balanced' : 'Debits do not equal credits'}
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-table-head">
                    <th className="px-4 py-3 text-xs font-medium text-gray-700">Account</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.lines ?? []).map((line: JournalLine) => (
                    <tr key={line.id} className="border-b border-gray-200 last:border-b-0">
                      <td className="px-4 py-3 text-[0.8125rem] leading-5 text-gray-900">
                        <span className="font-mono text-[0.6875rem] text-gray-600">
                          {line.account_code}
                        </span>{' '}
                        {line.account_name}
                        {line.memo && (
                          <span className="block text-[0.6875rem] text-gray-600">{line.memo}</span>
                        )}
                      </td>
                      {/* Each line sits on exactly one side. A dash on the
                        * other keeps the two columns readable as columns. */}
                      <td className="px-4 py-3 text-right text-[0.8125rem] leading-5 text-gray-900 tabular">
                        {line.side === 'debit' ? formatMoney(line.amount_minor, line.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[0.8125rem] leading-5 text-gray-900 tabular">
                        {line.side === 'credit' ? formatMoney(line.amount_minor, line.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-300 bg-table-head">
                    <td className="px-4 py-3 text-[0.8125rem] font-medium leading-5 text-gray-900">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-[0.8125rem] font-medium leading-5 text-gray-900 tabular">
                      {formatMoney(data.total_debit_minor, data.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-[0.8125rem] font-medium leading-5 text-gray-900 tabular">
                      {formatMoney(data.total_credit_minor, data.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
