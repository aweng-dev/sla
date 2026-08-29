import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BookOpen,
  CalendarBlank,
  ClipboardText,
  GraduationCap,
  PencilSimple,
  UsersThree,
} from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Button,
  Card,
  DetailPanel,
  DetailRow,
  DetailSection,
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
import { cn } from '@/shared/lib/cn'
import { formatNumber, humanize } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { classroomApi, classroomKeys } from './classroom.api'
import { ClassAttendance } from './components/ClassAttendance'
import { ClassGradebooks } from './components/ClassGradebooks'
import { ClassRoster } from './components/ClassRoster'
import { ClassSubjects } from './components/ClassSubjects'
import { ClassTimetable } from './components/ClassTimetable'
import { SetClassTeacherDialog } from './components/SetClassTeacherDialog'

/**
 * One class, and everything that happens to it.
 *
 * ── Five tabs, in the order a class is set up and then run ─────────────────
 *
 * Roll → subjects → timetable → attendance → marks. That is the sequence: you
 * cannot register a class for a subject before it has anybody on it, and a mark
 * book exists only once a subject does. A reader arriving mid-term lands on the
 * roll, which is what they came for; a registrar setting up in September works
 * left to right.
 *
 * ── The register lives on the roll, not on the attendance tab ──────────────
 *
 * Taking a register and reading the attendance sheet are different jobs done by
 * different people at different times. Marking happens with the class in front
 * of you and belongs where the names are; the sheet is read later by somebody
 * looking for a pattern. Putting the marking control on the sheet would put it
 * two clicks from the names it is about.
 *
 * ── The class teacher is on the header, because it is an access decision ───
 *
 * `form_tutor_staff_id` grants reach over the class — its roll, its registers,
 * its marks. It is not a label, so it sits with the identity of the class
 * rather than in a settings tab somebody has to go looking for.
 */

const TABS_ID = 'class-tabs'

type TabKey = 'roll' | 'subjects' | 'timetable' | 'attendance' | 'marks'

