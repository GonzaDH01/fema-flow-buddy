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

const MODULOS: { key: string; label: string; desc: string; uso: string }[] = [
  { key: "dashboard", label: "Dashboard", desc: "Resumen general de ventas, compras, cobros y pagos del período.", uso: "Se usa como pantalla de inicio: elegí el mes/año y revisá los KPIs y gráficos." },
  { key: "cashflow", label: "Cash Flow", desc: "Proyección mensual de ingresos y egresos (cobrados, pendientes y estimados).", uso: "Revisá cada mes para ver qué falta cobrar o pagar según los planes de pago cargados." },
  { key: "tesoreria", label: "Tesorería proyectada", desc: "Proyección semanal (13 semanas) de saldos de caja y fondos.", uso: "Sirve para anticipar faltantes de fondos antes de comprometer pagos." },
  { key: "cuentas", label: "Cuentas corrientes", desc: "Saldo por cliente y por proveedor con su detalle de facturas e imputaciones.", uso: "Buscá la razón social y revisá el saldo pendiente y los comprobantes que lo componen." },
  { key: "rentabilidad", label: "Rentabilidad operativa", desc: "Compara ingresos por servicio contra costos directos del período.", uso: "Se consulta por período para medir margen por trabajo (picado, embolsado, transporte)." },
  { key: "alertas", label: "Alertas", desc: "Centro de avisos: vencimientos, echeqs vencidos, facturas sin imagen o sin pagar.", uso: "Ingresá periódicamente y resolvé cada alerta desde el enlace al módulo correspondiente." },
  { key: "facturas", label: "Facturas", desc: "Facturas de venta y comprobantes estimados a clientes.", uso: "Cargá nueva factura o estimado, definí plan de pago y luego seguí su estado de cobro." },
  { key: "clientes", label: "Clientes", desc: "Padrón de clientes con datos fiscales y de contacto.", uso: "Usá el buscador para editar datos; se vinculan automáticamente a facturas y presupuestos." },
  { key: "compras", label: "Compras", desc: "Facturas de proveedores, comprobantes provisorios y gastos fijos.", uso: "Cargá la compra, asignale categoría y controlá las columnas PAGADO y SALDO." },
  { key: "combustible", label: "Combustible", desc: "Cargas de gasoil, tanque, consumos por equipo y viajes de transportistas.", uso: "Registrá cada carga o viaje y sacá el reporte de transportistas por período." },
  { key: "proveedores", label: "Proveedores", desc: "Padrón de proveedores con CUIT, domicilio y condición de IVA.", uso: "Buscá el proveedor y completá o corregí los datos que el OCR no haya detectado." },
  { key: "franco", label: "Franco (tarjeta personal)", desc: "Facturas a nombre de la empresa abonadas con fondos personales de Franco.", uso: "No afecta caja: solo marcá cada comprobante como pendiente o abonado; sí impacta en IVA." },
  { key: "creditos", label: "Créditos / Financiación", desc: "Créditos de maquinaria y sus cuotas con vencimientos.", uso: "Cargá el crédito y luego marcá cada cuota como pagada al transferirla." },
  { key: "empleados", label: "Empleados", desc: "Legajos, horas trabajadas y sueldos del personal.", uso: "Cargá el empleado, sus horas por período y liquidá los sueldos del mes." },
  { key: "impuestos", label: "Impuestos", desc: "Posiciones de IVA, IIBB y ganancias estimadas por período.", uso: "Se completa mes a mes con débito y crédito fiscal para el control impositivo." },
  { key: "presupuestos", label: "Presupuestos", desc: "Presupuestos con ítems, descuentos e impresión/PDF.", uso: "Armá el presupuesto por ítems, imprimilo o descargalo y luego pasalo a factura." },
  { key: "medios", label: "Medios de Pago", desc: "Echeqs en cartera y emitidos, transferencias, bancos y fondos de inversión.", uso: "Registrá cobros y pagos, marcá echeqs cobrados/cedidos y mové dinero entre caja y fondos." },
  { key: "ocr", label: "OCR Facturas", desc: "Lectura automática de comprobantes desde imagen o cámara del celular.", uso: "Elegí si es compra o venta, sacá la foto y confirmá los datos; detecta duplicados." },
  { key: "imagenes", label: "Imágenes", desc: "Archivo de imágenes de comprobantes de compras y ventas.", uso: "Descargá por rango de fechas en ZIP y liberá espacio; la pestaña Control detecta faltantes." },
  { key: "auditoria", label: "Auditoría", desc: "Reportes contables, libros de IVA compras/ventas y export ARCA.", uso: "Elegí el período y exportá los libros o reportes que necesite el contador." },
  { key: "usuarios", label: "Usuarios (admin)", desc: "Aprobación de usuarios y asignación de permisos por módulo.", uso: "Aprobá al usuario nuevo y tildá solo los módulos que debe utilizar." },
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
                    <div className="flex flex-wrap justify-end gap-2">
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
        <p className="text-xs text-muted-foreground">
          Tildá los módulos que este usuario podrá ver. Cada uno incluye su descripción y cómo se utiliza.
        </p>
        <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
          {MODULOS.map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer items-start gap-2 rounded border border-border p-2 text-sm hover:bg-muted/50"
            >
              <Checkbox className="mt-0.5" checked={selected.includes(m.key)} onCheckedChange={() => toggle(m.key)} />
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{m.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{m.desc}</span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground/70">Cómo usarlo: </span>
                  {m.uso}
                </span>
              </span>
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