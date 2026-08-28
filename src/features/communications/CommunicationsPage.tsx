import { useMemo, useState } from 'react'
import { ChatsCircle } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Card, EmptyState, PageHeader, Skeleton, Tabs, panelId, type TabItem } from '@/shared/ui'
import { useModules, usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { MessagesPanel } from './components/MessagesPanel'
import { NoticeboardPanel } from './components/NoticeboardPanel'

/**
 * Everything this institution says to people, and everything they say back.
 *
 * ── Two surfaces, one module ───────────────────────────────────────────────
 *
 * Conversations are private and symmetrical: a parent, a learner and a class
 * teacher are in the same room, the API narrows by participation alone, and
 * there is no administrative way in. The noticeboard is the opposite — one
 * sender, a resolved audience, and a receipt per recipient. They share a module
 * switch and nothing else, so they are two tabs rather than one merged feed.
 *
 * ── Tabs are drawn from what answers, not from a role name ─────────────────
 *
 * Both sit behind `module:communications`, resolved by the same six-layer chain
 * the API's own gate runs, so asking `useModules()` here gives the answer the
 * server would. Messaging additionally needs `communications.view` — the
 * permission that gates the directory and starting a thread — and a tab that
 * 403s is worse than a tab that was never drawn.
 *
 * Rendering a tab is not granting it. Every endpoint behind both re-runs its own
 * check server-side.
 */

const TABS_ID = 'communications-tabs'

type TabKey = 'messages' | 'noticeboard'

export function CommunicationsPage() {
  const { access } = useTenant()
  const modules = useModules()
  const permissions = usePermissions()

  const enabled = modules.has('communications')
  const canMessage = permissions.has('communications.view')

  const tabs = useMemo<TabItem[]>(() => {
    const items: TabItem[] = []
    if (enabled && canMessage) items.push({ key: 'messages', label: 'Messages' })
    if (enabled) items.push({ key: 'noticeboard', label: 'Noticeboard' })
    return items
  }, [enabled, canMessage])

  const [requested, setTab] = useState<TabKey>('messages')

  /* Derived, not corrected in an effect: the module list is not known on the
   * first render — `GET /portal/context` is still in flight — and a tab chosen
   * from an empty list would stick after the real one arrived. */
  const tab: TabKey = tabs.some((item) => item.key === requested)
    ? requested
    : ((tabs[0]?.key as TabKey | undefined) ?? 'noticeboard')

  if (!access) {
    return (
      <PageStack>
        <PageHeader title="Messages" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  if (tabs.length === 0) {
    return (
      <PageStack>
        <PageHeader title="Messages" />
        <Card>
          <EmptyState
            icon={<ChatsCircle size={20} />}
            title="This institution does not run communications"
            description="Neither conversations nor the noticeboard is switched on here. An administrator can enable them from the institution's modules."
          />
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      {/* A title alone. The sentence that stood here was worth keeping for one
          half of it — that a conversation is private — and the other half, the
          noticeboard reaching an audience, was carried by the word
          "Noticeboard" in the tab beside it.

          The privacy half is already on the screen and said better:
          `MessagesPanel`'s empty state spells out "not an administrator, not
          the institution owner", and it says it at the moment somebody is
          deciding whether to start a thread, which is when the promise is
          actually being relied on. A vaguer copy of it under the title was the
          third stacked line in a header Sprig draws in one. */}
      <PageHeader title="Messages" />

      <div>
        <Tabs
          items={tabs}
          value={tab}
          onChange={(key) => setTab(key as TabKey)}
          baseId={TABS_ID}
        />

        {tab === 'messages' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'messages')}
            aria-labelledby={`${TABS_ID}-tab-messages`}
            className="pt-4"
          >
            <MessagesPanel />
          </div>
        )}

        {tab === 'noticeboard' && (
          <div
            role="tabpanel"
            id={panelId(TABS_ID, 'noticeboard')}
            aria-labelledby={`${TABS_ID}-tab-noticeboard`}
            className="pt-4"
          >
            <NoticeboardPanel />
          </div>
        )}
      </div>
    </PageStack>
  )
}
