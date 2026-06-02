import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Mail, Phone, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

type CP = Database["public"]["Tables"]["clientes_proveedores"]["Row"];
type TipoPersona = Database["public"]["Enums"]["tipo_persona"];
type CondicionIva = Database["public"]["Enums"]["condicion_iva"];

const TIPOS: { value: TipoPersona; label: string }[] = [
  { value: "cliente", label: "Cliente" },
  { value: "proveedor", label: "Proveedor" },
  { value: "ambos", label: "Ambos" },
];
const CONDICIONES: { value: CondicionIva; label: string }[] = [
  { value: "responsable_inscripto", label: "Responsable Inscripto" },
  { value: "monotributo", label: "Monotributo" },
  { value: "exento", label: "Exento" },
  { value: "consumidor_final", label: "Consumidor Final" },
  { value: "no_responsable", label: "No Responsable" },
];

const emptyForm = {
  tipo: "cliente" as TipoPersona,
  razon_social: "",
  cuit: "",
  condicion_iva: "consumidor_final" as CondicionIva,
  email: "",
  telefono: "",
  direccion: "",
  notas: "",
};

function ClientesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["clientes_proveedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_proveedores")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CP[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        cuit: form.cuit || null,
        email: form.email || null,
        telefono: form.telefono || null,
        direccion: form.direccion || null,
        notas: form.notas || null,
        created_by: user!.id,
      };
      const { error } = await supabase.from("clientes_proveedores").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro creado");
      setForm(emptyForm);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["clientes_proveedores"] });
      qc.invalidateQueries({ queryKey: ["cp-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes_proveedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["clientes_proveedores"] });
      qc.invalidateQueries({ queryKey: ["cp-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes y Proveedores</h1>
          <p className="mt-1 text-muted-foreground">Gestiona tus contrapartes comerciales FEMA.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente / proveedor</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoPersona })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condición IVA</Label>
                  <Select value={form.condicion_iva} onValueChange={(v) => setForm({ ...form, condicion_iva: v as CondicionIva })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDICIONES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Razón social *</Label>
                <Input required value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CUIT</Label>
                  <Input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} placeholder="20-12345678-9" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center">
          <p className="text-muted-foreground">Aún no hay registros.</p>
          <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{c.razon_social}</h3>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" /> {c.cuit || "Sin CUIT"}
                  </div>
                </div>
                {c.created_by === user?.id && (
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex gap-1.5">
                <Badge variant="secondary" className="capitalize">{c.tipo}</Badge>
                <Badge variant="outline" className="text-xs">{c.condicion_iva.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {c.email}</div>}
                {c.telefono && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {c.telefono}</div>}
              </div>
              {c.notas && <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{c.notas}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}