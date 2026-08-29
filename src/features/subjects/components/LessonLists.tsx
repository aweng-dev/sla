import { LinkSimple, Plus, Stack, Target, X } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import type { CurriculumResource } from '../curriculum.api'

type ListVariant = 'panel' | 'inline'

/**
 * The two lists that sit either side of a lesson's notes.
 *
 * ── Lists, not prose, because other things point at them ───────────────────
 *
 * Objectives and resources are stored as their own columns rather than as
 * headings inside the rich-text document. An inspection asks for objectives, an
 * assessment is written to cover them, and a colleague covering a lesson opens
 * it to find what to teach from. Inside a paragraph all three are readable by a
 * human and by nothing else.
 *
 * ── Absent rather than empty when there is nothing and nobody may add ──────
 *
 * On a published document these render only what is there. An empty "Learning
 * objectives" heading above nothing is a heading about the absence of content,
 * which is worse than no heading.
 */

/* ── Objectives ──────────────────────────────────────────────────────────── */

export function ObjectiveList({
  objectives,
  editable,
  onChange,
  variant = 'panel',
}: {
  objectives: string[]
  editable: boolean
  onChange: (next: string[]) => void
  /** `panel` is a band in the editor, hairlined off the notes below it.
   *  `inline` is a paragraph inside a printed document, where a full-width
   *  rule across a nested lesson would cut the page in half. */
  variant?: ListVariant
}) {
  if (!editable && objectives.length === 0) return null

  return (
    <section className={cn(variant === 'panel' ? 'border-b border-gray-200 px-5 py-3' : 'mt-2')}>
      <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-gray-500">
        <Target size={12} aria-hidden />
        Learning objectives
      </h3>

      <ul className="mt-2 flex flex-col gap-1">
        {objectives.map((objective, index) => (
          <li key={index} className="group flex items-start gap-2">
            <span
              className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-gray-400"
              aria-hidden
            />
            {editable ? (
              <>
                <input
                  value={objective}
                  onChange={(event) => {
                    const next = [...objectives]
                    next[index] = event.target.value
                    onChange(next)
                  }}
                  /* Enter adds the next one, which is how a list of objectives
                   * is actually typed — one after another, without reaching for
                   * the mouse between each. */
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onChange([...objectives.slice(0, index + 1), '', ...objectives.slice(index + 1)])
                    }

                    /* Backspace on an empty row removes it, as it does in every
                     * list somebody has typed in before. */
                    if (event.key === 'Backspace' && objective === '' && objectives.length > 1) {
                      event.preventDefault()
                      onChange(objectives.filter((_, i) => i !== index))
                    }
                  }}
                  placeholder="Learners can…"
                  aria-label={`Objective ${index + 1}`}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm leading-6 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                />
                <RemoveButton
                  label={`Remove objective ${index + 1}`}
                  onClick={() => onChange(objectives.filter((_, i) => i !== index))}
                />
              </>
            ) : (
              <span className="text-sm leading-6 text-gray-800">{objective}</span>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <AddButton
          label={objectives.length === 0 ? 'Add an objective' : 'Add another'}
          onClick={() => onChange([...objectives, ''])}
        />
      )}
    </section>
  )
}

/* ── Resources ───────────────────────────────────────────────────────────── */

export function ResourceList({
  resources,
  editable,
  onChange,
  variant = 'panel',
}: {
  resources: CurriculumResource[]
  editable: boolean
  onChange: (next: CurriculumResource[]) => void
  variant?: ListVariant
}) {
  if (!editable && resources.length === 0) return null

  return (
    <section className={cn(variant === 'panel' ? 'border-t border-gray-200 px-5 py-3' : 'mt-2')}>
      <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-gray-500">
        <Stack size={12} aria-hidden />
        Resources
      </h3>

      <ul className="mt-2 flex flex-col gap-1.5">
        {resources.map((resource, index) => (
          <li key={index} className="flex items-start gap-2">
            {editable ? (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <input
                    value={resource.label}
                    onChange={(event) => {
                      const next = [...resources]
                      next[index] = { ...resource, label: event.target.value }
                      onChange(next)
                    }}
                    placeholder="Chapter 4 of the New General Mathematics"
                    aria-label={`Resource ${index + 1} name`}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                  />
                  <input
                    value={resource.url ?? ''}
                    onChange={(event) => {
                      const next = [...resources]
                      next[index] = { ...resource, url: event.target.value || null }
                      onChange(next)
                    }}
                    type="url"
                    inputMode="url"
                    placeholder="Link (optional)"
                    aria-label={`Resource ${index + 1} link`}
                    className="min-w-0 border-0 bg-transparent p-0 text-xs text-gray-600 placeholder:text-gray-400 focus:outline-none focus:ring-0 sm:w-56"
                  />
                </div>
                <RemoveButton
                  label={`Remove resource ${index + 1}`}
                  onClick={() => onChange(resources.filter((_, i) => i !== index))}
                />
              </>
            ) : (
              <span className="flex min-w-0 items-baseline gap-2 text-sm text-gray-800">
                <span>{resource.label}</span>
                {resource.url && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 truncate text-xs text-accent-600 underline-offset-2 hover:underline"
                  >
                    <LinkSimple size={11} aria-hidden />
                    Open
                  </a>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <AddButton
          label={resources.length === 0 ? 'Add a resource' : 'Add another'}
          onClick={() => onChange([...resources, { label: '', url: null }])}
        />
      )}
    </section>
  )
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <Plus size={11} weight="bold" />
      {label}
    </button>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition',
        'hover:bg-gray-100 hover:text-gray-900 focus-visible:opacity-100',
      )}
    >
      <X size={11} weight="bold" />
    </button>
  )
}
