import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { asegurarSesion } from "@/lib/sesion";

const DEV_USER: User = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@femaflow.local",
  role: "authenticated",
  aud: "authenticated",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { full_name: "Usuario Desarrollo" },
  identities: [],
} as unknown as User;

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Mantener la sesión viva: revisar al volver a la pestaña y cada 10 minutos.
    const onFocus = () => { if (document.visibilityState === "visible") void asegurarSesion(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { void asegurarSesion(); }, 10 * 60 * 1000);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  const devMode = import.meta.env.DEV;
  const effectiveUser = session?.user ?? (devMode ? DEV_USER : null);

  return (
    <Ctx.Provider
      value={{
        user: effectiveUser,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);