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

export const Route = createFileRoute("/app/medios")({ component: Page });

const TIPOS = ["Efectivo","Transferencia","Cheque","Tarjeta","Otro"] as const;
const schema = z.object({
  nombre: z.string().min(2).max(100),
  tipo: z.enum(TIPOS),
});
type FormVals = z.infer<typeof schema>;
type Row = { id: string; nombre: string; tipo: string };

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["fema_medios_pago"],
    queryFn: async () => (await supabase.from("fema_medios_pago").select("*").order("nombre")).data as Row[],
  });

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = { user_id: user!.id, ...v };
    const { error } = edit
      ? await supabase.from("fema_medios_pago").update(payload).eq("id", edit.id)
      : await supabase.from("fema_medios_pago").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    qc.invalidateQueries({ queryKey: ["fema_medios_pago"] });
    close();
  };
  const onDelete = async (r: Row) => {
    await supabase.from("fema_medios_pago").delete().eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["fema_medios_pago"] });
    toast.success("Eliminado");
  };

  return (
    <>
      <CrudTable<Row>
        title="Medios de pago" rows={data} loading={isLoading} emptyLabel="medios"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: "Tipo", cell: (r) => <Badge variant="secondary">{r.tipo}</Badge> },
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
    defaultValues: { nombre: initial?.nombre ?? "", tipo: (initial?.tipo as any) ?? "Efectivo" },
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} medio de pago</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nombre" required error={f.formState.errors.nombre?.message}><Input {...f.register("nombre")} /></FormField>
        <FormField label="Tipo">
          <Select value={f.watch("tipo")} onValueChange={(v) => f.setValue("tipo", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}