import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, ChevronDown, ChevronRight, Wand2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatPesos, formatFecha, MESES } from "@/lib/format";

const CATS = ["Servicios", "Sueldos / Honorarios", "Impuestos / Planes de pago", "Seguros", "Alquileres", "Internet / Telefonía", "Marketing / Redes", "Otro"] as const;

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
type CuotaDraft = { fecha: string; monto: number };

type Plantilla = {
  id: string; user_id: string; concepto: string; proveedor_id: string | null;
  categoria: string; monto_mensual: number; dia_vencimiento: number | null;
  mes_inicio: string; mes_fin: string | null; activo: boolean; observaciones: string | null;
};
type Mov = {
  id: string; gasto_fijo_id: string; anio: number; mes: number;
  monto: number; pagado: boolean; fecha_pago: string | null; forma_pago: string | null;
  cuenta_id: string | null; caja_mov_id: string | null; fecha_vencimiento: string | null;
  observaciones: string | null;
};
type Cuenta = { id: string; banco: string; alias: string | null; saldo: number | null };

const pad = (n: number) => String(n).padStart(2, "0");
function vencDe(anio: number, mes: number, dia: number | null) {
  const last = new Date(anio, mes, 0).getDate();
  return `${anio}-${pad(mes)}-${pad(Math.min(dia ?? 10, last))}`;
}
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}
const hoyISO = () => new Date().toISOString().slice(0, 10);

