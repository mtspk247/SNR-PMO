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
      activeOrgId: n