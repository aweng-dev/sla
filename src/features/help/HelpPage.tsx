import type { ReactNode } from 'react'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Card, CardBody, CardHeader, PageHeader } from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import type { Terminology, TerminologyKey } from '@/shared/types/tenant.types'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'

/**
 * The screen a new administrator reads once.
 *
 * ── No API, and no invented facts ──────────────────────────────────────────
 *
 * There is no help endpoint, so everything on this page is either a statement
 * about how the platform is built — verifiable in the code around it — or a
 * value read live from `GET /context` and `GET /portal/context`. There is no
 * support address, no telephone number and no response-time promise here,
 * because this build knows none of those and a made-up one is worse than an
 * absent one: somebody would try it.
 *
 * ── The vocabulary table is the reason this page earns its place ───────────
 *
 * Every institution renames the product's concepts, and the rest of the app
 * quietly obeys — a school's "Class" is a university's "Cohort". Somebody
 * arriving at a screen that says "Arms" has nowhere to look it up. This is that
 * place, and it is rendered from the live terminology map rather than a list
 * written here, so an institution that renames something tomorrow sees the new
 * word on this page without a deploy.
 *
 * ── Why it is one narrow column of key/value rows ──────────────────────────
 *
 * This is a document, and it is drawn the way the product draws Settings: one
 * reading column of hairlined panels, each a semibold heading, a grey line of
 * description, and content. Prose set across the full canvas is unreadable at
 * 13px, a two-column grid made the two halves compete, and the vocabulary was
 * a data table — which put a header band and sort affordances on twenty static
 * definitions. Rows of label-and-value carry it without any of that.
 */
