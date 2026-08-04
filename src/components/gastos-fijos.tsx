import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, MESES } from "@/lib/format";

const CATS = ["Servicios", "Sueldos / Honorarios", "Seguros", "Alquileres", "Internet / Telefonía", "Marketing / Redes", "Otro"] as const;

const schema = z.object({
  concepto: z.string().min(1).max(120),
  proveedor_nombre: z.string().max(120).optional().or(z.literal("")),
  categoria: z.string().min(1),
  monto_mensual: z.coerce.number().min(0),
  dia_vencimiento: z.coerce.number().min(1).max(31).optional().nullable(),
  mes_inicio: z.string().min(1),
  mes_fin: z.string().optional().or(z.literal("")),
  activo: z.boolean(),
  observaciones: z.string().max(500).optional().or(z.literal("")),
});
type Vals = z.infer<typeof schema>;

type Plantilla = {
  id: string; user_id: string; concepto: string; proveedor_id: string | null;
  categoria: string; monto_mensual: number; dia_vencimiento: number | null;
  mes_inicio: string; mes_fin: string | null; activo: boolean; observaciones: string | null;
};
type Mov = {
  id: string; gasto_fijo_id: string; anio: number; mes: number;
  monto: number; pagado: boolean; fecha_pago: string | null; forma_pago: string | null;
};

