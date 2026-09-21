import { supabase } from "@/integrations/supabase/client";

/** Renueva la sesión si el token está vencido o por vencer (margen 120s). */
export async function asegurarSesion(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s) return false;
    const exp = Number(s.expires_at ?? 0) * 1000;
    if (!exp || exp - Date.now() < 120_000) {
      const { data: r, error } = await supabase.auth.refreshSession();
      if (error || !r.session) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const esJwtVencido = (e: unknown) => {
  const msg = typeof e === "string" ? e : ((e as { message?: string } | null)?.message ?? "");
  return /jwt expired|invalid jwt|token is expired|pgrst301/i.test(msg);
};

/**
 * Ejecuta una operación contra la base. Si falla por sesión vencida,
 * renueva el token y reintenta una sola vez de forma silenciosa.
 */
export async function conSesion<T>(fn: () => PromiseLike<T>): Promise<T> {
  await asegurarSesion();
  const res = await fn();
  const err = (res as { error?: unknown } | null)?.error;
  if (err && esJwtVencido(err)) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) return await fn();
  }
  return res;
}
