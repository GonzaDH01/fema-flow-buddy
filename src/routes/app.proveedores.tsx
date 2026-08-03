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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/proveedores")({ component: Page });

const CATS = ["Gasoil_Combustible","Repuestos_JD","Repuestos","Mecanicos","Gomeria","Inoculante","Transportistas","Seguros","Servicios","Herramientas","Mano_de_Obra","Honorarios","Maquinaria_Rodados","Pago_Creditos","Inversiones","Franco_Particular","Otro"] as const;
const schema = z.object({
  nombre: z.string().min(2).max(100),
  cuit: z.string().max(15).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().max(20).optional().or(z.literal("")),
  domicilio: z.string().max(200).optional().or(z.literal("")),
  localidad: z.string().max(120).optional().or(z.literal("")),
  condicion_iva: z.string().max(60).optional().or(z.literal("")),
  iibb: z.string().max(30).optional().or(z.literal("")),
  categoria: z.enum(CATS),
});
type FormVals = z.infer<typeof schema>;
type Row = {
  id: string; nombre: string; cuit: string | null; email: string | null; telefono: string | null;
  domicilio: string | null; localidad: string | null; condicion_iva: string | null; iibb: string | null;
  categoria: string;
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_proveedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_proveedores")
        .select("id,nombre,cuit,email,telefono,domicilio,localidad,condicion_iva,iibb,categoria")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = {
      user_id: user!.id, nombre: v.nombre, cuit: v.cuit || null, email: v.email || null,
      telefono: v.telefono || null, domicilio: v.domicilio || null, localidad: v.localidad || null,
      condicion_iva: v.condicion_iva || null, iibb: v.iibb || null, categoria: v.categoria,
    };
    const { error } = edit
      ? await supabase.from("fema_proveedores").update(payload).eq("id", edit.id)
      : await supabase.from("fema_proveedores").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Actualizado" : "Proveedor creado");
    qc.invalidateQueries({ queryKey: ["fema_proveedores"] });
    close();
  };
  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_proveedores").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_proveedores"] });
  };

  return (
    <>
      <CrudTable<Row>
        title="Proveedores" description="Catálogo de proveedores"
        rows={data} loading={isLoading} emptyLabel="proveedores"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: "CUIT", cell: (r) => r.cuit ?? "—" },
          { header: "Cond. IVA", cell: (r) => r.condicion_iva ?? "—" },
          { header: "Domicilio", cell: (r) => r.domicilio ? `${r.domicilio}${r.localidad ? `, ${r.localidad}` : ""}` : "—" },
          { header: "Teléfono", cell: (r) => r.telefono ?? "—" },
          { header: "Email", cell: (r) => r.email ?? "—" },
          { header: "Categoría", cell: (r) => <Badge variant="secondary">{r.categoria.replace("_"," ")}</Badge> },
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
      domicilio: initial?.domicilio ?? "",
      localidad: initial?.localidad ?? "",
      condicion_iva: initial?.condicion_iva ?? "",
      iibb: initial?.iibb ?? "",
      categoria: (initial?.categoria as any) ?? "Otro",
    },
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} proveedor</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nombre" required error={f.formState.errors.nombre?.message}>
          <Input {...f.register("nombre")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="CUIT"><Input {...f.register("cuit")} /></FormField>
          <FormField label="Teléfono"><Input {...f.register("telefono")} /></FormField>
        </div>
        <FormField label="Email" error={f.formState.errors.email?.message}><Input type="email" {...f.register("email")} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Domicilio"><Input {...f.register("domicilio")} /></FormField>
          <FormField label="Localidad"><Input {...f.register("localidad")} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Condición IVA"><Input placeholder="Responsable Inscripto / Monotributo" {...f.register("condicion_iva")} /></FormField>
          <FormField label="Ingresos Brutos"><Input {...f.register("iibb")} /></FormField>
        </div>
        <FormField label="Categoría">
          <Select value={f.watch("categoria")} onValueChange={(v) => f.setValue("categoria", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATS.map((c) => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter><Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}