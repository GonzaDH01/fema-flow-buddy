import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CrudTable } from "@/components/crud-table";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/clientes")({ component: Page });

const CONDICIONES = ["Responsable Inscripto","Monotributista","Exento","Consumidor Final"] as const;
const schema = z.object({
  nombre: z.string().min(2).max(100),
  cuit: z.string().max(15).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().max(20).optional().or(z.literal("")),
  condicion_iva: z.enum(CONDICIONES).optional(),
});
type FormVals = z.infer<typeof schema>;
type Row = { id: string; nombre: string; cuit: string | null; email: string | null; telefono: string | null; condicion_iva: string | null };

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_clientes")
        .select("id,nombre,cuit,email,telefono,condicion_iva")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = {
      user_id: user!.id,
      nombre: v.nombre,
      cuit: v.cuit || null,
      email: v.email || null,
      telefono: v.telefono || null,
      condicion_iva: v.condicion_iva || null,
    };
    const { error } = edit
      ? await supabase.from("fema_clientes").update(payload).eq("id", edit.id)
      : await supabase.from("fema_clientes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(edit ? "Actualizado" : "Cliente creado");
    qc.invalidateQueries({ queryKey: ["fema_clientes"] });
    close();
  };
  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_clientes").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_clientes"] });
  };

  return (
    <>
      <CrudTable<Row>
        title="Clientes" description="Cartera de clientes FEMA"
        rows={data} loading={isLoading} emptyLabel="clientes"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: "CUIT", cell: (r) => r.cuit ?? "—" },
          { header: "Email", cell: (r) => r.email ?? "—" },
          { header: "Condición IVA", cell: (r) => r.condicion_iva ?? "—" },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog onSubmit={onSubmit} initial={edit} />
      </Dialog>
    </>
  );
}

function FormDialog({ onSubmit, initial }: { onSubmit: (v: FormVals) => Promise<void>; initial: Row | null }) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      cuit: initial?.cuit ?? "",
      email: initial?.email ?? "",
      telefono: initial?.telefono ?? "",
      condicion_iva: (initial?.condicion_iva as any) ?? undefined,
    },
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} cliente</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nombre" required error={f.formState.errors.nombre?.message}>
          <Input {...f.register("nombre")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="CUIT"><Input placeholder="XX-XXXXXXXX-X" {...f.register("cuit")} /></FormField>
          <FormField label="Teléfono"><Input {...f.register("telefono")} /></FormField>
        </div>
        <FormField label="Email" error={f.formState.errors.email?.message}>
          <Input type="email" {...f.register("email")} />
        </FormField>
        <FormField label="Condición IVA">
          <Select value={f.watch("condicion_iva") ?? ""} onValueChange={(v) => f.setValue("condicion_iva", v as any)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              {CONDICIONES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter><Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}