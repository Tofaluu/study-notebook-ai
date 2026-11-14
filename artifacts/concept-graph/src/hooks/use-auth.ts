import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import type { User, Session } from '@supabase/supabase-js';

let currentAccessToken: string | null = null;

setAuthTokenGetter(async () => {
  if (currentAccessToken) return currentAccessToken;
  const { data } = await supabase.auth.getSession();
  currentAccessToken = data.session?.access_token ?? null;
  return currentAccessToken;
});

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentAccessToken = session?.access_token ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      currentAccessToken = session?.access_token ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      window.dispatchEvent(new CustomEvent('billing-updated'));
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