export function HelpPage() {
  const { tenant, branding, access, portal } = useTenant()
  const t = useTerminology()

  const institution = access?.institution ?? null
  const calendar = access?.calendar ?? null

  return (
    <PageStack>
      {/* A title alone. The sentence here was a table of contents for the six
          cards below, every one of which already carries its own heading and
          its own grey line — so it said each thing twice, a screen apart. */}
      <PageHeader title="Help" />

      <div className="flex w-full max-w-3xl flex-col gap-5">
        <Card>
          <CardHeader
            title="What SchoolLink is"
            subtitle="One system for the records an institution keeps about the people in it."
          />
          <CardBody className="space-y-3 text-sm text-gray-600">
            <p>
              SchoolLink holds the roll, the timetable, attendance, assessment, fees and the
              correspondence that goes with them, for one institution at a time. What you can see is
              decided by the institution and by your role in it: the rail on the left lists only the
              modules {tenant.name} runs and you hold, so two people signed in here rarely see the
              same set of screens.
            </p>
            <p>
              Screens are scoped to the {t('session').toLowerCase()} and{' '}
              {t('period').toLowerCase()} named at the top of the window. A roll, a{' '}
              {t('register').toLowerCase()} and a fee run all mean something different in a
              different one, which is why it is always on screen rather than buried in a filter.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="This institution"
            subtitle="Read live from the platform, not configured in this app."
          />
          <CardBody className="py-1">
            <dl>
              <Row label="Institution" value={branding.institution_name || tenant.name} />
              <Row
                label="Kind"
                value={
                  institution
                    ? [institution.label, institution.subtype_label].filter(Boolean).join(' · ')
                    : null
                }
              />
              <Row label="You are signed in as" value={PORTAL_LABELS[portal] ?? humanize(portal)} />
              <Row label={`Current ${t('session').toLowerCase()}`} value={calendar?.session?.name} />
              <Row label={`Current ${t('period').toLowerCase()}`} value={calendar?.period?.name} />
              <Row
                label={`Kind of ${t('period').toLowerCase()}`}
                value={institution ? humanize(institution.period_label) : null}
              />
              <Row label={t('register')} value={institution?.attendance_mode_label} />
              <Row label="Assessment" value={institution?.assessment_model_label} />
              <Row label={t('progression')} value={institution?.progression_model_label} />
              <Row label="Time zone" value={tenant.default_timezone} />
              <Row label="Address" value={tenant.platform_domain} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Accounts and who creates them"
            subtitle="There is no sign-up here, and that is deliberate."
          />
          <CardBody className="space-y-3 text-sm text-gray-600">
            <p>
              An institution exists on this platform because a{' '}
              <strong className="font-medium text-gray-900">platform administrator</strong>{' '}
              provisioned it and gave it an address — {tenant.platform_domain} for this one. Nobody
              signs an institution up from the outside, and there is no self-serve registration to
              look for.
            </p>
            <p>
              People are then added from the inside: an administrator at {tenant.name} creates the
              accounts for staff, {t('learners').toLowerCase()} and {t('guardians').toLowerCase()}{' '}
              and grants what each of them may reach. If you need an account, a permission or a
              correction, that administrator is who to ask — not this screen.
            </p>
            <p>
              Signing in accepts an email address <em>or</em> a {t('learner').toLowerCase()},
              admission or staff number, because a family given a card with a number on it may have
              no address on file.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="When something goes wrong" />
          <CardBody className="space-y-3 text-sm text-gray-600">
            <p>
              Every failure on these screens prints a{' '}
              <strong className="font-medium text-gray-900">reference</strong> underneath the
              message. Quote it when you report the problem — it is the one thing that lets somebody
              find your exact request in the logs, and without it a report is a description of a
              symptom.
            </p>
            <p>
              A screen that says you do not have access is not broken. Permission is re-checked by
              the server on every request, so what you may reach is a decision made at {tenant.name}{' '}
              and changed there.
            </p>
            {branding.institution_url && (
              <p>
                <a
                  href={branding.institution_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-accent-500 underline-offset-2 hover:underline"
                >
                  {branding.institution_name || tenant.name}
                  <ArrowSquareOut size={13} aria-hidden />
                </a>
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={`The words ${tenant.name} uses`}
            subtitle="Set per institution. Every screen in this app follows this list, so it is worth a look before you go hunting for a menu item under the wrong name."
          />
          <CardBody className="py-1">
            <Vocabulary terminology={tenant.terminology} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Keyboard"
            subtitle="These work on the Search screen. Everything else is reached with Tab and Enter, in the order it is drawn."
          />
          <CardBody className="py-1">
            <dl>
              <Row
                label={<Keys keys={['↑', '↓']} />}
                value="Move through search results, from the field into the list and back"
              />
              <Row label={<Keys keys={['Enter']} />} value="Open the search result you are on" />
              <Row label={<Keys keys={['Esc']} />} value="Clear the search field and its filters" />
            </dl>
          </CardBody>
        </Card>
      </div>
    </PageStack>
  )
}

const PORTAL_LABELS: Record<string, string> = {
  admin: 'An administrator',
  staff: 'A member of staff',
  teacher: 'A teacher',
  student: 'A student',
  guardian: 'A guardian',
}

/**
 * One label and one value, on one line.
 *
 * The label is a caption — medium, grey, in a fixed left column — and the
 * value is the thing to read, in regular ink. Ranging them apart across the
 * full width of the canvas, which is what `justify-between` did, left a hand's
 * width of empty paper between a word and its answer and made eleven facts
 * unscannable.
 */
function Row({ label, value }: { label: ReactNode; value?: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b border-gray-200 py-2 last:border-0 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className="min-w-0 text-sm text-gray-900">
        {value || <span className="text-gray-500">Not set</span>}
      </dd>
    </div>
  )
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-sans text-2xs text-gray-800"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}

/* ── The vocabulary ──────────────────────────────────────────────────────── */

interface VocabularyRow {
  key: string
  word: string
  plural: string | null
  meaning: string
}

/**
 * The plural key that belongs with each singular one.
 *
 * Explicit rather than derived, because "campuses" is not "campus" + "s" and a
 * rule that guesses would drop a row the first time it was wrong. A key that
 * appears in neither column of this map simply gets its own row, so a concept
 * added to the terminology map tomorrow still appears.
 */
const PLURAL_OF: Record<string, string> = {
  learner: 'learners',
  guardian: 'guardians',
  teacher: 'teachers',
  group: 'groups',
  course: 'courses',
  programme: 'programmes',
  session: 'sessions',
  period: 'periods',
  level: 'levels',
  assessment: 'assessments',
  section: 'sections',
  campus: 'campuses',
}

/**
 * What each concept IS, in words that do not depend on the institution's own.
 *
 * This is the only hand-written half of the table and it has to be: the API
 * sends the institution's word for a concept, not an explanation of it. A key
 * with no entry here still gets a row — the concept falls back to the key's own
 * name — which is what keeps the table honest as the map grows.
 */
const MEANINGS: Partial<Record<TerminologyKey, string>> = {
  learner: 'A person enrolled to study at this institution.',
  guardian: 'An adult responsible for a learner — a parent, or somebody standing in for one.',
  teacher: 'A member of staff who teaches.',
  group: 'A set of learners taught together and registered together.',
  course: 'A subject of study, taught over a session or part of one.',
  programme: 'A named route through the curriculum that learners are admitted onto.',
  session: 'The full academic year: everything between one intake and the next.',
  period: 'A division of the session. Marks, fees and registers are reported against one.',
  level: 'A stage of study learners move up through.',
  assessment: 'A piece of assessed work, a test or an exam that carries a mark.',
  enrolment: "A learner's registration onto a session, a programme or a course.",
  section: 'A subdivision of a level, where one level is too large for a single group.',
  campus: 'A physical site the institution operates from.',
  classTeacher: 'The member of staff answerable for a group and its register.',
  courseTeacher: 'The member of staff who teaches a course to a group.',
  progression: 'Moving a learner up at the end of a session.',
  progressed: 'Said of a learner who has moved up.',
  retained: 'Said of a learner who is repeating a level rather than moving up.',
  register: 'The record of who was present, taken on the institution’s own schedule.',
  certificate: 'A document the institution issues for completed study.',
}

function Vocabulary({ terminology }: { terminology: Terminology }) {
  const entries = Object.entries(terminology) as [TerminologyKey, string][]
  const plurals = new Set(Object.values(PLURAL_OF))

  const rows: VocabularyRow[] = entries
    /* Plurals are folded into their singular's row rather than doubling the
     * list; a key that is nobody's plural keeps its own. */
    .filter(([key]) => !plurals.has(key))
    .map(([key, word]) => {
      const pluralKey = PLURAL_OF[key]
      const plural = pluralKey ? (terminology[pluralKey as TerminologyKey] ?? null) : null

      return {
        key,
        word,
        plural: plural && plural !== word ? plural : null,
        meaning: MEANINGS[key] ?? humanize(key),
      }
    })

  return (
    <dl>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-x-6 gap-y-0.5 border-b border-gray-200 py-2 last:border-0 sm:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <dt className="text-sm font-medium text-gray-900">
            {row.word}
            {row.plural && <span className="text-gray-500"> · {row.plural}</span>}
          </dt>
          <dd className="min-w-0 text-sm text-gray-600">{row.meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