export function GastosFijos() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Plantilla | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pagar, setPagar] = useState<{ p: Plantilla; mes: number; monto: number; venc: string } | null>(null);
  const [pagarFecha, setPagarFecha] = useState(hoyISO());
  const [pagarCuenta, setPagarCuenta] = useState("none");
  const [saving, setSaving] = useState(false);

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ["fema_gastos_fijos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_gastos_fijos" as any).select("*").order("concepto");
      if (error) throw error;
      return data as unknown as Plantilla[];
    },
  });

  const { data: movs } = useQuery({
    queryKey: ["fema_gastos_fijos_mov", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_gastos_fijos_mov" as any).select("*").eq("anio", year);
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

  const { data: cuentas } = useQuery({
    queryKey: ["fema_cuentas_bancarias", "gastos-fijos"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_cuentas_bancarias")
        .select("id,banco,alias,saldo,tipo_cuenta").eq("activa", true).neq("tipo_cuenta", "fondo");
      return (data ?? []) as Cuenta[];
    },
  });
  const cuentaNombre = (id: string | null) => {
    const c = (cuentas ?? []).find((x) => x.id === id);
    return c ? `${c.banco}${c.alias ? " · " + c.alias : ""}` : "";
  };

  const provName = (id: string | null) => id ? (provs ?? []).find((p) => p.id === id)?.nombre ?? "" : "";

  const movByKey = useMemo(() => {
    const m = new Map<string, Mov>();
    for (const x of movs ?? []) m.set(`${x.gasto_fijo_id}|${x.mes}`, x);
    return m;
  }, [movs]);

  const refresh = () => {
    for (const k of ["fema_gastos_fijos", "fema_gastos_fijos_mov", "cashflow-matrix", "fema_cuentas_bancarias", "fema_caja_mov"])
      qc.invalidateQueries({ queryKey: [k] });
  };

  const close = () => { setOpen(false); setEdit(null); };

  const ensureProv = async (nombre: string): Promise<string | null> => {
    const n = nombre.trim();
    if (!n) return null;
    const f = (provs ?? []).find((p) => p.nombre.toLowerCase() === n.toLowerCase());
    if (f) return f.id;
    const { data, error } = await supabase.from("fema_proveedores").insert({ user_id: user!.id, nombre: n }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    qc.invalidateQueries({ queryKey: ["fema_proveedores_min"] });
    return data!.id;
  };

  const onSubmit = async (v: Vals, cronograma: CuotaDraft[]) => {
    const proveedor_id = v.proveedor_nombre ? await ensureProv(v.proveedor_nombre) : null;
    const payload: any = {
      user_id: user!.id, concepto: v.concepto, proveedor_id,
      categoria: v.categoria, monto_mensual: v.monto_mensual,
      dia_vencimiento: v.dia_vencimiento || null,
      mes_inicio: v.mes_inicio, mes_fin: v.mes_fin || null,
      activo: v.activo, observaciones: v.observaciones || null,
    };
    let id = edit?.id;
    if (edit) {
      const { error } = await supabase.from("fema_gastos_fijos" as any).update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("fema_gastos_fijos" as any).insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      id = (data as any).id;
    }
    if (!edit && cronograma.length && id) {
      const rows = cronograma.map((c, i) => {
        const [y, m] = c.fecha.split("-").map(Number);
        return {
          user_id: user!.id, gasto_fijo_id: id, anio: y, mes: m, monto: c.monto,
          pagado: false, fecha_vencimiento: c.fecha, observaciones: `Cuota ${i + 1}/${cronograma.length}`,
        };
      });
      const { error } = await supabase.from("fema_gastos_fijos_mov" as any).insert(rows);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(edit ? "Gasto fijo actualizado" : "Gasto fijo creado");
    refresh();
    close();
  };

  const onDelete = async (p: Plantilla) => {
    const conCaja = (movs ?? []).some((m) => m.gasto_fijo_id === p.id && m.caja_mov_id);
    if (conCaja) { toast.error("Tiene pagos debitados del banco. Revertí esos pagos antes de eliminar."); return; }
    const { error } = await supabase.from("fema_gastos_fijos" as any).delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    refresh();
  };

  const upsertMonto = async (p: Plantilla, mes: number, monto: number) => {
    const existing = movByKey.get(`${p.id}|${mes}`);
    if (existing?.pagado) { toast.error("Revertí el pago antes de cambiar el importe."); return; }
    const { error } = existing
      ? await supabase.from("fema_gastos_fijos_mov" as any).update({ monto }).eq("id", existing.id)
      : await supabase.from("fema_gastos_fijos_mov" as any).insert({
        user_id: user!.id, gasto_fijo_id: p.id, anio: year, mes, monto, pagado: false,
        fecha_vencimiento: vencDe(year, mes, p.dia_vencimiento),
      });
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  const abrirPagar = (p: Plantilla, mes: number, monto: number, venc: string) => {
    setPagar({ p, mes, monto, venc });
    setPagarFecha(venc < hoyISO() ? venc : hoyISO());
    setPagarCuenta(cuentas?.[0]?.id ?? "none");
  };

  const confirmarPago = async () => {
    if (!pagar) return;
    setSaving(true);
    try {
      const { p, mes, monto, venc } = pagar;
      let caja_mov_id: string | null = null;
      let cuenta_id: string | null = null;
      if (pagarCuenta !== "none") {
        const { data: cta, error: eC } = await supabase.from("fema_cuentas_bancarias").select("id,saldo").eq("id", pagarCuenta).maybeSingle();
        if (eC || !cta) { toast.error(eC?.message ?? "Cuenta no encontrada"); return; }
        const nuevo = Math.round((Number(cta.saldo || 0) - monto) * 100) / 100;
        const { data: cm, error: eM } = await supabase.from("fema_caja_mov").insert({
          user_id: user!.id, fecha: pagarFecha, cuenta_id: cta.id, tipo: "egreso", monto,
          concepto: `Gasto fijo — ${p.concepto} (${MESES[mes - 1]} ${year})`, saldo_resultante: nuevo,
        }).select("id").single();
        if (eM) { toast.error(eM.message); return; }
        const { error: eU } = await supabase.from("fema_cuentas_bancarias").update({ saldo: nuevo }).eq("id", cta.id);
        if (eU) { toast.error(eU.message); return; }
        caja_mov_id = cm!.id; cuenta_id = cta.id;
      }
      const patch: any = {
        pagado: true, fecha_pago: pagarFecha, monto,
        forma_pago: pagarCuenta === "none" ? "Efectivo" : "Transferencia",
        cuenta_id, caja_mov_id, fecha_vencimiento: venc,
      };
      const existing = movByKey.get(`${p.id}|${mes}`);
      const { error } = existing
        ? await supabase.from("fema_gastos_fijos_mov" as any).update(patch).eq("id", existing.id)
        : await supabase.from("fema_gastos_fijos_mov" as any).insert({ ...patch, user_id: user!.id, gasto_fijo_id: p.id, anio: year, mes });
      if (error) { toast.error(error.message); return; }
      toast.success(pagarCuenta === "none" ? "Pagado en efectivo (no mueve banco)" : "Pagado y debitado del banco");
      setPagar(null);
      refresh();
    } finally { setSaving(false); }
  };

  const revertir = async (mov: Mov) => {
    if (mov.caja_mov_id && mov.cuenta_id) {
      const { data: cta } = await supabase.from("fema_cuentas_bancarias").select("id,saldo").eq("id", mov.cuenta_id).maybeSingle();
      const { error: eD } = await supabase.from("fema_caja_mov").delete().eq("id", mov.caja_mov_id);
      if (eD) { toast.error(eD.message); return; }
      if (cta) {
        await supabase.from("fema_cuentas_bancarias")
          .update({ saldo: Math.round((Number(cta.saldo || 0) + Number(mov.monto)) * 100) / 100 }).eq("id", cta.id);
      }
    }
    const { error } = await supabase.from("fema_gastos_fijos_mov" as any)
      .update({ pagado: false, fecha_pago: null, forma_pago: null, cuenta_id: null, caja_mov_id: null }).eq("id", mov.id);
    if (error) { toast.error(error.message); return; }
    toast.success(mov.caja_mov_id ? "Pago revertido y reintegrado al banco" : "Pago revertido");
    refresh();
  };

  const activeInMonth = (p: Plantilla, mes: number) => {
    if (!p.activo) return false;
    const [yi, mi] = p.mes_inicio.split("-").map(Number);
    const target = year * 12 + (mes - 1);
    if (target < yi * 12 + (mi - 1)) return false;
    if (p.mes_fin) {
      const [yf, mf] = p.mes_fin.split("-").map(Number);
      if (target > yf * 12 + (mf - 1)) return false;
    }
    return true;
  };

  const cuotasDe = (p: Plantilla) => {
    const out: { mes: number; monto: number; venc: string; mov?: Mov }[] = [];
    for (let mes = 1; mes <= 12; mes++) {
      const mov = movByKey.get(`${p.id}|${mes}`);
      if (!mov && !activeInMonth(p, mes)) continue;
      out.push({
        mes, mov,
        monto: mov ? Number(mov.monto) : Number(p.monto_mensual),
        venc: mov?.fecha_vencimiento ?? vencDe(year, mes, p.dia_vencimiento),
      });
    }
    return out;
  };

  const resumen = useMemo(() => {
    let pagado = 0, pendiente = 0;
    for (const p of plantillas ?? []) for (const c of cuotasDe(p)) {
      if (c.mov?.pagado) pagado += c.monto; else pendiente += c.monto;
    }
    return { pagado, pendiente, total: pagado + pendiente };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas, movByKey, year]);

  const toggleExp = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Gastos mensuales recurrentes y planes de pago de impuestos. Desplegá cada fila para ver las cuotas,
          editar importes y registrar el pago (desde una cuenta del banco o en efectivo).
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
        <CardHeader><CardTitle className="text-base">Gastos Fijos · {year}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>CONCEPTO</TableHead>
                <TableHead>CATEGORÍA</TableHead>
                <TableHead className="text-right">MONTO BASE</TableHead>
                <TableHead className="text-center">VENCE</TableHead>
                <TableHead className="text-right">PAGADAS / PEND.</TableHead>
                <TableHead className="text-right">TOTAL {year}</TableHead>
                <TableHead className="text-right">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Cargando…</TableCell></TableRow>}
              {!isLoading && (plantillas ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Sin gastos fijos cargados</TableCell></TableRow>
              )}
              {(plantillas ?? []).map((p) => {
                const list = cuotasDe(p);
                const pagadas = list.filter((c) => c.mov?.pagado).length;
                const total = list.reduce((a, c) => a + c.monto, 0);
                const isExp = expanded.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <TableRow>
                      <TableCell>
                        <button onClick={() => toggleExp(p.id)} className="text-muted-foreground hover:text-foreground" aria-label="Ver cuotas">
                          {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.concepto}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {provName(p.proveedor_id) || "—"}
                          {!p.activo && <Badge variant="outline" className="ml-1 text-[10px]">inactivo</Badge>}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatPesos(Number(p.monto_mensual))}</TableCell>
                      <TableCell className="text-center">{p.dia_vencimiento ? `día ${p.dia_vencimiento}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-primary">{pagadas}</Badge>
                        {" / "}
                        <Badge variant="outline" className="text-accent">{list.length - pagadas}</Badge>
                      </TableCell>
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
                                <AlertDialogDescription>Se eliminarán también las cuotas cargadas.</AlertDialogDescription>
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
                    {isExp && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/20 p-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>MES</TableHead>
                                <TableHead>VENCIMIENTO</TableHead>
                                <TableHead className="text-right">MONTO</TableHead>
                                <TableHead>ESTADO</TableHead>
                                <TableHead>PAGO</TableHead>
                                <TableHead className="text-right">ACCIÓN</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {list.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin cuotas en {year}</TableCell></TableRow>
                              )}
                              {list.map((c) => (
                                <TableRow key={c.mes}>
                                  <TableCell>{MESES[c.mes - 1]}{c.mov?.observaciones?.startsWith("Cuota") ? <span className="ml-1 text-[11px] text-muted-foreground">{c.mov.observaciones}</span> : null}</TableCell>
                                  <TableCell>{formatFecha(c.venc)}</TableCell>
                                  <TableCell className="text-right">
                                    <MontoCell value={c.monto} locked={!!c.mov?.pagado} onSave={(n) => upsertMonto(p, c.mes, n)} />
                                  </TableCell>
                                  <TableCell>
                                    {c.mov?.pagado
                                      ? <Badge className="bg-primary/15 text-primary border-primary/30">● Pagada</Badge>
                                      : <Badge variant="outline" className="text-accent border-accent/40">● Pendiente</Badge>}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {c.mov?.pagado
                                      ? <>{formatFecha(c.mov.fecha_pago)} · {c.mov.caja_mov_id ? cuentaNombre(c.mov.cuenta_id) || "Banco" : "Efectivo / sin banco"}</>
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {c.mov?.pagado ? (
                                      <Button variant="outline" size="sm" onClick={() => revertir(c.mov!)}>
                                        <Undo2 className="h-3 w-3" /> Revertir
                                      </Button>
                                    ) : (
                                      <Button size="sm" onClick={() => abrirPagar(p, c.mes, c.monto, c.venc)}>
                                        <Check className="h-3 w-3" /> Pagar
                                      </Button>
                                    )}
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

      <Dialog open={!!pagar} onOpenChange={(o) => !o && setPagar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {pagar && (
            <div className="space-y-3">
              <p className="text-sm">
                <b>{pagar.p.concepto}</b> · {MESES[pagar.mes - 1]} {year} · vence {formatFecha(pagar.venc)}
              </p>
              <div className="space-y-1.5">
                <Label>Importe</Label>
                <Input type="number" step="0.01" value={pagar.monto}
                  onChange={(e) => setPagar({ ...pagar, monto: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha real de pago</Label>
                <Input type="date" value={pagarFecha} onChange={(e) => setPagarFecha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>¿De dónde sale el dinero?</Label>
                <Select value={pagarCuenta} onValueChange={setPagarCuenta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(cuentas ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Cuenta empresa — {c.banco} {c.alias ?? ""} ({formatPesos(Number(c.saldo ?? 0))})
                      </SelectItem>
                    ))}
                    <SelectItem value="none">Efectivo / sin mover banco</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {pagarCuenta === "none"
                    ? "Queda pagado, pero el saldo del banco no cambia."
                    : "Se descuenta del saldo de esa cuenta y queda el débito registrado en el banco."}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPagar(null)}>Cancelar</Button>
                <Button onClick={confirmarPago} disabled={saving || !(pagar.monto > 0)}>Confirmar pago</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

function MontoCell({ value, locked, onSave }: { value: number; locked: boolean; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  if (editing) {
    return (
      <Input
        autoFocus type="number" step="0.01" value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { setEditing(false); const n = Number(v); if (n !== value) onSave(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setEditing(false); } }}
        className="ml-auto h-7 w-32 text-right text-xs"
      />
    );
  }
  return (
    <button
      type="button" disabled={locked}
      title={locked ? "Pagada" : "Clic para editar el importe de este mes"}
      onClick={() => { setV(String(value)); setEditing(true); }}
      className={`tabular-nums ${locked ? "text-primary" : "hover:underline"}`}
    >
      {formatPesos(value)}
    </button>
  );
}

function FormDialog({ initial, provNombre, onSubmit }: {
  initial: Plantilla | null; provNombre: string; onSubmit: (v: Vals, c: CuotaDraft[]) => Promise<void>;
}) {
  const f = useForm<Vals>({
    resolver: zodResolver(schema),
    defaultValues: {
      concepto: initial?.concepto ?? "",
      proveedor_nombre: provNombre,
      categoria: initial?.categoria ?? "Servicios",
      monto_mensual: Number(initial?.monto_mensual ?? 0),
      dia_vencimiento: initial?.dia_vencimiento ?? 10,
      mes_inicio: initial?.mes_inicio ?? hoyISO().slice(0, 8) + "01",
      mes_fin: initial?.mes_fin ?? "",
      activo: initial?.activo ?? true,
      observaciones: initial?.observaciones ?? "",
    },
  });
  const [esPlan, setEsPlan] = useState(false);
  const [nCuotas, setNCuotas] = useState(6);
  const [cronograma, setCronograma] = useState<CuotaDraft[]>([]);

  const generar = () => {
    const ini = f.getValues("mes_inicio");
    const dia = Number(f.getValues("dia_vencimiento") || 10);
    const [y, m] = ini.split("-").map(Number);
    const first = vencDe(y, m, dia);
    const monto = Number(f.getValues("monto_mensual") || 0);
    const list = Array.from({ length: Math.max(1, nCuotas) }, (_, i) => ({ fecha: addMonths(first, i), monto }));
    setCronograma(list);
    f.setValue("mes_fin", list[list.length - 1].fecha);
  };
  const upd = (i: number, patch: Partial<CuotaDraft>) => setCronograma((prev) => prev.map((c, j) => j === i ? { ...c, ...patch } : c));
  const suma = cronograma.reduce((a, c) => a + Number(c.monto || 0), 0);

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} gasto fijo</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit((v) => onSubmit(v, esPlan ? cronograma : []))} className="space-y-3">
        <FormField label="Concepto" required>
          <Input placeholder="Ej: Pago Autónomos, ART, Plan de pago IVA" {...f.register("concepto")} />
        </FormField>
        <FormField label="Proveedor / Entidad">
          <Input placeholder="Ej: ARCA, Prevención ART, API Santa Fe" {...f.register("proveedor_nombre")} />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Día de pago"><Input type="number" min={1} max={31} {...f.register("dia_vencimiento")} /></FormField>
          <FormField label="Desde" required><Input type="date" {...f.register("mes_inicio")} /></FormField>
          <FormField label="Hasta (opcional)"><Input type="date" {...f.register("mes_fin")} /></FormField>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="activo" {...f.register("activo")} />
          <label htmlFor="activo" className="text-sm">Activo</label>
        </div>

        {!initial && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="esplan" checked={esPlan} onChange={(e) => setEsPlan(e.target.checked)} />
              <label htmlFor="esplan" className="text-sm font-medium">Es un plan de pago con cantidad de cuotas definida</label>
            </div>
            {esPlan && (
              <>
                <div className="flex items-end gap-2">
                  <FormField label="Cantidad de cuotas">
                    <Input type="number" min={1} max={120} value={nCuotas} onChange={(e) => setNCuotas(Number(e.target.value))} className="w-28" />
                  </FormField>
                  <Button type="button" variant="outline" size="sm" onClick={generar}><Wand2 className="h-3 w-3" /> Generar cuotas</Button>
                </div>
                {cronograma.length > 0 && (
                  <div className="space-y-1">
                    {cronograma.map((c, i) => (
                      <div key={i} className="grid grid-cols-[40px_1fr_1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">#{i + 1}</span>
                        <Input type="date" value={c.fecha} onChange={(e) => upd(i, { fecha: e.target.value })} className="h-8" />
                        <Input type="number" step="0.01" value={c.monto} onChange={(e) => upd(i, { monto: Number(e.target.value) })} className="h-8 text-right" />
                      </div>
                    ))}
                    <p className="text-right text-xs text-muted-foreground">Total del plan: <b className="text-foreground">{formatPesos(suma)}</b></p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <FormField label="Observaciones"><Textarea rows={2} {...f.register("observaciones")} /></FormField>
        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
