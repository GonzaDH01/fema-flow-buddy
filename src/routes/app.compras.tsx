import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { CrudTable } from "@/components/crud-table";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/compras")({ component: Page });

const TIPOS = ["A","B","C","M","E"] as const;
const CATS = ["Repuestos_JD","Mecanicos","Gomeria","Inoculante","Transportistas","Seguros","Servicios","Herramientas","Otro"] as const;
const schema = z.object({
  fecha: z.string().min(1),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  numero: z.string().max(20).optional().or(z.literal("")),
  tipo: z.enum(TIPOS),
  neto: z.coerce.number().min(0),
  iva_21: z.coerce.number().min(0),
  iva_105: z.coerce.number().min(0),
  percepciones: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
  categoria: z.enum(CATS),
  estado: z.enum(["pendiente","pagada"]),
});
type FormVals = z.infer<typeof schema>;
type Row = {
  id: string; fecha: string; proveedor_id: string | null; numero: string | null;
  tipo: typeof TIPOS[number]; neto: number; iva_21: number; iva_105: number;
  percepciones: number; total: number; categoria: typeof CATS[number];
  estado: "pendiente" | "pagada";
};

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [filtroCat, setFiltroCat] = useState<string>("todas");

  const { data, isLoading } = useQuery({
    queryKey: ["fema_facturas_compra", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_facturas_compra")
        .select("*").eq("user_id", user!.id).eq("anio", year)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: provs } = useQuery({
    queryKey: ["fema_proveedores_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_proveedores").select("id,nombre").order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
  });
  const provsMap = useMemo(() => Object.fromEntries((provs ?? []).map((p) => [p.id, p.nombre])), [provs]);

  const filtered = useMemo(() => {
    if (!data) return data;
    if (filtroCat === "todas") return data;
    return data.filter((r) => r.categoria === filtroCat);
  }, [data, filtroCat]);

  const close = () => { setOpen(false); setEdit(null); };
  const onSubmit = async (v: FormVals) => {
    const payload = {
      user_id: user!.id, fecha: v.fecha, proveedor_id: v.proveedor_id || null,
      numero: v.numero || null, tipo: v.tipo, neto: v.neto,
      iva_21: v.iva_21, iva_105: v.iva_105, percepciones: v.percepciones,
      total: v.total, categoria: v.categoria, estado: v.estado,
    };
    const { error } = edit
      ? await supabase.from("fema_facturas_compra").update(payload).eq("id", edit.id)
      : await supabase.from("fema_facturas_compra").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Actualizada" : "Compra creada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    close();
  };
  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_facturas_compra").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
  };
  const markPagada = async (r: Row) => {
    const { error } = await supabase.from("fema_facturas_compra").update({ estado: "pagada" }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marcada como pagada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
  };

  return (
    <>
      <CrudTable<Row>
        title="Compras" description={`Egresos del año ${year}`}
        rows={filtered} loading={isLoading} emptyLabel="compras"
        onAdd={() => { setEdit(null); setOpen(true); }}
        onEdit={(r) => { setEdit(r); setOpen(true); }}
        onDelete={onDelete}
        extraHeader={
          <Select value={filtroCat} onValueChange={setFiltroCat}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATS.map((c) => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        }
        columns={[
          { header: "Fecha", cell: (r) => formatFecha(r.fecha) },
          { header: "Proveedor", cell: (r) => r.proveedor_id ? provsMap[r.proveedor_id] ?? "—" : "—" },
          { header: "Categoría", cell: (r) => <Badge variant="secondary">{r.categoria.replace("_"," ")}</Badge> },
          { header: "Tipo", cell: (r) => <Badge variant="outline">{r.tipo}</Badge> },
          { header: "Total", cell: (r) => <span className="font-medium">{formatPesos(Number(r.total))}</span> },
          { header: "Estado", cell: (r) => r.estado === "pagada"
            ? <Badge className="bg-primary/15 text-primary">Pagada</Badge>
            : <button onClick={() => markPagada(r)} className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-xs text-accent hover:bg-accent/25">
                <CheckCircle2 className="h-3 w-3" /> Pendiente
              </button> },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog onSubmit={onSubmit} initial={edit} provs={provs ?? []} year={year} />
      </Dialog>
    </>
  );
}

function FormDialog({ onSubmit, initial, provs, year }: {
  onSubmit: (v: FormVals) => Promise<void>; initial: Row | null;
  provs: { id: string; nombre: string }[]; year: number;
}) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: initial?.fecha ?? `${year}-01-01`,
      proveedor_id: initial?.proveedor_id ?? "",
      numero: initial?.numero ?? "",
      tipo: initial?.tipo ?? "B",
      neto: Number(initial?.neto ?? 0),
      iva_21: Number(initial?.iva_21 ?? 0),
      iva_105: Number(initial?.iva_105 ?? 0),
      percepciones: Number(initial?.percepciones ?? 0),
      total: Number(initial?.total ?? 0),
      categoria: initial?.categoria ?? "Otro",
      estado: initial?.estado ?? "pendiente",
    },
  });
  const tipo = f.watch("tipo");
  const neto = Number(f.watch("neto") || 0);
  const iva21 = Number(f.watch("iva_21") || 0);
  const iva105 = Number(f.watch("iva_105") || 0);
  const perc = Number(f.watch("percepciones") || 0);
  useEffect(() => {
    if (tipo === "A") f.setValue("total", neto + iva21 + iva105 + perc);
  }, [tipo, neto, iva21, iva105, perc, f]);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nueva"} compra</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Fecha" required><Input type="date" {...f.register("fecha")} /></FormField>
          <FormField label="Tipo">
            <Select value={tipo} onValueChange={(v) => f.setValue("tipo", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Número"><Input {...f.register("numero")} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Proveedor">
            <Select value={f.watch("proveedor_id") ?? ""} onValueChange={(v) => f.setValue("proveedor_id", v)}>
              <SelectTrigger><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
              <SelectContent>{provs.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Categoría">
            <Select value={f.watch("categoria")} onValueChange={(v) => f.setValue("categoria", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Neto"><Input type="number" step="0.01" {...f.register("neto")} /></FormField>
          <FormField label="Total"><Input type="number" step="0.01" {...f.register("total")} /></FormField>
        </div>
        {tipo === "A" && (
          <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField label="IVA 21%"><Input type="number" step="0.01" {...f.register("iva_21")} /></FormField>
            <FormField label="IVA 10.5%"><Input type="number" step="0.01" {...f.register("iva_105")} /></FormField>
            <FormField label="Percepciones"><Input type="number" step="0.01" {...f.register("percepciones")} /></FormField>
          </div>
        )}
        <FormField label="Estado">
          <Select value={f.watch("estado")} onValueChange={(v) => f.setValue("estado", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="pagada">Pagada</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter><Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}