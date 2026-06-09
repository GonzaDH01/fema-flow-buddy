import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type ProfileInfo = {
  id: string;
  full_name: string | null;
  email: string | null;
  aprobado: boolean;
  modulos_permitidos: string[];
  isAdmin: boolean;
};

const Ctx = createContext<{ profile: ProfileInfo | null; loading: boolean; refetch: () => void }>({
  profile: null,
  loading: true,
  refetch: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ProfileInfo | null> => {
      if (!user) return null;
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,aprobado,modulos_permitidos").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      if (!p) return null;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        aprobado: (p as any).aprobado ?? false,
        modulos_permitidos: ((p as any).modulos_permitidos ?? []) as string[],
        isAdmin: (roles ?? []).some((r: any) => r.role === "admin"),
      };
    },
  });
  return (
    <Ctx.Provider value={{ profile: data ?? null, loading: isLoading, refetch: () => refetch() }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProfile = () => useContext(Ctx);