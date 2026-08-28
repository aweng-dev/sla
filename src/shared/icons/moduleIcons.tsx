import type { Icon } from '@phosphor-icons/react'
import {
  Archive,
  ArrowsLeftRight,
  Bank,
  Bed,
  Bell,
  BookOpen,
  Books,
  Brain,
  Bus,
  CalendarBlank,
  CalendarDots,
  ChalkboardTeacher,
  ChartBar,
  ChartLineUp,
  ChatsCircle,
  ClipboardText,
  Clock,
  Compass,
  CreditCard,
  Database,
  Exam,
  FileText,
  FirstAidKit,
  FlowArrow,
  Folders,
  GraduationCap,
  Handshake,
  IdentificationBadge,
  Key,
  ListChecks,
  MagnifyingGlass,
  Medal,
  Notebook,
  Package,
  PencilRuler,
  Plugs,
  Presentation,
  Receipt,
  Robot,
  SealCheck,
  ShieldCheck,
  SquaresFour,
  Stack,
  Student,
  Tag,
  Target,
  Tree,
  Users,
  UsersThree,
  Wallet,
  Warning,
} from '@phosphor-icons/react'

/**
 * Module id to icon.
 *
 * The API deliberately sends no presentation with the navigation tree — one
 * tree has to serve this app and a mobile shell, and a colour or a component
 * name baked into the API would belong to neither. So the mapping lives here,
 * keyed on the stable module id (`students`, `fee_management`).
 *
 * ── The fallback is not a bug ──────────────────────────────────────────────
 *
 * A module the API adds tomorrow renders with `SquaresFour` rather than
 * crashing or showing a blank. The rail is server-driven precisely so an
 * institution's module set can change without a frontend deploy; an icon map
 * that threw on an unknown key would take that property away.
 */

const ICONS: Record<string, Icon> = {
  // Platform
  dashboard: SquaresFour,

  // Identity
  authentication: Key,
  rbac: ShieldCheck,

  // People
  people: Users,
  students: Student,
  guardians: UsersThree,
  staff: IdentificationBadge,
  hr: Handshake,
  payroll: Wallet,

  // Academics
  institution_structure: Tree,
  academic_sessions: CalendarDots,
  academic_periods: CalendarBlank,
  academic_calendar: CalendarBlank,
  academic_levels: Stack,
  programs: Compass,
  curriculum: PencilRuler,
  courses: BookOpen,
  learning_groups: UsersThree,
  course_offerings: ListChecks,
  enrollment: ClipboardText,
  course_registration: ClipboardText,

  // Admissions
  admissions: Target,
  crm: Handshake,

  // Learning
  lms: Presentation,
  learning_progress: ChartLineUp,
  assignments: Notebook,
  discussions: ChatsCircle,

  // Assessment
  question_bank: Database,
  assessments: Exam,
  cbt: Exam,
  gradebook: ChalkboardTeacher,
  grading: Medal,
  results: ChartBar,
  report_cards: FileText,

  // Attendance
  attendance: ListChecks,
  smart_attendance: Robot,

  // Scheduling
  timetable: Clock,

  // Finance
  finance: Bank,
  fee_management: Receipt,
  payment_management: CreditCard,
  scholarships: Medal,
  payment_plans: CalendarDots,
  accounting: Bank,

  // Operations
  library: Books,
  hostel: Bed,
  transport: Bus,
  assets_inventory: Package,

  // Student services
  health_clinic: FirstAidKit,
  discipline: Warning,

  // Communication
  communications: ChatsCircle,
  notifications: Bell,
  calendar_events: CalendarBlank,

  // AI
  ai_platform: Brain,
  ai_student_success: Brain,
  ai_admissions: Brain,
  ai_admin_copilot: Robot,
  ai_rag: Database,
  ai_governance: ShieldCheck,
  ai_tutor: Brain,
  ai_teacher: Robot,
  ai_grading: Robot,
  ai_parent: Brain,

  // Analytics
  reports: ChartBar,

  // Tools
  document_management: Folders,
  workflow: FlowArrow,
  customization: Tag,
  import_export: ArrowsLeftRight,
  integrations: Plugs,
  search: MagnifyingGlass,

  // Security
  audit_security: ShieldCheck,

  // Portal-side extras
  certificates: SealCheck,
  transcripts: FileText,
  archive: Archive,
  graduation: GraduationCap,
}

/**
 * Icon for a navigation SECTION — the domain groups the API returns
 * (`students`, `academics`, `finance`…).
 *
 * Kept apart from the module map because the two namespaces collide: there is
 * both a `students` domain and a `students` module, and a `finance` domain and
 * a `finance` module. They want different icons — the domain is the heading,
 * the module is one row inside it.
 */
const SECTION_ICONS: Record<string, Icon> = {
  platform: SquaresFour,
  identity: Key,
  people: Users,
  students: Student,
  academics: GraduationCap,
  admissions: Target,
  learning: Presentation,
  assessment: Exam,
  attendance: ListChecks,
  scheduling: Clock,
  finance: Bank,
  hr: IdentificationBadge,
  operations: Package,
  student_services: FirstAidKit,
  communication: ChatsCircle,
  ai: Brain,
  analytics: ChartBar,
  platform_services: Folders,
  security: ShieldCheck,
  support: Compass,
}

export function sectionIcon(key: string | null | undefined): Icon {
  if (!key) return SquaresFour
  return SECTION_ICONS[key] ?? SECTION_ICONS[key.replace(/-/g, '_')] ?? SquaresFour
}

export function SectionIcon({
  name,
  size = 17,
  className,
}: {
  name: string | null | undefined
  size?: number
  className?: string
}) {
  const Component = sectionIcon(name)
  return <Component size={size} className={className} />
}

export function moduleIcon(key: string | null | undefined): Icon {
  if (!key) return SquaresFour
  return ICONS[key] ?? ICONS[key.replace(/-/g, '_')] ?? SquaresFour
}

/** Renders the icon for a module at the rail's size. */
export function ModuleIcon({
  name,
  size = 16,
  className,
  weight = 'regular',
}: {
  name: string | null | undefined
  size?: number
  className?: string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}) {
  const Component = moduleIcon(name)
  return <Component size={size} weight={weight} className={className} />
}
