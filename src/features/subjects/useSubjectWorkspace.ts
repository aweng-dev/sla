import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PER_PAGE_MAX } from '@/shared/api/client'
import { coursesApi, offeringsApi } from '@/features/academics/academics.api'
import { academicsKeys } from '@/features/academics/academics.keys'
import { curriculumApi, curriculumKeys, type OfferingCurriculum } from './curriculum.api'
import type { CourseOffering } from '@/features/academics/academics.types'

/**
 * One subject, the classes taking it, and each class's scheme of work.
 *
 * ── Why the two lists are fetched separately and joined here ───────────────
 *
 * A class that takes Mathematics and a scheme of work for Mathematics are
 * different records with different lifetimes: the assignment is made in
 * September by a registrar, the document is written in October by a head of
 * department, and either can exist without the other. So the API has an
 * endpoint for each, both filterable by subject, session and term, and this
 * joins them on `course_offering_id`.
 *
 * The alternative — a `curriculum` block on the offering resource — would put
 * a document's status inside the timetabling payload and load it on every
 * screen that lists offerings, which is most of them.
 *
 * ── Every class, including the ones with nothing written ───────────────────
 *
 * The join is LEFT: `classes` below is driven by the offerings, so a class with
 * no scheme is a row saying so rather than a row that is missing. That absence
 * is the thing a head of department opens this page to find.
 */

export interface SubjectClass {
  offering: CourseOffering
  /** Every document written against this class for this subject, newest first.
   *  More than one when a school keeps versions. */
  curricula: OfferingCurriculum[]
  /** The one to show on a single line: the published one if there is one,
   *  otherwise the most recent draft. */
  headline: OfferingCurriculum | null
}

export function useSubjectWorkspace(
  courseId: string,
  filters: {
    academic_session_id?: string
    academic_period_id?: string
    /** False when the institution does not run the curriculum module. The
     *  request is not made rather than made and refused, so the classes table
     *  is not showing an error beside data that loaded perfectly well. */
    withCurricula?: boolean
  },
) {
  const subject = useQuery({
    queryKey: academicsKeys.courses.detail(courseId),
    queryFn: () => coursesApi.detail(courseId),
    enabled: Boolean(courseId),
  })

  const offeringQuery = {
    course_id: courseId,
    academic_session_id: filters.academic_session_id || undefined,
    academic_period_id: filters.academic_period_id || undefined,
    per_page: PER_PAGE_MAX,
  }

  const offerings = useQuery({
    queryKey: academicsKeys.offerings.list(offeringQuery),
    queryFn: () => offeringsApi.list(offeringQuery),
    enabled: Boolean(courseId),
    placeholderData: (previous) => previous,
  })

  const curriculaQuery = { ...offeringQuery, course_id: courseId }

  const curricula = useQuery({
    queryKey: curriculumKeys.list(curriculaQuery),
    queryFn: () => curriculumApi.list(curriculaQuery),
    enabled: Boolean(courseId) && filters.withCurricula !== false,
    placeholderData: (previous) => previous,
  })

  const classes = useMemo<SubjectClass[]>(() => {
    const byOffering = new Map<string, OfferingCurriculum[]>()

    for (const document of curricula.data?.rows ?? []) {
      const bucket = byOffering.get(document.course_offering_id)
      if (bucket) bucket.push(document)
      else byOffering.set(document.course_offering_id, [document])
    }

    return (offerings.data?.rows ?? []).map((offering) => {
      const documents = byOffering.get(offering.id) ?? []

      return {
        offering,
        curricula: documents,
        /* Published wins: it is what the class is actually being taught. A
         * draft alongside it is somebody's next version, not the current one. */
        headline:
          documents.find((document) => document.status === 'published') ??
          documents.find((document) => document.status === 'draft') ??
          documents[0] ??
          null,
      }
    })
  }, [offerings.data, curricula.data])

  /** Documents whose offering fell outside the current filter — none, normally,
   *  because both lists carry the same filters. Kept as the list the Curriculum
   *  tab renders so it never silently drops one. */
  const documents = curricula.data?.rows ?? []

  return {
    subject,
    offerings,
    curricula,
    classes,
    documents,
    isLoading: subject.isLoading || offerings.isLoading || curricula.isLoading,
    error: subject.error ?? offerings.error ?? curricula.error,
  }
}
