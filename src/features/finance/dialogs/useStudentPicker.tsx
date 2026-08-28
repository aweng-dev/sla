import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/shared/api/client'
import { Avatar, Field, Input } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { useTerminology } from '@/features/tenant/TenantProvider'

interface StudentRow {
  id: string
  student_number: string
  person: { full_name: string }
}

/**
 * Choosing a learner, by typing.
 *
 * A `<select>` of a hundred names is unusable and a school with three thousand
 * is not unusual, so this searches the roster server-side and offers what it
 * finds. Debounced, and it does not fire at all until there is something to
 * search for — an unfiltered roster request per keystroke is how a picker
 * becomes the slowest thing on the screen.
 */
export function StudentPicker({
  value,
  onChange,
  error,
  disabled,
  label,
}: {
  value: { id: string; name: string } | null
  onChange: (student: { id: string; name: string } | null) => void
  error?: string
  disabled?: boolean
  label?: string
}) {
  const t = useTerminology()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250)
    return () => clearTimeout(timer)
  }, [term])

  const query = useQuery({
    queryKey: ['finance', 'student-search', debounced],
    queryFn: () =>
      get<StudentRow[]>('/admin/students', { params: { search: debounced, per_page: 8 } }),
    enabled: debounced.length >= 2 && value === null,
    staleTime: 60_000,
  })

  const results = useMemo(() => query.data ?? [], [query.data])

  if (value) {
    return (
      <Field label={label ?? t('learner')} error={error}>
        {() => (
          <div className="flex h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-2.5">
            <Avatar name={value.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{value.name}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(null)
                setTerm('')
              }}
              className="text-xs text-accent-500 hover:underline"
            >
              Change
            </button>
          </div>
        )}
      </Field>
    )
  }

  return (
    <Field
      label={label ?? t('learner')}
      error={error}
      hint={debounced.length >= 2 ? undefined : 'Type at least two characters of a name or number.'}
    >
      {(props) => (
        <div className="relative">
          <Input
            {...props}
            value={term}
            disabled={disabled}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Search ${t('learners').toLowerCase()}`}
            autoComplete="off"
          />
          {debounced.length >= 2 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-popover">
              {query.isLoading ? (
                <p className="px-3 py-2 text-xs text-gray-600">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-600">Nobody matches that.</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {results.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => onChange({ id: row.id, name: row.person.full_name })}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                          'hover:bg-gray-100',
                        )}
                      >
                        <Avatar name={row.person.full_name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                          {row.person.full_name}
                        </span>
                        <span className="shrink-0 text-2xs tabular text-gray-600">
                          {row.student_number}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Field>
  )
}
