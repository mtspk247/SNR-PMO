import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppUser, MyOrg } from './supabase';

interface AuthState {
  user: AppUser | null;
  orgs: MyOrg[];
  activeOrgId: string | null;   // persisted across reloads
  sidebarCollapsed: boolean;    // persisted UI pref
  hasHydrated: boolean;

  setSession: (user: AppUser | null, orgs: MyOrg[]) => void;
  setActiveOrg: (orgId: string) => void;
  toggleSidebar: () => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      orgs: [],
      activeOrgId: null,
      sidebarCollapsed: false,
      hasHydrated: false,

      setSession: (user, orgs) =>
        set((s) => ({
          user,
          orgs,
          // keep current active org if still valid, else default to first
          activeOrgId:
            s.activeOrgId && orgs.some((o) => o.id === s.activeOrgId)
              ? s.activeOrgId
              : orgs[0]?.id ?? null,
        })),
      setActiveOrg: (activeOrgId) => set({ activeOrgId }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      clear: () => set({ user: null, orgs: [], activeOrgId: null }),
      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'snr-auth',
      // only persist lightweight prefs; session/user are rehydrated from Supabase
      partialize: (s) => ({ activeOrgId: s.activeOrgId, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);

// Convenience selector: the user's role in the active org.
export function useActiveOrg() {
  const { orgs, activeOrgId } = useAuthStore();
  return orgs.find((o) => o.id === activeOrgId) ?? null;
}
