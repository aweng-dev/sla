import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hrKeys, staffApi } from './hr.api'

/**
 * A staff photograph, as an object URL.
 *
 * The endpoint streams BYTES behind the same permission the record asks for
 * and hands out no URL, so the picture cannot outlive the session that fetched
 * it. That means the blob has to become an object URL here — and be revoked,
 * or every visit to a record leaks one.
 *
 * `enabled` is the `has_photo` flag: a person with no picture costs no request
 * instead of collecting a 404 per visit.
 */
export function useStaffPhoto(staffId: string, hasPhoto: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)

  const photo = useQuery({
    queryKey: hrKeys.staffPhoto(staffId),
    queryFn: () => staffApi.photo(staffId),
    enabled: hasPhoto,
    staleTime: 10 * 60_000,
    retry: false,
  })

  useEffect(() => {
    if (!photo.data) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(photo.data)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [photo.data])

  return url
}
