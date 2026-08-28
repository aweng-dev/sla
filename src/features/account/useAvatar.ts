import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@/shared/api/queryKeys'
import { accountApi } from './account.api'

/**
 * The signed-in person's avatar, as something an `<img>` can point at.
 *
 * The endpoint hands out bytes and no URL, so the blob has to become an object
 * URL here. Object URLs are a document-lifetime leak if nobody revokes them —
 * an 80 KB photograph pinned in memory for as long as the tab is open, once per
 * upload — so the effect revokes on every change of blob as well as on unmount.
 *
 * Gated on `has_avatar`: a 404 is the normal answer for most accounts, and
 * spending a request to be told so on every mount is a request per navigation
 * for nothing.
 */
export function useAvatarUrl(hasAvatar: boolean): { url: string | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: qk.account.avatar,
    queryFn: accountApi.avatar,
    enabled: hasAvatar,
    staleTime: 5 * 60_000,
    /* A 404 here means "no picture", not "try again". */
    retry: false,
  })

  const [url, setUrl] = useState<string | null>(null)
  const blob = query.data ?? null

  useEffect(() => {
    if (blob === null) {
      setUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [blob])

  return { url, isLoading: hasAvatar && query.isLoading }
}
