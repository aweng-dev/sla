import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Chrome state that has to survive a reload but belongs to nobody's account.
 *
 * Deliberately NOT tenant-namespaced: a collapsed sidebar is a property of
 * this browser window, not of the institution being viewed, and clearing it on
 * a tenant change would be surprising. Anything that IS per-school goes in
 * `TENANT_SCOPED_STORAGE_KEYS` instead so the purge can find it.
 */
interface UiState {
  /** Sprig's rail collapses to an icon-only strip. The toggle sits at the top
   *  of the rail beside the wordmark. */
  railCollapsed: boolean
  /** Below `lg` the rail is a drawer rather than a column. Not persisted —
   *  a drawer left open across a reload is a bug, not a preference. */
  mobileNavOpen: boolean
  commandOpen: boolean
  toggleRail: () => void
  setRailCollapsed: (collapsed: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  setCommandOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,

      toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
    }),
    {
      name: 'schoollink.ui',
      partialize: (s) => ({ railCollapsed: s.railCollapsed }),
    },
  ),
)
