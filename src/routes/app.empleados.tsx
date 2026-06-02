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
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/empleados")({ component: Page });

const schema = z.object({
  nombre: z.string().min(2).max(100),
  cuil: z.string().max(15).optional().or(z.literal("")),
  fecha_ingreso: z.string().optional().or(z.literal("")),
  cargo: z.string().max(50).optional().or(z.literal("")),
  sueldo_bruto: z.coerce.number().min(0),
  activo: z.boolean(),
});
type FormVals = z.infer<typeof schema>;
type Row = { id: string; nombre: string; cuil: string | null; fecha_ingreso: string | null; cargo: string | null; sueldo_bruto: number; activo: boolean };

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_empleados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleados").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = {
      user_id: user!.id, nombre: v.nombre, cuil: v.cuil || null,
      fecha_ingreso: v.fecha_ingreso || null, cargo: v.cargo || null,
      sueldo_bruto: v.sueldo_bruto, activo: v.activo,
    };
    const { error } = edit
      ? await supabase.from("fema_empleados").update(payload).eq("id", edit.id)
      : await supabase.from("fema_empleados").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(edit ? "Actualizado" : "Empleado creado");
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
    close();
  };
  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_empleados").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
  };

  return (
    <>
      <CrudTable<Row>
        title="Empleados" description="Personal y nómina FEMA"
        rows={data} loading={isLoading} emptyLabel="empleados"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: "CUIL", cell: (r) => r.cuil ?? "—" },
          { header: "Cargo", cell: (r) => r.cargo ?? "—" },
          { header: "Ingreso", cell: (r) => formatFecha(r.fecha_ingreso) },
          { header: "Sueldo Bruto", cell: (r) => formatPesos(r.sueldo_bruto) },
          { header: "Estado", cell: (r) => r.activo
            ? <Badge className="bg-primary/15 text-primary">Activo</Badge>
            : <Badge variant="secondary">Inactivo</Badge> },
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
      cuil: initial?.cuil ?? "",
      fecha_ingreso: initial?.fecha_ingreso ?? "",
      cargo: initial?.cargo ?? "",
      sueldo_bruto: Number(initial?.sueldo_bruto ?? 0),
      activo: initial?.activo ?? true,
    },
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} empleado</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nombre" required error={f.formState.errors.nombre?.message}><Input {...f.register("nombre")} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="CUIL"><Input {...f.register("cuil")} /></FormField>
          <FormField label="Fecha ingreso"><Input type="date" {...f.register("fecha_ingreso")} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cargo"><Input {...f.register("cargo")} /></FormField>
          <FormField label="Sueldo bruto"><Input type="number" step="0.01" {...f.register("sueldo_bruto")} /></FormField>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={f.watch("activo")} onCheckedChange={(v) => f.setValue("activo", v)} />
          <span className="text-sm">Activo</span>
        </div>
        <DialogFooter><Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}