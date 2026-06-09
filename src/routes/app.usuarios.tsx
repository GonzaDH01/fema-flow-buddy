import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/usuarios")({ component: Page });

const MODULOS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "cashflow", label: "Cash Flow" },
  { key: "facturas", label: "Facturas" },
  { key: "estimaciones", label: "Estimaciones" },
  { key: "clientes", label: "Clientes" },
  { key: "compras", label: "Compras" },
  { key: "combustible", label: "Combustible" },
  { key: "proveedores", label: "Proveedores" },
  { key: "empleados", label: "Empleados" },
  { key: "impuestos", label: "Impuestos" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "medios", label: "Medios de Pago" },
  { key: "ocr", label: "OCR Facturas" },
  { key: "auditoria", label: "Auditoría" },
  { key: "usuarios", label: "Usuarios (admin)" },
];

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  aprobado: boolean;
  modulos_permitidos: string[];
  isAdmin: boolean;
};

function Page() {
  const { profile, loading } = useProfile();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!profile?.isAdmin,
    queryFn: async (): Promise<UserRow[]> => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,aprobado,modulos_permitidos").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      const adminSet = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      return (profiles ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        aprobado: p.aprobado ?? false,
        modulos_permitidos: p.modulos_permitidos ?? [],
        isAdmin: adminSet.has(p.id),
      }));
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">Cargando...</div>;
  if (!profile?.isAdmin) return <Navigate to="/app" />;

  const toggleAprobado = async (u: UserRow) => {
    const { error } = await supabase.from("profiles").update({ aprobado: !u.aprobado }).eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(u.aprobado ? "Acceso revocado" : "Usuario aprobado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const toggleAdmin = async (u: UserRow) => {
    if (u.isAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", u.id).eq("role", "admin");
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: u.id, role: "admin" });
      if (error) return toast.error(error.message);
    }
    toast.success("Rol actualizado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">Gestión de Usuarios</h2>
        <p className="text-sm text-muted-foreground">
          Aprobá nuevos registros y asigná los módulos a los que puede acceder cada usuario.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando usuarios...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Rol</th>
                <th className="px-4 py-2 text-left">Módulos</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-2">{u.email ?? "—"}</td>
                  <td className="px-4 py-2">
                    {u.aprobado ? <Badge>Aprobado</Badge> : <Badge variant="secondary">Pendiente</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    {u.isAdmin ? <Badge variant="default">Admin</Badge> : <span className="text-muted-foreground">Usuario</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {u.isAdmin ? "Todos" : `${u.modulos_permitidos.length} módulos`}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant={u.aprobado ? "outline" : "default"} onClick={() => toggleAprobado(u)}>
                        {u.aprobado ? "Revocar" : "Aprobar"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                        Módulos
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleAdmin(u)}>
                        {u.isAdmin ? "Quitar admin" : "Hacer admin"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(users ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ModulesDialog user={editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />}
    </div>
  );
}

function ModulesDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(user.modulos_permitidos);
  const [saving, setSaving] = useState(false);

  const toggle = (key: string) => {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ modulos_permitidos: selected }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Módulos actualizados");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Módulos permitidos · {user.full_name ?? user.email}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-2">
          {MODULOS.map((m) => (
            <label key={m.key} className="flex items-center gap-2 rounded border border-border p-2 text-sm">
              <Checkbox checked={selected.includes(m.key)} onCheckedChange={() => toggle(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}