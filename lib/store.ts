import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppUser, MyOrg, setActiveOrgScope } from './supabase';

interface AuthState {
  user: AppUser | null;
  orgs: MyOrg[];
  platformAdmin: boolean;       // 3.3 super-super-admin (cross-tenant)
  activeOrgId: string | null;   // persisted across reloads
  sidebarCollapsed: boolean;    // persisted UI pref
  hasHydrated: boolean;

  setSession: (user: AppUser | null, orgs: MyOrg[], platformAdmin?: boolean) => void;
  setActiveOrg: (orgId: string) => void;
  patchOrg: (org: Partial<MyOrg> & { id: string }) => void;
  toggleSidebar: () => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      orgs: [],
      platformAdmin: false,
      activeOrgId: null,
      sidebarCollapsed: false,
      hasHydrated: false,

      setSession: (user, orgs, platformAdmin = false) =>
        set((s) => {
          const activeOrgId =
            s.activeOrgId && orgs.some((o) => o.id === s.activeOrgId)
              ? s.activeOrgId
              : orgs[0]?.id ?? null;
          setActiveOrgScope(activeOrgId);   // fence db reads to the active workspace
          return { user, orgs, platformAdmin, activeOrgId };
        }),
      setActiveOrg: (activeOrgId) => { setActiveOrgScope(activeOrgId); set({ activeOrgId }); },
      patchOrg: (patch) =>
        set((s) => ({ orgs: s.orgs.map((o) => (o.id === patch.id ? { ...o, ...patch } : o)) })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      clear: () => { setActiveOrgScope(null); set({ user: null, orgs: [], platformAdmin: false, activeOrgId: null }); },
      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'snr-auth',
      // only persist lightweight prefs; session/user are rehydrated from Supabase
      partialize: (s) => ({ activeOrgId: s.activeOrgId, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => { if (state) { setActiveOrgScope(state.activeOrgId); state.setHydrated(); } },
    }
  )
);

// Convenience selector: the user's role in the active org.
export function useActiveOrg() {
  const { orgs, activeOrgId } = useAuthStore();
  return orgs.find((o) => o.id === activeOrgId) ?? null;
}