export function ClassDetailPage() {
  const { groupId } = useParams({ from: '/app/learning-groups/$groupId' })
  const t = useTerminology()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<TabKey>('roll')
  const [settingTeacher, setSettingTeacher] = useState(false)

  const canManage = permissions.has('learning_groups.manage')
  const canTakeRegister = permissions.hasAny('attendance.manage', 'attendance.take')

  const group = useQuery({
    queryKey: classroomKeys.detail(groupId),
    queryFn: () => classroomApi.detail(groupId),
  })

  /* Icons on the strip, as Sprig's study tabs carry them: at this size a
   * glyph is read before the word, and five bare words look like a paragraph. */
  const tabs: TabItem[] = [
    { key: 'roll', label: t('learners'), icon: <UsersThree size={14} /> },
    { key: 'subjects', label: t('courses'), icon: <BookOpen size={14} /> },
    { key: 'timetable', label: 'Timetable', icon: <CalendarBlank size={14} /> },
    { key: 'attendance', label: 'Attendance', icon: <ClipboardText size={14} /> },
    { key: 'marks', label: 'Marks', icon: <GraduationCap size={14} /> },
  ]

  if (group.isError) {
    return (
      <PageStack>
        <BackLink label={t('groups')} />
        <Card>
          <ErrorState error={group.error} onRetry={() => group.refetch()} />
        </Card>
      </PageStack>
    )
  }

  if (group.isLoading || !group.data) {
    return (
      <PageStack>
        <BackLink label={t('groups')} />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  const data = group.data

  return (
    <PageStack>
      <BackLink label={t('groups')} />

      <PageHeader
        /* Sprig's detail header: a tinted entity square, a 20px title, and one
         * muted line of context. Not the 24px list title this used before —
         * an entity screen and an index are different sizes in Sprig, and
         * using the wrong one is why the page read as a list of a class rather
         * than as the class. */
        icon={
          <EntityIcon tone="brand">
            <UsersThree />
          </EntityIcon>
        }
        title={data.name}
        meta={
          <>
            <span className="text-gray-900">{data.code}</span>
            {data.academic_level_name && (
              <>
                <MetaDot />
                <span>{data.academic_level_name}</span>
              </>
            )}
            {data.academic_session_name && (
              <>
                <MetaDot />
                <span>{data.academic_session_name}</span>
              </>
            )}
            <MetaDot />
            <span className={cn(data.capacity !== null && !data.has_space && 'text-danger-600')}>
              {formatNumber(data.occupancy)}
              {data.capacity !== null && ` of ${formatNumber(data.capacity)}`}
              {data.capacity !== null && !data.has_space && ' — full'}
            </span>
          </>
        }
        actions={
          canTakeRegister ? (
            /* The verb somebody opens this page to do. Sprig keeps one clear
             * action in the header; the rest live where they apply. */
            <Button variant="primary" icon={<ClipboardText size={15} />} onClick={() => setTab('roll')}>
              Take register
            </Button>
          ) : undefined
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

      {/*
        * Work on the left, identity on the right — Sprig's study page exactly.
        * The facts that say WHICH class this is were crammed into the header
        * before, which pushed the roll below the fold and turned the header
        * into a wall of grey text. They belong beside the work, where they can
        * be checked without leaving it.
        */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <Panel id="roll" tab={tab}>
        <ClassRoster
          groupId={groupId}
          canManage={canManage}
          canTakeRegister={canTakeRegister}
          academicSessionId={data.academic_session_id}
        />
      </Panel>

          <Panel id="subjects" tab={tab}>
        <ClassSubjects groupId={groupId} canManage={canManage} rollSize={data.occupancy} />
      </Panel>

          <Panel id="timetable" tab={tab}>
        <ClassTimetable groupId={groupId} groupName={data.name} />
      </Panel>

          <Panel id="attendance" tab={tab}>
        <ClassAttendance groupId={groupId} />
      </Panel>

      <Panel id="marks" tab={tab}>
            <ClassGradebooks groupId={groupId} />
          </Panel>
        </div>

        <DetailPanel title={`About this ${t('group').toLowerCase()}`}>
          <DetailSection
            title={t('classTeacher')}
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={() => setSettingTeacher(true)}
                  className="inline-flex items-center gap-1 text-2xs text-accent-500 underline-offset-2 hover:underline"
                >
                  <PencilSimple size={11} />
                  {data.form_tutor?.name ? 'Change' : 'Set'}
                </button>
              ) : undefined
            }
          >
            <DetailRow label="Responsible for this class">
              {data.form_tutor?.name ?? (
                <span className="text-gray-500">Nobody yet</span>
              )}
            </DetailRow>
            {/* Said once, here, because it is the surprising part: this is a
              * permissions change wearing the clothes of a name. */}
            <p className="text-2xs leading-4 text-gray-500">
              They reach this {t('group').toLowerCase()}&rsquo;s roll, registers and marks.
            </p>
          </DetailSection>

          <DetailSection title="Details">
            <DetailRow label="Code">{data.code}</DetailRow>
            <DetailRow label="Type">{humanize(data.type)}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={data.status} />
            </DetailRow>
            {data.academic_level_name && (
              <DetailRow label={t('level')}>{data.academic_level_name}</DetailRow>
            )}
            {data.program_name && (
              <DetailRow label={t('programme')}>{data.program_name}</DetailRow>
            )}
            {data.campus_name && <DetailRow label={t('campus')}>{data.campus_name}</DetailRow>}
          </DetailSection>

          <DetailSection title="Places">
            <DetailRow label="On the roll">
              {formatNumber(data.occupancy)}
              {data.capacity !== null && ` of ${formatNumber(data.capacity)}`}
            </DetailRow>
            {data.capacity !== null && (
              <>
                {/* A bar, because "26 of 30" is a comparison a length makes in
                  * one glance and two numbers make in two. */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      data.has_space ? 'bg-success-500' : 'bg-danger-500',
                    )}
                    style={{
                      width: `${Math.min(100, Math.round((data.occupancy / Math.max(1, data.capacity)) * 100))}%`,
                    }}
                  />
                </div>
                <DetailRow label="Room left">
                  {data.has_space
                    ? `${formatNumber(Math.max(0, data.capacity - data.occupancy))} place(s)`
                    : 'Full'}
                </DetailRow>
              </>
            )}
          </DetailSection>

          <DetailSection title="When" defaultOpen={false}>
            {data.academic_session_name && (
              <DetailRow label={t('session')}>{data.academic_session_name}</DetailRow>
            )}
            {data.academic_period_name && (
              <DetailRow label={t('period')}>{data.academic_period_name}</DetailRow>
            )}
          </DetailSection>
        </DetailPanel>
      </div>

      <SetClassTeacherDialog
        open={settingTeacher}
        groupId={groupId}
        currentStaffId={data.form_tutor_staff_id}
        currentName={data.form_tutor?.name ?? null}
        onClose={() => setSettingTeacher(false)}
        onSaved={() => {
          setSettingTeacher(false)
          queryClient.invalidateQueries({ queryKey: classroomKeys.root(groupId) })
        }}
      />
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
      to="/learning-groups"
      className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={13} />
      All {label.toLowerCase()}
    </Link>
  )
}
