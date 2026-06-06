import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppUser } from './supabase';

interface AuthState {
  user: AppUser | null;
  hasHydrated: boolean;
  setUser: (u: AppUser) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hasHydrated: false,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'snr-auth',
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
