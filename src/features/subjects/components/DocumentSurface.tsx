import { useEffect, useRef, useState } from 'react'
import { BlockNoteViewRaw, useCreateBlockNote } from '@blocknote/react'
import type { Block, BlockNoteEditor, PartialBlock } from '@blocknote/core'
import {
  Code,
  ListBullets,
  ListChecks,
  ListNumbers,
  Quotes,
  Table,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  LinkSimple,
} from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
/* The editor's own structural CSS. The typeface is NOT imported with it —
 * `@blocknote/core/fonts/inter.css` would pull a second font family in beside
 * the app's, and the override sheet below hands the editor ours instead. */
import '@blocknote/core/style.css'
import './document-surface.css'

/**
 * The page somebody writes a lesson on.
 *
 * ── BlockNote, because the API already stores BlockNote ────────────────────
 *
 * `curriculum_topics.notes` is a BlockNote document and has been since before
 * this screen existed — `CurriculumTopicResource` says so in as many words.
 * The array is read and written unchanged: no HTML anywhere, no conversion on
 * either side, and a read-only viewer renders the same array. Choosing a
 * different editor would have meant a lossy translation at every save.
 *
 * ── Our own toolbar, and no UI framework with it ───────────────────────────
 *
 * BlockNote's floating toolbars, slash menu and side menu come from a
 * components adapter — `@blocknote/mantine`, `@blocknote/ariakit` or
 * `@blocknote/shadcn` — each of which is a second UI library beside the one
 * this app has. `BlockNoteViewRaw` reads that adapter from context and, with no
 * provider, disables every default control by design. So the dependency is the
 * editor core only, and the toolbar below is built from our own buttons.
 *
 * What is kept from the core is everything structural: the block model, undo,
 * paste handling, and the markdown input rules a writer expects — `#` for a
 * heading, `-` for a bullet, `1.` for a number.
 *
 * ── The toolbar carries exactly what a scheme of work needs ────────────────
 *
 * Headings, the three list kinds, a quote, a table, a link, code. Not a font
 * picker or a colour palette: this is a curriculum document, and the formatting
 * a school actually uses in one is a short list.
 */

type Editor = BlockNoteEditor<any, any, any>

export function DocumentSurface({
  /** Changing this rebuilds the editor. It must be the LESSON id: one editor
   *  instance holding two lessons in turn is how content ends up saved under
   *  the wrong one. */
  documentKey,
  initialContent,
  editable,
  onChange,
  placeholder,
}: {
  documentKey: string
  initialContent: unknown[] | null | undefined
  editable: boolean
  onChange: (blocks: Block<any, any, any>[]) => void
  placeholder?: string
}) {
  return (
    <Surface
      key={documentKey}
      initialContent={initialContent}
      editable={editable}
      onChange={onChange}
      placeholder={placeholder}
    />
  )
}

function Surface({
  initialContent,
  editable,
  onChange,
  placeholder,
}: {
  initialContent: unknown[] | null | undefined
  editable: boolean
  onChange: (blocks: Block<any, any, any>[]) => void
  placeholder?: string
}) {
  /* An empty array is not valid initial content — BlockNote wants at least one
   * block — and `undefined` means "start with an empty paragraph", which is
   * what a lesson nobody has written yet should open as. */
  const editor = useCreateBlockNote({
    initialContent:
      Array.isArray(initialContent) && initialContent.length > 0
        ? (initialContent as PartialBlock[])
        : undefined,
  })

  /* `onChange` is an inline arrow upstream; the ref keeps the subscription
   * from being torn down and rebuilt on every keystroke. */
  const handler = useRef(onChange)
  handler.current = onChange

  /*
   * The first emission, when it says nothing changed, is dropped.
   *
   * Opening a lesson must not mark it unsaved. BlockNote normalises a document
   * as it loads it — filling in ids, defaulting props — and the change that
   * results is the editor's, not the reader's. Passing it on would put "Saving…"
   * in the header the instant somebody clicked a lesson, and would write every
   * lesson they merely looked at.
   *
   * Compared once, on the first emission only, so this costs one serialisation
   * per lesson opened rather than one per keystroke.
   */
  const settled = useRef(false)
  const openedWith = useRef(JSON.stringify(initialContent ?? []))

  return (
    <div className="flex min-h-0 flex-col">
      {editable && <FormatBar editor={editor} />}

      <div className={cn('curriculum-surface min-w-0 flex-1', !editable && 'is-readonly')}>
        <BlockNoteViewRaw
          editor={editor}
          editable={editable}
          theme="light"
          onChange={() => {
            const next = editor.document

            if (!settled.current) {
              settled.current = true

              /* Normalisation only. Nothing the reader did. */
              if (JSON.stringify(next) === openedWith.current) return
            }

            handler.current(next)
          }}
        />
      </div>

      {placeholder && editable && (
        <p className="px-1 pt-2 text-2xs text-gray-500">{placeholder}</p>
      )}
    </div>
  )
}

/* ── The toolbar ─────────────────────────────────────────────────────────── */

type BlockKind =
  | { type: 'paragraph' }
  | { type: 'heading'; level: 1 | 2 | 3 }
  | { type: 'bulletListItem' }
  | { type: 'numberedListItem' }
  | { type: 'checkListItem' }
  | { type: 'quote' }
  | { type: 'codeBlock' }

