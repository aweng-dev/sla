import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { studentKeys, studentsApi } from './students.api'

/**
 * A student's photograph, as an object URL.
 *
 * The API hands out no link to it. `/admin/students/{id}/photo` streams the
 * bytes behind the same permission the record asks for, deliberately, so that
 * a child's face never becomes a URL that outlives the session that fetched it
 * or sits in a proxy log. `person.has_photo` is the flag that says whether the
 * request is worth making — without it a roll of thirty would ask thirty times
 * and be refused twenty-eight.
 *
 * So the bytes are fetched with the bearer token attached, wrapped in an
 * object URL for the `<img>`, and revoked when the component goes away.
 * Skipping the revoke leaks the whole blob for the life of the tab, which on a
 * screen a registrar pages through all morning is not a rounding error.
 *
 * Returns null while loading, when there is no photograph, and when the fetch
 * was refused — every one of which the caller answers the same way: draw the
 * initials avatar.
 */
export function useStudentPhoto(studentId: string, hasPhoto: boolean): string | null {
  const query = useQuery({
    queryKey: studentKeys.photo(studentId),
    queryFn: () => studentsApi.photo(studentId),
    enabled: hasPhoto,
    staleTime: 10 * 60_000,
    /* A missing or forbidden photograph is an answer, not a blip. Retrying
     * turns one 403 into four. */
    retry: false,
  })

  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const blob = query.data

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null)
      return
    }

    const url = URL.createObjectURL(blob)
    setObjectUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [blob])

  return objectUrl
}
