import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles, type AppRole } from "@/lib/use-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">Error: {error.message}</div>
  ),
});

const ROLES: { value: AppRole; label: string; desc: string }[] = [
  { value: "admin", label: "Administrador", desc: "Acceso total" },
  { value: "contador", label: "Contador", desc: "Lectura global" },
  { value: "operador", label: "Operador", desc: "Gestiona sus propios datos" },
  { value: "user", label: "Usuario", desc: "Rol básico legacy" },
];

type ProfileRow = { id: string; email: string | null; full_name: string | null };
type RoleRow = { id: string; user_id: string; role: AppRole };

function UsuariosPage() {
  const { data: myRoles = [], isLoading: rolesLoading } = useMyRoles();
  const isAdmin = myRoles.includes("admin");
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("operador");

  const { data: profiles = [], isLoading: pLoading } = useQuery({
    queryKey: ["admin-profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const assign = useMutation({
    mutationFn: async (vars: { user_id: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: vars.user_id, role: vars.role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol asignado");
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol eliminado");
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rolesLoading) return <div className="p-6 text-muted-foreground">Cargando…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const rolesByUser = new Map<string, RoleRow[]>();
  for (const r of allRoles) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }

  const handleAssignByEmail = () => {
    const p = profiles.find((x) => (x.email ?? "").toLowerCase() === email.trim().toLowerCase());
    if (!p) {
      toast.error("No se encontró un usuario con ese email");
      return;
    }
    const existing = rolesByUser.get(p.id) ?? [];
    if (existing.some((r) => r.role === newRole)) {
      toast.info("El usuario ya tiene ese rol");
      return;
    }
    assign.mutate({ user_id: p.id, role: newRole });
    setEmail("");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Usuarios y roles</h1>
          <p className="text-sm text-muted-foreground">
            Administra los permisos de acceso al sistema.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asignar rol</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="space-y-1.5">
            <Label>Email del usuario</Label>
            <Input
              type="email"
              placeholder="usuario@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleAssignByEmail} disabled={!email || assign.isPending}>
              <UserPlus className="mr-2 h-4 w-4" /> Asignar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {pLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const rs = rolesByUser.get(p.id) ?? [];
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{p.email ?? "—"}</td>
                        <td className="py-2 pr-3">{p.full_name ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {rs.length === 0 && (
                              <span className="text-xs text-muted-foreground">Sin roles</span>
                            )}
                            {rs.map((r) => (
                              <Badge key={r.id} variant="secondary" className="gap-1">
                                {r.role}
                                <button
                                  type="button"
                                  className="ml-1 opacity-60 hover:opacity-100"
                                  onClick={() => {
                                    if (confirm(`¿Quitar rol "${r.role}"?`)) remove.mutate(r.id);
                                  }}
                                  aria-label={`Quitar rol ${r.role}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {profiles.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No hay usuarios visibles.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referencia de roles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.value} className="rounded-lg border p-3">
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}