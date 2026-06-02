import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/estimaciones")({ component: Page });

const schema = z.object({
  cliente_id: z.string().uuid().optional().or(z.literal("")),
  fecha_estimada: z.string().min(1),
  monto: z.coerce.number().min(0),
  descripcion: z.string().max(200).optional().or(z.literal("")),
  estado: z.enum(["estimado","cobrado"]),
});
type FormVals = z.infer<typeof schema>;
type Row = { id: string; cliente_id: string | null; fecha_estimada: string; monto: number; descripcion: string | null; estado: string };

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_estimaciones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_estimaciones").select("*").order("fecha_estimada", { ascending: true });
      if (error) throw error;
      return data as Row[];
    },
  });
  const { data: cs } = useQuery({
    queryKey: ["fema_clientes_min"],
    queryFn: async () => (await supabase.from("fema_clientes").select("id,nombre").order("nombre")).data as { id: string; nombre: string }[],
  });
  const cmap = useMemo(() => Object.fromEntries((cs ?? []).map((c) => [c.id, c.nombre])), [cs]);

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = { user_id: user!.id, ...v, cliente_id: v.cliente_id || null, descripcion: v.descripcion || null };
    const { error } = edit
      ? await supabase.from("fema_estimaciones").update(payload).eq("id", edit.id)
      : await supabase.from("fema_estimaciones").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    qc.invalidateQueries({ queryKey: ["fema_estimaciones"] });
    close();
  };
  const onDelete = async (r: Row) => {
    await supabase.from("fema_estimaciones").delete().eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["fema_estimaciones"] });
    toast.success("Eliminado");
  };

  return (
    <>
      <CrudTable<Row>
        title="Estimaciones de cobro" description="Proyección de ingresos futuros"
        rows={data} loading={isLoading} emptyLabel="estimaciones"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Fecha estimada", cell: (r) => formatFecha(r.fecha_estimada) },
          { header: "Cliente", cell: (r) => r.cliente_id ? cmap[r.cliente_id] ?? "—" : "—" },
          { header: "Descripción", cell: (r) => r.descripcion ?? "—" },
          { header: "Monto", cell: (r) => <span className="font-medium">{formatPesos(r.monto)}</span> },
          { header: "Estado", cell: (r) => <Badge variant={r.estado === "cobrado" ? "default" : "secondary"}>{r.estado}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog onSubmit={onSubmit} initial={edit} cs={cs ?? []} />
      </Dialog>
    </>
  );
}

function FormDialog({ onSubmit, initial, cs }: { onSubmit: (v: FormVals) => Promise<void>; initial: Row | null; cs: { id: string; nombre: string }[] }) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      cliente_id: initial?.cliente_id ?? "",
      fecha_estimada: initial?.fecha_estimada ?? new Date().toISOString().split("T")[0],
      monto: Number(initial?.monto ?? 0),
      descripcion: initial?.descripcion ?? "",
      estado: (initial?.estado as any) ?? "estimado",
    },
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nueva"} estimación</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Cliente">
          <Select value={f.watch("cliente_id") ?? ""} onValueChange={(v) => f.setValue("cliente_id", v)}>
            <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
            <SelectContent>{cs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha estimada" required><Input type="date" {...f.register("fecha_estimada")} /></FormField>
          <FormField label="Monto"><Input type="number" step="0.01" {...f.register("monto")} /></FormField>
        </div>
        <FormField label="Descripción"><Input {...f.register("descripcion")} /></FormField>
        <FormField label="Estado">
          <Select value={f.watch("estado")} onValueChange={(v) => f.setValue("estado", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estimado">Estimado</SelectItem>
              <SelectItem value="cobrado">Cobrado</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}