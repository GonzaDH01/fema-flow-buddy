import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { CrudTable } from "@/components/crud-table";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatNumero, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/combustible")({ component: Page });

const schema = z.object({
  fecha: z.string().min(1),
  litros: z.coerce.number().min(0.01),
  producto: z.string().min(2).max(50),
  precio_litro: z.coerce.number().min(0),
  itc: z.coerce.number().min(0),
  co2: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
});
type FormVals = z.infer<typeof schema>;
type Row = { id: string; fecha: string; litros: number; producto: string; precio_litro: number; itc: number; co2: number; total: number; mes: number };

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_combustible", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_combustible")
        .select("*").eq("user_id", user!.id).eq("anio", year)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = { user_id: user!.id, ...v };
    const { error } = edit
      ? await supabase.from("fema_combustible").update(payload).eq("id", edit.id)
      : await supabase.from("fema_combustible").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Actualizada" : "Carga registrada");
    qc.invalidateQueries({ queryKey: ["fema_combustible"] });
    close();
  };
  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_combustible").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["fema_combustible"] });
  };

  const totLitros = data?.reduce((a, x) => a + Number(x.litros), 0) ?? 0;
  const totItc = data?.reduce((a, x) => a + Number(x.itc), 0) ?? 0;
  const totCo2 = data?.reduce((a, x) => a + Number(x.co2), 0) ?? 0;
  const totPesos = data?.reduce((a, x) => a + Number(x.total), 0) ?? 0;

  return (
    <>
      <div className="px-6 pt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Litros año", v: `${formatNumero(totLitros)} L` },
            { l: "ITC", v: formatPesos(totItc) },
            { l: "CO2", v: formatPesos(totCo2) },
            { l: "Total pesos", v: formatPesos(totPesos) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="text-xs text-muted-foreground">{k.l}</div>
              <div className="mt-1 font-semibold text-primary">{k.v}</div>
            </div>
          ))}
        </div>
      </div>
      <CrudTable<Row>
        title="Combustible" description={`Cargas ${year} agrupadas por mes`}
        rows={data} loading={isLoading} emptyLabel="cargas"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        columns={[
          { header: "Mes", cell: (r) => MESES_LARGOS[r.mes - 1] },
          { header: "Fecha", cell: (r) => formatFecha(r.fecha) },
          { header: "Producto", cell: (r) => r.producto },
          { header: "Litros", cell: (r) => `${formatNumero(r.litros)} L` },
          { header: "Precio/L", cell: (r) => formatPesos(r.precio_litro) },
          { header: "ITC", cell: (r) => formatPesos(r.itc) },
          { header: "Total", cell: (r) => <span className="font-medium">{formatPesos(r.total)}</span> },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog onSubmit={onSubmit} initial={edit} year={year} />
      </Dialog>
    </>
  );
}

function FormDialog({ onSubmit, initial, year }: { onSubmit: (v: FormVals) => Promise<void>; initial: Row | null; year: number }) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: initial?.fecha ?? `${year}-01-01`,
      litros: Number(initial?.litros ?? 0),
      producto: initial?.producto ?? "Gasoil Grado 2",
      precio_litro: Number(initial?.precio_litro ?? 0),
      itc: Number(initial?.itc ?? 0),
      co2: Number(initial?.co2 ?? 0),
      total: Number(initial?.total ?? 0),
    },
  });
  const lit = Number(f.watch("litros") || 0);
  const pl = Number(f.watch("precio_litro") || 0);
  const itc = Number(f.watch("itc") || 0);
  const co2 = Number(f.watch("co2") || 0);
  useEffect(() => { f.setValue("total", lit * pl + itc + co2); }, [lit, pl, itc, co2, f]);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nueva"} carga</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha" required><Input type="date" {...f.register("fecha")} /></FormField>
          <FormField label="Producto" required error={f.formState.errors.producto?.message}>
            <Input {...f.register("producto")} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Litros" required><Input type="number" step="0.01" {...f.register("litros")} /></FormField>
          <FormField label="Precio por litro"><Input type="number" step="0.0001" {...f.register("precio_litro")} /></FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="ITC"><Input type="number" step="0.01" {...f.register("itc")} /></FormField>
          <FormField label="CO2"><Input type="number" step="0.01" {...f.register("co2")} /></FormField>
          <FormField label="Total"><Input type="number" step="0.01" {...f.register("total")} /></FormField>
        </div>
        <DialogFooter><Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}