import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type Role = 'owner' | 'admin' | 'agent' | 'viewer';

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_id: string | null;
  account_role: Role | null;
}

interface SessionState {
  /** true until the stored session has been read from the device */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  accountId: string | null;
  role: Role | null;
  /** agent and above can reply, assign, edit; viewers are read-only */
  canWrite: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, account_id, account_role')
      .eq('user_id', userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => active && setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Don't await Supabase calls inside this callback (it can deadlock the auth lock).
      setTimeout(() => void loadProfile(next?.user.id), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<SessionState>(() => {
    const role = profile?.account_role ?? null;
    return {
      loading,
      session,
      profile,
      accountId: profile?.account_id ?? null,
      role,
      canWrite: role === 'owner' || role === 'admin' || role === 'agent',
      isAdmin: role === 'owner' || role === 'admin',
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await unregisterPush(); // never throws; needs the session, so it must run first
        await supabase.auth.signOut();
      },
    };
  }, [loading, session, profile, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}