export function GastosFijos() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Plantilla | null>(null);

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ["fema_gastos_fijos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_gastos_fijos" as any)
        .select("*").order("concepto");
      if (error) throw error;
      return data as unknown as Plantilla[];
    },
  });

  const { data: movs } = useQuery({
    queryKey: ["fema_gastos_fijos_mov", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_gastos_fijos_mov" as any)
        .select("*").eq("anio", year);
      if (error) throw error;
      return data as unknown as Mov[];
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
  const provName = (id: string | null) =>
    id ? (provs ?? []).find((p) => p.id === id)?.nombre ?? "" : "";

  const movByKey = useMemo(() => {
    const m = new Map<string, Mov>();
    for (const x of movs ?? []) m.set(`${x.gasto_fijo_id}|${x.mes}`, x);
    return m;
  }, [movs]);

  const close = () => { setOpen(false); setEdit(null); };

  const ensureProv = async (nombre: string): Promise<string | null> => {
    const n = nombre.trim();
    if (!n) return null;
    const f = (provs ?? []).find((p) => p.nombre.toLowerCase() === n.toLowerCase());
    if (f) return f.id;
    const { data, error } = await supabase.from("fema_proveedores")
      .insert({ user_id: user!.id, nombre: n }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    qc.invalidateQueries({ queryKey: ["fema_proveedores_min"] });
    return data!.id;
  };

  const onSubmit = async (v: Vals) => {
    const proveedor_id = v.proveedor_nombre ? await ensureProv(v.proveedor_nombre) : null;
    const payload: any = {
      user_id: user!.id, concepto: v.concepto, proveedor_id,
      categoria: v.categoria, monto_mensual: v.monto_mensual,
      dia_vencimiento: v.dia_vencimiento || null,
      mes_inicio: v.mes_inicio, mes_fin: v.mes_fin || null,
      activo: v.activo, observaciones: v.observaciones || null,
    };
    const { error } = edit
      ? await supabase.from("fema_gastos_fijos" as any).update(payload).eq("id", edit.id)
      : await supabase.from("fema_gastos_fijos" as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Gasto fijo actualizado" : "Gasto fijo creado");
    qc.invalidateQueries({ queryKey: ["fema_gastos_fijos"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
    close();
  };

  const onDelete = async (p: Plantilla) => {
    const { error } = await supabase.from("fema_gastos_fijos" as any).delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_gastos_fijos"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const upsertMonto = async (p: Plantilla, mes: number, monto: number) => {
    const existing = movByKey.get(`${p.id}|${mes}`);
    if (existing) {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any)
        .update({ monto }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any)
        .insert({ user_id: user!.id, gasto_fijo_id: p.id, anio: year, mes, monto, pagado: false });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["fema_gastos_fijos_mov"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const togglePagado = async (p: Plantilla, mes: number) => {
    const existing = movByKey.get(`${p.id}|${mes}`);
    if (existing) {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any)
        .update({ pagado: !existing.pagado, fecha_pago: !existing.pagado ? new Date().toISOString().slice(0, 10) : null })
        .eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any).insert({
        user_id: user!.id, gasto_fijo_id: p.id, anio: year, mes,
        monto: p.monto_mensual, pagado: true, fecha_pago: new Date().toISOString().slice(0, 10),
      });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["fema_gastos_fijos_mov"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const activeInMonth = (p: Plantilla, mes: number) => {
    const m0 = new Date(p.mes_inicio).getFullYear() * 12 + new Date(p.mes_inicio).getMonth();
    const target = year * 12 + (mes - 1);
    if (target < m0) return false;
    if (p.mes_fin) {
      const mF = new Date(p.mes_fin).getFullYear() * 12 + new Date(p.mes_fin).getMonth();
      if (target > mF) return false;
    }
    return p.activo;
  };

  const marcarMes = async (mes: number, pagado: boolean) => {
    const activos = (plantillas ?? []).filter((p) => activeInMonth(p, mes));
    if (activos.length === 0) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const updates: string[] = [];
    const inserts: any[] = [];
    for (const p of activos) {
      const mov = movByKey.get(`${p.id}|${mes}`);
      if (mov) {
        if (mov.pagado !== pagado) updates.push(mov.id);
      } else if (pagado) {
        inserts.push({
          user_id: user!.id, gasto_fijo_id: p.id, anio: year, mes,
          monto: p.monto_mensual, pagado: true, fecha_pago: hoy,
        });
      }
    }
    if (updates.length) {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any)
        .update({ pagado, fecha_pago: pagado ? hoy : null }).in("id", updates);
      if (error) { toast.error(error.message); return; }
    }
    if (inserts.length) {
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any).insert(inserts);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(pagado ? `${MESES[mes - 1]} marcado como abonado` : `${MESES[mes - 1]} marcado como pendiente`);
    qc.invalidateQueries({ queryKey: ["fema_gastos_fijos_mov"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  // Totales del año: abonado vs pendiente
  const resumen = useMemo(() => {
    let pagado = 0, pendiente = 0;
    for (const p of plantillas ?? []) {
      for (let mes = 1; mes <= 12; mes++) {
        if (!activeInMonth(p, mes)) continue;
        const mov = movByKey.get(`${p.id}|${mes}`);
        const monto = mov ? Number(mov.monto) : Number(p.monto_mensual);
        if (mov?.pagado) pagado += monto; else pendiente += monto;
      }
    }
    return { pagado, pendiente, total: pagado + pendiente };
  }, [plantillas, movByKey, year]);

  const mesPagadoCompleto = (mes: number) => {
    const activos = (plantillas ?? []).filter((p) => activeInMonth(p, mes));
    return activos.length > 0 && activos.every((p) => movByKey.get(`${p.id}|${mes}`)?.pagado);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Plantilla de gastos mensuales recurrentes. El monto se proyecta cada mes y se puede editar individualmente.
          Tocá el <b>casillero</b> de cada mes para marcarlo como <b>abonado</b>, o el nombre del mes en el encabezado
          para marcar/desmarcar todos los gastos de ese mes.
        </div>
        <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nuevo gasto fijo
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Abonado {year}</p>
          <p className="text-lg font-semibold text-primary tabular-nums">{formatPesos(resumen.pagado)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Pendiente de pago</p>
          <p className="text-lg font-semibold text-accent tabular-nums">{formatPesos(resumen.pendiente)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total proyectado</p>
          <p className="text-lg font-semibold tabular-nums">{formatPesos(resumen.total)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gastos Fijos · {year}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">CONCEPTO</TableHead>
                <TableHead>CATEGORÍA</TableHead>
                {MESES.map((m, i) => {
                  const completo = mesPagadoCompleto(i + 1);
                  return (
                    <TableHead key={m} className="text-right">
                      <button
                        type="button"
                        onClick={() => marcarMes(i + 1, !completo)}
                        title={completo ? "Marcar mes como pendiente" : "Marcar todo el mes como abonado"}
                        className={`hover:underline ${completo ? "text-primary" : ""}`}
                      >
                        {m}{completo ? " ✓" : ""}
                      </button>
                    </TableHead>
                  );
                })}
                <TableHead className="text-right">TOTAL</TableHead>
                <TableHead className="text-right">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={16} className="py-6 text-center text-muted-foreground">Cargando…</TableCell></TableRow>}
              {!isLoading && (plantillas ?? []).length === 0 && (
                <TableRow><TableCell colSpan={16} className="py-6 text-center text-muted-foreground">Sin gastos fijos cargados</TableCell></TableRow>
              )}
              {(plantillas ?? []).map((p) => {
                let total = 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="sticky left-0 z-10 bg-card">
                      <div className="font-medium">{p.concepto}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {provName(p.proveedor_id) || "—"}
                        {!p.activo && <Badge variant="outline" className="ml-1 text-[10px]">inactivo</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                    {MESES.map((_, idx) => {
                      const mes = idx + 1;
                      const active = activeInMonth(p, mes);
                      const mov = movByKey.get(`${p.id}|${mes}`);
                      const monto = mov ? Number(mov.monto) : (active ? Number(p.monto_mensual) : 0);
                      if (active) total += monto;
                      return (
                        <TableCell key={mes} className="p-1 text-right">
                          {active ? (
                            <MesCell
                              value={monto}
                              pagado={mov?.pagado ?? false}
                              onSave={(n) => upsertMonto(p, mes, n)}
                              onTogglePagado={() => togglePagado(p, mes)}
                            />
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold tabular-nums">{formatPesos(total)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEdit(p); setOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar gasto fijo?</AlertDialogTitle>
                              <AlertDialogDescription>Se eliminarán también los montos cargados por mes.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(p)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        {open && (
          <FormDialog
            key={edit?.id ?? "new"}
            initial={edit}
            provNombre={provName(edit?.proveedor_id ?? null)}
            onSubmit={onSubmit}
          />
        )}
      </Dialog>
    </div>
  );
}

function MesCell({
  value, pagado, onSave, onTogglePagado,
}: { value: number; pagado: boolean; onSave: (n: number) => void; onTogglePagado: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type="number"
          step="0.01"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { setEditing(false); const n = Number(v); if (n !== value) onSave(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setEditing(false); } }}
          className="h-7 text-right text-xs"
        />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onTogglePagado}
        title={pagado ? "Pagado — clic para revertir" : "Marcar como pagado"}
        className={`grid h-4 w-4 place-items-center rounded border ${pagado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
      >
        {pagado ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-30" />}
      </button>
      <button
        type="button"
        onClick={() => { setV(String(value)); setEditing(true); }}
        className={`text-right text-xs tabular-nums ${pagado ? "text-primary" : "text-foreground"} hover:underline`}
      >
        {formatPesos(value)}
      </button>
    </div>
  );
}

function FormDialog({ initial, provNombre, onSubmit }: {
  initial: Plantilla | null; provNombre: string; onSubmit: (v: Vals) => Promise<void>;
}) {
  const f = useForm<Vals>({
    resolver: zodResolver(schema),
    defaultValues: {
      concepto: initial?.concepto ?? "",
      proveedor_nombre: provNombre,
      categoria: initial?.categoria ?? "Servicios",
      monto_mensual: Number(initial?.monto_mensual ?? 0),
      dia_vencimiento: initial?.dia_vencimiento ?? 10,
      mes_inicio: initial?.mes_inicio ?? new Date().toISOString().slice(0, 10),
      mes_fin: initial?.mes_fin ?? "",
      activo: initial?.activo ?? true,
      observaciones: initial?.observaciones ?? "",
    },
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} gasto fijo mensual</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Concepto" required>
          <Input placeholder="Ej: Luz, Redes Sociales, Seguro flota" {...f.register("concepto")} />
        </FormField>
        <FormField label="Proveedor / Beneficiario">
          <Input placeholder="Ej: Edenor, Juan Pérez" {...f.register("proveedor_nombre")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Categoría">
            <Select value={f.watch("categoria")} onValueChange={(v) => f.setValue("categoria", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Monto mensual base" required>
            <Input type="number" step="0.01" {...f.register("monto_mensual")} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Día venc.">
            <Input type="number" min={1} max={31} {...f.register("dia_vencimiento")} />
          </FormField>
          <FormField label="Desde" required><Input type="date" {...f.register("mes_inicio")} /></FormField>
          <FormField label="Hasta (opcional)"><Input type="date" {...f.register("mes_fin")} /></FormField>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="activo" {...f.register("activo")} />
          <label htmlFor="activo" className="text-sm">Activo</label>
        </div>
        <FormField label="Observaciones">
          <Textarea rows={2} {...f.register("observaciones")} />
        </FormField>
        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}