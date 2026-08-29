import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  ChalkboardTeacher,
  Gear,
  Info,
  ListChecks,
  Stack,
  UsersThree,
} from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Card,
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  panelId,
  type TabItem,
} from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { useModules, usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { useSubjectWorkspace } from './useSubjectWorkspace'
import { SubjectContextBar } from './components/SubjectContextBar'
import { SubjectOverview } from './components/SubjectOverview'
import { SubjectClasses } from './components/SubjectClasses'
import { SubjectCurriculum } from './components/SubjectCurriculum'
import { SubjectTeachers } from './components/SubjectTeachers'
import { SubjectResources } from './components/SubjectResources'
import { SubjectSettings } from './components/SubjectSettings'

/**
 * One subject, and everything an institution decides about it.
 *
 * ── The tab order is the order the decisions are made ──────────────────────
 *
 * What the subject IS (overview) → who is taught it (classes) → what they are
 * taught (curriculum) → who teaches it (teachers) → what they teach from
 * (resources) → the record itself (settings). A head of department arriving
 * mid-term lands on the overview and goes straight to curriculum; a registrar
 * setting up in September works left to right.
 *
 * ── Curriculum is per CLASS, and this page is where that becomes visible ───
 *
 * "Mathematics" has no single scheme of work. 3A and 3C are taught the same
 * subject at different paces, and the whole point of this screen is that both
 * are on it at once: the Classes tab is every class taking the subject with
 * what each one has, and the Curriculum tab is the documents themselves.
 * Nothing here writes a curriculum against the subject, because there is no
 * such record — see `curriculum.api.ts`.
 *
 * ── Session and term sit above the tabs, not inside one ────────────────────
 *
 * They change what "the classes taking this subject" means, and a reader who
 * sets them on the Classes tab and then opens Curriculum has not changed the
 * question they are asking. So the control belongs to the page. It defaults to
 * the institution's current session and term, which is the answer nine readers
 * in ten want without touching it.
 */

const TABS_ID = 'subject-tabs'

type TabKey = 'overview' | 'classes' | 'curriculum' | 'teachers' | 'resources' | 'settings'

export function SubjectWorkspacePage() {
  const { courseId } = useParams({ from: '/app/courses/$courseId' })
  const t = useTerminology()
  const perms = usePermissions()
  const modules = useModules()
  const { access } = useTenant()

  const [tab, setTab] = useState<TabKey>('overview')

  /* The institution's own answer to "when is it now". A reader who wants a
   * different term says so; nobody has to say so to see this one. */
  const [sessionId, setSessionId] = useState(access?.calendar?.session?.id ?? '')
  const [periodId, setPeriodId] = useState(access?.calendar?.period?.id ?? '')

  const workspace = useSubjectWorkspace(courseId, {
    academic_session_id: sessionId,
    academic_period_id: periodId,
    /* Nothing asks for curricula the institution does not run: the request
     * would 403 and the classes table would show an error beside data that
     * loaded fine. */
    withCurricula: modules.has('curriculum'),
  })

  const canManage = perms.has('courses.manage')

  /*
   * Every curriculum route carries `module:curriculum`, so an institution
   * without the module answers 403 to all of them. The tab is drawn from the
   * module, the ACTIONS from the permission — a reader with `curriculum.view`
   * and no `curriculum.manage` gets the tab and reads it, which is right.
   */
  const hasCurriculum = modules.has('curriculum')
  const canWriteCurriculum = hasCurriculum && perms.has('curriculum.manage')

  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview', icon: <Info size={14} /> },
    { key: 'classes', label: t('groups'), icon: <UsersThree size={14} /> },
  ]

  if (hasCurriculum) {
    tabs.push({ key: 'curriculum', label: 'Curriculum', icon: <ListChecks size={14} /> })
  }

  tabs.push(
    { key: 'teachers', label: t('teachers'), icon: <ChalkboardTeacher size={14} /> },
    { key: 'resources', label: 'Resources', icon: <Stack size={14} /> },
  )

  /* Editing the catalogue entry is a different permission from writing a scheme
   * of work, and a reader without it should not be offered a tab that is a
   * disabled form. */
  if (canManage) tabs.push({ key: 'settings', label: 'Settings', icon: <Gear size={14} /> })

  if (workspace.subject.isError) {
    return (
      <PageStack>
        <BackLink label={t('courses')} />
        <Card>
          <ErrorState
            error={workspace.subject.error}
            onRetry={() => workspace.subject.refetch()}
          />
        </Card>
      </PageStack>
    )
  }

  if (workspace.subject.isLoading || !workspace.subject.data) {
    return (
      <PageStack>
        <BackLink label={t('courses')} />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  const subject = workspace.subject.data

  /* Said on the header because it is the fact that makes this page make sense:
   * a subject is taught to several classes, and each of them has its own. */
  const withCurriculum = workspace.classes.filter((entry) => entry.headline !== null).length

  return (
    <PageStack>
      <BackLink label={t('courses')} />

      <PageHeader
        icon={
          <EntityIcon tone="brand">
            <BookOpen />
          </EntityIcon>
        }
        title={subject.title}
        meta={
          <>
            <span className="text-gray-900">{subject.code}</span>
            {subject.course_type && (
              <>
                <MetaDot />
                <span>{humanize(subject.course_type)}</span>
              </>
            )}
            <MetaDot />
            <span>
              {workspace.classes.length} {workspace.classes.length === 1 ? t('group').toLowerCase() : t('groups').toLowerCase()}
            </span>
            <MetaDot />
            <span className={withCurriculum === 0 ? 'text-gray-500' : undefined}>
              {withCurriculum} with a curriculum
            </span>
            <MetaDot />
            <StatusBadge status={subject.status} />
          </>
        }
        tabs={
          <Tabs
            bare
            items={tabs}
            value={tab}
            onChange={(key) => setTab(key as TabKey)}
            baseId={TABS_ID}
          />
        }
      />

      {/* Settings edits the catalogue entry, which is the same in every term.
        * Showing a term filter above it would suggest otherwise. */}
      {tab !== 'settings' && tab !== 'resources' && (
        <SubjectContextBar
          sessionId={sessionId}
          periodId={periodId}
          onSessionChange={setSessionId}
          onPeriodChange={setPeriodId}
        />
      )}

      <Panel id="overview" tab={tab}>
        <SubjectOverview
          subject={subject}
          classes={workspace.classes}
          loading={workspace.offerings.isLoading || workspace.curricula.isLoading}
          onOpenClasses={() => setTab('classes')}
          onOpenCurriculum={() => setTab('curriculum')}
        />
      </Panel>

      <Panel id="classes" tab={tab}>
        <SubjectClasses
          subject={subject}
          hasCurriculum={hasCurriculum}
          classes={workspace.classes}
          loading={workspace.offerings.isLoading || workspace.curricula.isLoading}
          error={workspace.offerings.error ?? workspace.curricula.error}
          onRetry={() => {
            void workspace.offerings.refetch()
            void workspace.curricula.refetch()
          }}
          canWriteCurriculum={canWriteCurriculum}
          sessionId={sessionId}
          periodId={periodId}
        />
      </Panel>

      <Panel id="curriculum" tab={hasCurriculum ? tab : 'overview'}>
        <SubjectCurriculum
          subject={subject}
          classes={workspace.classes}
          documents={workspace.documents}
          loading={workspace.curricula.isLoading}
          error={workspace.curricula.error}
          onRetry={() => void workspace.curricula.refetch()}
          canWriteCurriculum={canWriteCurriculum}
        />
      </Panel>

      <Panel id="teachers" tab={tab}>
        <SubjectTeachers classes={workspace.classes} loading={workspace.offerings.isLoading} />
      </Panel>

      <Panel id="resources" tab={tab}>
        <SubjectResources courseId={courseId} subjectTitle={subject.title} />
      </Panel>

      {canManage && (
        <Panel id="settings" tab={tab}>
          <SubjectSettings subject={subject} />
        </Panel>
      )}
    </PageStack>
  )
}

function Panel({ id, tab, children }: { id: TabKey; tab: TabKey; children: React.ReactNode }) {
  if (tab !== id) return null

  return (
    <div role="tabpanel" id={panelId(TABS_ID, id)} aria-labelledby={`${TABS_ID}-tab-${id}`}>
      {children}
    </div>
  )
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/courses"
      className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={13} />
      All {label.toLowerCase()}
    </Link>
  )
}
