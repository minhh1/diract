import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

import { supabase } from './supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  active_company_id: string | null;
  is_admin: boolean;
};

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  // company_memberships role for the active company (e.g. 'company_admin',
  // 'operator', 'kiosk') -- distinct from profile.is_admin, which is a
  // legacy/global flag. Mirrors lib/companyBootstrap.ts's activeRole on web.
  // Null while loading or when signed out.
  role: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, active_company_id, is_admin')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data ?? null);

    if (data?.active_company_id) {
      const { data: membership } = await supabase
        .from('company_memberships')
        .select('role')
        .eq('user_id', userId)
        .eq('company_id', data.active_company_id)
        .maybeSingle();
      setRole(membership?.role ?? null);
    } else {
      setRole(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id);
  }, [session?.user.id, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      setSession(initial);
      if (initial?.user.id) await loadProfile(initial.user.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user.id) {
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext.Provider value={{ session, profile, role, loading, refreshProfile, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
