import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  DotsThree,
  FileText,
  MagnifyingGlass,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { Menu, type MenuItemSpec } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import type { CurriculumModule, CurriculumTopic } from '../curriculum.api'

/**
 * The contents of the document, and the way around it.
 *
 * ── A rail, not a table of contents inside the page ────────────────────────
 *
 * A scheme of work is read one lesson at a time and written one lesson at a
 * time, so the lesson gets the whole canvas and the structure stays beside it.
 * This is Squarespace's Course Content rail and Kajabi's outline: unit headings
 * with their lessons beneath, the open one marked, and a per-unit "add".
 *
 * ── Reordering is arrows, not drag ─────────────────────────────────────────
 *
 * Drag-and-drop here would mean a drag library and a keyboard fallback that
 * gets built and then quietly rots. Move-up and move-down are one keystroke
 * each from the keyboard, work in every screen reader, and send the same whole
 * -order request the server wants. The list is a dozen rows, not a hundred.
 *
 * ── The search box filters, it does not jump ───────────────────────────────
 *
 * Typing narrows the tree to matching lessons and the units that hold them, so
 * "photosynthesis" answers "which unit is that in?" — the question somebody
 * actually has. A jump-to-first-match would answer a different one.
 */
export function CurriculumNavigator({
  modules,
  selectedTopicId,
  onSelectTopic,
  editable,
  busy,
  onAddModule,
  onRenameModule,
  onDeleteModule,
  onMoveModule,
  onAddTopic,
  onDeleteTopic,
  onMoveTopic,
}: {
  modules: CurriculumModule[]
  selectedTopicId: string | null
  onSelectTopic: (topic: CurriculumTopic, module: CurriculumModule) => void
  editable: boolean
  busy: boolean
  onAddModule: () => void
  onRenameModule: (module: CurriculumModule) => void
  onDeleteModule: (module: CurriculumModule) => void
  onMoveModule: (module: CurriculumModule, direction: -1 | 1) => void
  onAddTopic: (module: CurriculumModule) => void
  onDeleteTopic: (topic: CurriculumTopic, module: CurriculumModule) => void
  onMoveTopic: (topic: CurriculumTopic, module: CurriculumModule, direction: -1 | 1) => void
}) {
  const [term, setTerm] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return modules

    return modules
      .map((unit) => {
        const unitMatches = unit.title.toLowerCase().includes(needle)
        const topics = (unit.topics ?? []).filter((topic) =>
          topic.title.toLowerCase().includes(needle),
        )

        /* A unit whose own title matches keeps all its lessons — the reader
         * asked for the unit, not for a subset of it. */
        return unitMatches ? unit : { ...unit, topics }
      })
      .filter((unit) => unit.title.toLowerCase().includes(needle) || (unit.topics ?? []).length > 0)
  }, [modules, term])

  const lessonCount = modules.reduce((total, unit) => total + (unit.topics?.length ?? 0), 0)

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <nav aria-label="Curriculum contents" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 px-3 py-2.5">
        <label className="relative block">
          <span className="sr-only">Find a unit or lesson</span>
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
            aria-hidden
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Find a unit or lesson"
            className="h-8 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
          />
        </label>
        <p className="mt-2 text-2xs text-gray-500">
          {modules.length} unit{modules.length === 1 ? '' : 's'} · {lessonCount} lesson
          {lessonCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-gray-500">
            {term ? `Nothing matches “${term}”.` : 'No units yet.'}
          </p>
        )}

        {filtered.map((unit, unitIndex) => {
          const isCollapsed = collapsed.has(unit.id) && !term
          const topics = unit.topics ?? []

          return (
            <div key={unit.id} className="mb-1">
              <div className="group flex items-center gap-0.5 rounded-md px-1 py-1 hover:bg-gray-100">
                <button
                  type="button"
                  onClick={() => toggle(unit.id)}
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                >
                  {isCollapsed ? (
                    <CaretRight size={12} className="shrink-0 text-gray-500" aria-hidden />
                  ) : (
                    <CaretDown size={12} className="shrink-0 text-gray-500" aria-hidden />
                  )}
                  <span className="truncate text-2xs font-semibold uppercase tracking-wide text-gray-700">
                    {unit.title}
                  </span>
                </button>

                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => onAddTopic(unit)}
                      disabled={busy}
                      title={`Add a lesson to ${unit.title}`}
                      aria-label={`Add a lesson to ${unit.title}`}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 opacity-0 transition hover:bg-gray-200 hover:text-gray-900 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                    >
                      <Plus size={12} weight="bold" />
                    </button>

                    <Menu
                      items={unitMenu(unit, unitIndex)}
                      trigger={({ toggle: open, ref }) => (
                        <button
                          ref={ref as never}
                          type="button"
                          onClick={open}
                          aria-label={`Actions for ${unit.title}`}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 opacity-0 transition hover:bg-gray-200 hover:text-gray-900 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <DotsThree size={14} weight="bold" />
                        </button>
                      )}
                    />
                  </>
                )}
              </div>

              {!isCollapsed && (
                <ul className="ml-2 border-l border-gray-200 pl-1">
                  {topics.length === 0 && (
                    <li className="px-2 py-1.5 text-2xs text-gray-500">
                      {editable ? 'No lessons — add one above.' : 'No lessons.'}
                    </li>
                  )}

                  {topics.map((topic, topicIndex) => (
                    <li key={topic.id} className="group/topic flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onSelectTopic(topic, unit)}
                        aria-current={topic.id === selectedTopicId ? 'true' : undefined}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          topic.id === selectedTopicId
                            ? 'bg-rail-active font-medium text-gray-900'
                            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                        )}
                      >
                        <FileText
                          size={12}
                          className={cn(
                            'shrink-0',
                            /* Written-up lessons are marked. Somebody working
                             * through a term is looking for the ones that are
                             * not. */
                            topic.has_notes ? 'text-accent-600' : 'text-gray-400',
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{topic.title}</span>
                      </button>

                      {editable && (
                        <Menu
                          items={topicMenu(topic, unit, topicIndex, topics.length)}
                          trigger={({ toggle: open, ref }) => (
                            <button
                              ref={ref as never}
                              type="button"
                              onClick={open}
                              aria-label={`Actions for ${topic.title}`}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 opacity-0 transition hover:bg-gray-200 hover:text-gray-900 focus-visible:opacity-100 group-hover/topic:opacity-100"
                            >
                              <DotsThree size={14} weight="bold" />
                            </button>
                          )}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {editable && (
        <div className="border-t border-gray-200 p-2">
          <button
            type="button"
            onClick={onAddModule}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus size={13} weight="bold" />
            Add a unit
          </button>
        </div>
      )}
    </nav>
  )

  function unitMenu(unit: CurriculumModule, index: number): MenuItemSpec[] {
    const items: MenuItemSpec[] = [
      { key: 'rename', label: 'Rename', onSelect: () => onRenameModule(unit) },
      { key: 'add', label: 'Add a lesson', icon: <Plus size={15} />, onSelect: () => onAddTopic(unit) },
    ]

    if (index > 0) {
      items.push({
        key: 'up',
        label: 'Move up',
        icon: <ArrowUp size={15} />,
        separated: true,
        disabled: busy,
        onSelect: () => onMoveModule(unit, -1),
      })
    }

    if (index < modules.length - 1) {
      items.push({
        key: 'down',
        label: 'Move down',
        icon: <ArrowDown size={15} />,
        separated: index === 0,
        disabled: busy,
        onSelect: () => onMoveModule(unit, 1),
      })
    }

    items.push({
      key: 'delete',
      label: 'Delete unit',
      icon: <Trash size={15} />,
      destructive: true,
      disabled: busy,
      onSelect: () => onDeleteModule(unit),
    })

    return items
  }

  function topicMenu(
    topic: CurriculumTopic,
    unit: CurriculumModule,
    index: number,
    total: number,
  ): MenuItemSpec[] {
    const items: MenuItemSpec[] = []

    if (index > 0) {
      items.push({
        key: 'up',
        label: 'Move up',
        icon: <ArrowUp size={15} />,
        disabled: busy,
        onSelect: () => onMoveTopic(topic, unit, -1),
      })
    }

    if (index < total - 1) {
      items.push({
        key: 'down',
        label: 'Move down',
        icon: <ArrowDown size={15} />,
        disabled: busy,
        onSelect: () => onMoveTopic(topic, unit, 1),
      })
    }

    items.push({
      key: 'delete',
      label: 'Delete lesson',
      icon: <Trash size={15} />,
      destructive: true,
      disabled: busy,
      onSelect: () => onDeleteTopic(topic, unit),
    })

    return items
  }
}
