import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/creditos")({ component: Page });

const schema = z.object({
  acreedor: z.string().min(1).max(120),
  descripcion: z.string().max(200).optional().or(z.literal("")),
  monto_total: z.coerce.number().min(0),
  cantidad_cuotas: z.coerce.number().min(1).max(120),
  valor_cuota: z.coerce.number().min(0),
  fecha_primera_cuota: z.string().min(1),
  tasa: z.coerce.number().min(0).optional().nullable(),
  observaciones: z.string().max(500).optional().or(z.literal("")),
});
type Vals = z.infer<typeof schema>;

type Credito = {
  id: string; acreedor: string; descripcion: string | null; monto_total: number;
  cantidad_cuotas: number; valor_cuota: number; fecha_primera_cuota: string;
  tasa: number | null; observaciones: string | null;
};
type Cuota = {
  id: string; credito_id: string; numero_cuota: number; fecha_vencimiento: string;
  monto: number; estado: string; fecha_pago: string | null; forma_pago: string | null;
};

function addMonths(iso: string, n: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Credito | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: creditos, isLoading } = useQuery({
    queryKey: ["fema_creditos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_creditos" as any)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Credito[];
    },
  });

  const { data: cuotas } = useQuery({
    queryKey: ["fema_creditos_cuotas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_creditos_cuotas" as any)
        .select("*").order("fecha_vencimiento");
      if (error) throw error;
      return data as unknown as Cuota[];
    },
  });

  const cuotasByCred = useMemo(() => {
    const m = new Map<string, Cuota[]>();
    for (const c of cuotas ?? []) {
      if (!m.has(c.credito_id)) m.set(c.credito_id, []);
      m.get(c.credito_id)!.push(c);
    }
    return m;
  }, [cuotas]);

  const toggleExp = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  const onSubmit = async (v: Vals) => {
    const payload: any = {
      user_id: user!.id,
      acreedor: v.acreedor,
      descripcion: v.descripcion || null,
      monto_total: v.monto_total,
      cantidad_cuotas: v.cantidad_cuotas,
      valor_cuota: v.valor_cuota,
      fecha_primera_cuota: v.fecha_primera_cuota,
      tasa: v.tasa ?? null,
      observaciones: v.observaciones || null,
    };
    let credId = edit?.id;
    if (edit) {
      const { error } = await supabase.from("fema_creditos" as any).update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("fema_creditos" as any).insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      credId = (data as any).id;
      // generar cuotas
      const cuotasGen = Array.from({ length: v.cantidad_cuotas }, (_, i) => ({
        user_id: user!.id,
        credito_id: credId,
        numero_cuota: i + 1,
        fecha_vencimiento: addMonths(v.fecha_primera_cuota, i),
        monto: v.valor_cuota,
        estado: "pendiente",
      }));
      const { error: cErr } = await supabase.from("fema_creditos_cuotas" as any).insert(cuotasGen);
      if (cErr) { toast.error(cErr.message); return; }
    }
    toast.success(edit ? "Crédito actualizado" : "Crédito creado con plan de cuotas");
    qc.invalidateQueries({ queryKey: ["fema_creditos"] });
    qc.invalidateQueries({ queryKey: ["fema_creditos_cuotas"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
    setOpen(false); setEdit(null);
  };

  const onDelete = async (c: Credito) => {
    const { error } = await supabase.from("fema_creditos" as any).delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Crédito eliminado");
    qc.invalidateQueries({ queryKey: ["fema_creditos"] });
    qc.invalidateQueries({ queryKey: ["fema_creditos_cuotas"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const pagarCuota = async (q: Cuota) => {
    const nuevo = q.estado === "pagada" ? "pendiente" : "pagada";
    const { error } = await supabase.from("fema_creditos_cuotas" as any).update({
      estado: nuevo,
      fecha_pago: nuevo === "pagada" ? new Date().toISOString().slice(0, 10) : null,
    }).eq("id", q.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fema_creditos_cuotas"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Créditos / Financiación</h2>
          <p className="text-sm text-muted-foreground">Cuotas de maquinaria, préstamos y financiaciones a pagar.</p>
        </div>
        <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nuevo crédito
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Créditos vigentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>ACREEDOR</TableHead>
                <TableHead>DESCRIPCIÓN</TableHead>
                <TableHead className="text-right">MONTO TOTAL</TableHead>
                <TableHead className="text-center">CUOTAS</TableHead>
                <TableHead className="text-right">VALOR CUOTA</TableHead>
                <TableHead className="text-right">PAGADAS / PEND.</TableHead>
                <TableHead className="text-right">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Cargando…</TableCell></TableRow>}
              {!isLoading && (creditos ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Sin créditos cargados</TableCell></TableRow>
              )}
              {(creditos ?? []).map((c) => {
                const list = cuotasByCred.get(c.id) ?? [];
                const pagadas = list.filter((x) => x.estado === "pagada").length;
                const pendientes = list.length - pagadas;
                const isExp = expanded.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <TableRow>
                      <TableCell>
                        <button onClick={() => toggleExp(c.id)} className="text-muted-foreground hover:text-foreground">
                          {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{c.acreedor}</TableCell>
                      <TableCell className="text-muted-foreground">{c.descripcion ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPesos(Number(c.monto_total))}</TableCell>
                      <TableCell className="text-center">{c.cantidad_cuotas}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPesos(Number(c.valor_cuota))}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-primary">{pagadas}</Badge>
                        {" / "}
                        <Badge variant="outline" className="text-accent">{pendientes}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEdit(c); setOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" className="h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar crédito?</AlertDialogTitle>
                                <AlertDialogDescription>Se eliminarán todas sus cuotas.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(c)}>Eliminar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExp && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/20 p-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>VENCIMIENTO</TableHead>
                                <TableHead className="text-right">MONTO</TableHead>
                                <TableHead>ESTADO</TableHead>
                                <TableHead>FECHA PAGO</TableHead>
                                <TableHead className="text-right">ACCIÓN</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {list.map((q) => (
                                <TableRow key={q.id}>
                                  <TableCell>{q.numero_cuota}</TableCell>
                                  <TableCell>{formatFecha(q.fecha_vencimiento)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatPesos(Number(q.monto))}</TableCell>
                                  <TableCell>
                                    {q.estado === "pagada"
                                      ? <Badge className="bg-primary/15 text-primary border-primary/30">● Pagada</Badge>
                                      : <Badge variant="outline" className="text-accent border-accent/40">● Pendiente</Badge>}
                                  </TableCell>
                                  <TableCell>{formatFecha(q.fecha_pago)}</TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => pagarCuota(q)}>
                                      <Check className="h-3 w-3" /> {q.estado === "pagada" ? "Revertir" : "Marcar pagada"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : (setOpen(false), setEdit(null))}>
        {open && <FormDialog key={edit?.id ?? "new"} initial={edit} onSubmit={onSubmit} />}
      </Dialog>
    </div>
  );
}

function FormDialog({ initial, onSubmit }: { initial: Credito | null; onSubmit: (v: Vals) => Promise<void> }) {
  const f = useForm<Vals>({
    resolver: zodResolver(schema),
    defaultValues: {
      acreedor: initial?.acreedor ?? "",
      descripcion: initial?.descripcion ?? "",
      monto_total: Number(initial?.monto_total ?? 0),
      cantidad_cuotas: initial?.cantidad_cuotas ?? 12,
      valor_cuota: Number(initial?.valor_cuota ?? 0),
      fecha_primera_cuota: initial?.fecha_primera_cuota ?? new Date().toISOString().slice(0, 10),
      tasa: initial?.tasa ?? null,
      observaciones: initial?.observaciones ?? "",
    },
  });

  // autocalcular valor cuota si cambia total y cuotas
  const total = Number(f.watch("monto_total") || 0);
  const ncuot = Number(f.watch("cantidad_cuotas") || 1);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} crédito / financiación</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Acreedor / Entidad" required>
          <Input placeholder="Ej: Banco Nación, John Deere Credit" {...f.register("acreedor")} />
        </FormField>
        <FormField label="Descripción del bien / motivo">
          <Input placeholder="Ej: Tractor JD 6110 — Cuotas plan canje" {...f.register("descripcion")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto total" required>
            <Input type="number" step="0.01" {...f.register("monto_total")} />
          </FormField>
          <FormField label="Cantidad de cuotas" required>
            <Input type="number" min={1} max={120} {...f.register("cantidad_cuotas")} />
          </FormField>
          <FormField label="Valor por cuota" required>
            <Input type="number" step="0.01" {...f.register("valor_cuota")} />
          </FormField>
          <FormField label="Tasa % (opcional)">
            <Input type="number" step="0.01" {...f.register("tasa")} />
          </FormField>
        </div>
        <FormField label="Fecha primera cuota" required>
          <Input type="date" {...f.register("fecha_primera_cuota")} />
        </FormField>
        <button
          type="button"
          onClick={() => f.setValue("valor_cuota", Number((total / ncuot).toFixed(2)))}
          className="text-xs text-primary hover:underline"
        >
          Calcular cuota = total / cantidad ({formatPesos(total / Math.max(1, ncuot))})
        </button>
        <FormField label="Observaciones">
          <Textarea rows={2} {...f.register("observaciones")} />
        </FormField>
        {!initial && (
          <p className="text-xs text-muted-foreground">
            Al guardar se generará automáticamente el plan de {ncuot} cuotas mensuales que se reflejará en el Cash Flow.
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}