function FormatBar({ editor }: { editor: Editor }) {
  /* Redrawn on selection AND on content change: typing `##` turns a paragraph
   * into a heading without moving the cursor, and a toolbar that only watched
   * the selection would keep showing "paragraph" pressed. */
  const [, force] = useState(0)

  useEffect(() => {
    const bump = () => force((n) => n + 1)
    const offSelection = editor.onSelectionChange(bump)
    const offChange = editor.onChange(bump)

    return () => {
      offSelection?.()
      offChange?.()
    }
  }, [editor])

  const styles = safeStyles(editor)
  const block = safeBlock(editor)

  function setBlock(kind: BlockKind) {
    const current = safeBlock(editor)
    if (!current) return

    /* Pressing the button a block already is turns it back into a paragraph,
     * which is how every editor behaves and how somebody un-does a heading
     * without reaching for undo. */
    const same =
      current.type === kind.type &&
      (kind.type !== 'heading' || (current.props as { level?: number })?.level === kind.level)

    editor.updateBlock(
      current,
      same
        ? { type: 'paragraph' }
        : kind.type === 'heading'
          ? { type: 'heading', props: { level: kind.level } }
          : { type: kind.type },
    )

    editor.focus()
  }

  function isBlock(kind: BlockKind): boolean {
    if (!block || block.type !== kind.type) return false
    if (kind.type !== 'heading') return true

    return (block.props as { level?: number })?.level === kind.level
  }

  function insertTable() {
    const current = safeBlock(editor)
    if (!current) return

    editor.insertBlocks(
      [
        {
          type: 'table',
          content: {
            type: 'tableContent',
            /* A header row, because a table in a scheme of work is nearly
               always "week / topic / activity" and typing the headings into a
               row that does not read as headings is a thing somebody then has
               to undo. */
            headerRows: 1,
            rows: [
              { cells: ['', '', ''] },
              { cells: ['', '', ''] },
              { cells: ['', '', ''] },
            ],
          },
        } as PartialBlock,
      ],
      current,
      'after',
    )

    editor.focus()
  }

  function addLink() {
    const url = window.prompt('Link to')
    if (!url) return

    editor.createLink(url.trim())
    editor.focus()
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-white/95 px-2 py-1.5 backdrop-blur">
      <Tool label="Bold" active={styles.bold} onClick={() => editor.toggleStyles({ bold: true })}>
        <TextB size={15} weight="bold" />
      </Tool>
      <Tool
        label="Italic"
        active={styles.italic}
        onClick={() => editor.toggleStyles({ italic: true })}
      >
        <TextItalic size={15} />
      </Tool>
      <Tool
        label="Underline"
        active={styles.underline}
        onClick={() => editor.toggleStyles({ underline: true })}
      >
        <TextUnderline size={15} />
      </Tool>
      <Tool
        label="Strikethrough"
        active={styles.strike}
        onClick={() => editor.toggleStyles({ strike: true })}
      >
        <TextStrikethrough size={15} />
      </Tool>

      <Divider />

      <Tool
        label="Heading"
        active={isBlock({ type: 'heading', level: 1 })}
        onClick={() => setBlock({ type: 'heading', level: 1 })}
      >
        <TextHOne size={15} />
      </Tool>
      <Tool
        label="Subheading"
        active={isBlock({ type: 'heading', level: 2 })}
        onClick={() => setBlock({ type: 'heading', level: 2 })}
      >
        <TextHTwo size={15} />
      </Tool>
      <Tool
        label="Small heading"
        active={isBlock({ type: 'heading', level: 3 })}
        onClick={() => setBlock({ type: 'heading', level: 3 })}
      >
        <TextHThree size={15} />
      </Tool>

      <Divider />

      <Tool
        label="Bulleted list"
        active={isBlock({ type: 'bulletListItem' })}
        onClick={() => setBlock({ type: 'bulletListItem' })}
      >
        <ListBullets size={15} />
      </Tool>
      <Tool
        label="Numbered list"
        active={isBlock({ type: 'numberedListItem' })}
        onClick={() => setBlock({ type: 'numberedListItem' })}
      >
        <ListNumbers size={15} />
      </Tool>
      <Tool
        label="Checklist"
        active={isBlock({ type: 'checkListItem' })}
        onClick={() => setBlock({ type: 'checkListItem' })}
      >
        <ListChecks size={15} />
      </Tool>

      <Divider />

      <Tool
        label="Quote"
        active={isBlock({ type: 'quote' })}
        onClick={() => setBlock({ type: 'quote' })}
      >
        <Quotes size={15} />
      </Tool>
      <Tool
        label="Code"
        active={isBlock({ type: 'codeBlock' })}
        onClick={() => setBlock({ type: 'codeBlock' })}
      >
        <Code size={15} />
      </Tool>
      <Tool label="Table" onClick={insertTable}>
        <Table size={15} />
      </Tool>
      <Tool label="Link" onClick={addLink}>
        <LinkSimple size={15} />
      </Tool>
    </div>
  )
}

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      /* Mouse-down rather than click: a click steals focus from the editor
       * first, and a toggle applied to a collapsed selection does nothing. */
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
}

/** The four marks this toolbar can toggle. The schema carries more; these are
 *  the ones a scheme of work uses. */
interface ActiveStyles {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

/* The editor throws if asked about a selection it does not have yet — the
 * first render before the view is mounted. Both of these are read during
 * render, so both have to tolerate it. */
function safeStyles(editor: Editor): ActiveStyles {
  try {
    return editor.getActiveStyles() as ActiveStyles
  } catch {
    return {}
  }
}

function safeBlock(editor: Editor): Block<any, any, any> | null {
  try {
    return editor.getTextCursorPosition().block
  } catch {
    return null
  }
}
