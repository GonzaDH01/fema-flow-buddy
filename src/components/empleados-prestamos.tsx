import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, HandCoins, Wallet, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type Prestamo = {
  id: string; empleado_id: string; fecha: string; concepto: string; detalle: string | null;
  monto: number; cuotas: number; valor_cuota: number; factura_compra_id: string | null;
  estado: string; observaciones: string | null;
};
export type PrestamoMov = {
  id: string; prestamo_id: string; empleado_id: string; fecha: string;
  monto: number; tipo: string; pago_id: string | null; cuenta_id: string | null;
  observaciones: string | null;
};

const TIPO_MOV: Record<string, string> = {
  descuento: "Descuento de sueldo",
  efectivo: "Entrega en efectivo",
  otro: "Otro",
};

export function usePrestamos() {
  return useQuery({
    queryKey: ["fema_empleado_prestamos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_empleado_prestamos").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Prestamo[];
    },
  });
}

export function usePrestamoMovs() {
  return useQuery({
    queryKey: ["fema_empleado_prestamo_mov"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_empleado_prestamo_mov").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PrestamoMov[];
    },
  });
}

/** Saldo pendiente por empleado (total tomado - total devuelto). */
export function saldosPorEmpleado(prestamos: Prestamo[], movs: PrestamoMov[]) {
  const map: Record<string, { tomado: number; devuelto: number; saldo: number }> = {};
  for (const p of prestamos) {
    const m = (map[p.empleado_id] ??= { tomado: 0, devuelto: 0, saldo: 0 });
    m.tomado += Number(p.monto ?? 0);
  }
  for (const mv of movs) {
    const m = (map[mv.empleado_id] ??= { tomado: 0, devuelto: 0, saldo: 0 });
    m.devuelto += Number(mv.monto ?? 0);
  }
  for (const k of Object.keys(map)) map[k].saldo = map[k].tomado - map[k].devuelto;
  return map;
}

export function invalidarPrestamos(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["fema_empleado_prestamos", "fema_empleado_prestamo_mov", "fema_cuentas_bancarias", "fema_caja_mov", "cashflow-matrix"]) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

type EmpleadoMin = { id: string; nombre: string };
type FacturaMin = { id: string; fecha: string; numero: string | null; total: number; descripcion: string | null };

function useEmpleados() {
  return useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre").order("nombre");
      return (data ?? []) as EmpleadoMin[];
    },
  });
}

function useFacturasCompra() {
  return useQuery({
    queryKey: ["facturas_compra_prestamos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_facturas_compra")
        .select("id,fecha,numero,total,descripcion")
        .order("fecha", { ascending: false }).limit(300);
      return (data ?? []) as FacturaMin[];
    },
  });
}

function useCuentas() {
  return useQuery({
    queryKey: ["fema_cuentas_bancarias"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_cuentas_bancarias").select("id,banco,alias,saldo,activa").order("banco");
      return (data ?? []) as { id: string; banco: string | null; alias: string | null; saldo: number; activa: boolean }[];
    },
  });
}

// ====== NUEVO PRÉSTAMO / COMPRA A CUENTA ======
function NuevoPrestamoDialog({ empleadoId }: { empleadoId?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({
    empleado_id: empleadoId ?? "", fecha: hoy, concepto: "", detalle: "",
    monto: "", cuotas: "1", factura_id: "none", observaciones: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const { data: empleados } = useEmpleados();
  const { data: facturas } = useFacturasCompra();

  const monto = Number(v.monto || 0);
  const cuotas = Math.max(1, Number(v.cuotas || 1));
  const valorCuota = monto > 0 ? Math.round((monto / cuotas) * 100) / 100 : 0;

  const elegirFactura = (id: string) => {
    setV((s) => {
      if (id === "none") return { ...s, factura_id: id };
      const f = (facturas ?? []).find((x) => x.id === id);
      return {
        ...s,
        factura_id: id,
        monto: s.monto || String(f?.total ?? ""),
        concepto: s.concepto || (f?.descripcion ?? `Factura ${f?.numero ?? "s/n"}`),
      };
    });
  };

  const guardar = async () => {
    if (!v.empleado_id) return toast.error("Seleccioná un empleado");
    if (!v.concepto.trim()) return toast.error("Indicá qué se le entregó o compró");
    if (monto <= 0) return toast.error("Ingresá el importe");
    const d = new Date(v.fecha + "T00:00:00");
    const { error } = await supabase.from("fema_empleado_prestamos").insert({
      user_id: user!.id,
      empleado_id: v.empleado_id,
      fecha: v.fecha,
      concepto: v.concepto.trim(),
      detalle: v.detalle || null,
      monto,
      cuotas,
      valor_cuota: valorCuota,
      factura_compra_id: v.factura_id === "none" ? null : v.factura_id,
      observaciones: v.observaciones || null,
      estado: "pendiente",
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
    });
    if (error) return toast.error(error.message);
    if (v.factura_id !== "none") {
      await supabase.from("fema_facturas_compra").update({ empleado_id: v.empleado_id }).eq("id", v.factura_id);
    }
    toast.success(`Deuda registrada por ${formatPesos(monto)}`);
    invalidarPrestamos(qc);
    setOpen(false);
    setV((s) => ({ ...s, concepto: "", detalle: "", monto: "", cuotas: "1", factura_id: "none", observaciones: "" }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Nueva deuda / préstamo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar deuda del empleado</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={v.empleado_id} onValueChange={(x) => set("empleado_id", x)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Factura de compra de la empresa (opcional)</Label>
            <Select value={v.factura_id} onValueChange={elegirFactura}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin factura (préstamo en efectivo)</SelectItem>
                {(facturas ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {(f.numero ?? "s/n")} · {formatFecha(f.fecha)} · {formatPesos(f.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              La factura sigue siendo de FEMA (crédito fiscal y pago al comercio). Acá solo queda la deuda del empleado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Concepto</Label>
            <Input value={v.concepto} onChange={(e) => set("concepto", e.target.value)} placeholder="Heladera, amoladora, insumo..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Importe ($)</Label>
              <Input type="number" step="0.01" value={v.monto} onChange={(e) => set("monto", e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Cuotas</Label>
              <Input type="number" min="1" value={v.cuotas} onChange={(e) => set("cuotas", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
          </div>
          {valorCuota > 0 && (
            <p className="text-xs text-muted-foreground">Cuota estimada: <b>{formatPesos(valorCuota)}</b> × {cuotas}</p>
          )}

          <div className="space-y-1.5">
            <Label>Observaciones (opcional)</Label>
            <Textarea rows={2} value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====== REGISTRAR DEVOLUCIÓN ======
export function CobroPrestamoDialog({
  prestamo, saldo, onClose,
}: { prestamo: Prestamo; saldo: number; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({
    fecha: hoy,
    monto: String(Math.min(saldo, Number(prestamo.valor_cuota || saldo)) || ""),
    tipo: "efectivo",
    cuenta_id: "none",
    observaciones: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const { data: cuentas } = useCuentas();

  const guardar = async () => {
    const monto = Number(v.monto || 0);
    if (monto <= 0) return toast.error("Ingresá el importe devuelto");
    const { error } = await supabase.from("fema_empleado_prestamo_mov").insert({
      user_id: user!.id,
      prestamo_id: prestamo.id,
      empleado_id: prestamo.empleado_id,
      fecha: v.fecha,
      monto,
      tipo: v.tipo,
      cuenta_id: v.cuenta_id === "none" ? null : v.cuenta_id,
      observaciones: v.observaciones || null,
    });
    if (error) return toast.error(error.message);

    // Entrega en efectivo depositada en una cuenta: entra el dinero a caja/banco.
    if (v.tipo === "efectivo" && v.cuenta_id !== "none") {
      const cta = (cuentas ?? []).find((c) => c.id === v.cuenta_id);
      if (cta) {
        const nuevo = Number(cta.saldo || 0) + monto;
        await supabase.from("fema_cuentas_bancarias").update({ saldo: nuevo }).eq("id", cta.id);
        await supabase.from("fema_caja_mov").insert({
          user_id: user!.id, fecha: v.fecha, cuenta_id: cta.id, tipo: "ingreso",
          monto, concepto: `Devolución de préstamo — ${prestamo.concepto}`, saldo_resultante: nuevo,
        });
      }
    }

    if (monto >= saldo - 0.01) {
      await supabase.from("fema_empleado_prestamos").update({ estado: "cancelado" }).eq("id", prestamo.id);
    }
    toast.success(`Devolución registrada por ${formatPesos(monto)}`);
    invalidarPrestamos(qc);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar devolución — {prestamo.concepto}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Saldo pendiente: <b>{formatPesos(saldo)}</b></p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importe ($)</Label>
              <Input type="number" step="0.01" value={v.monto} onChange={(e) => set("monto", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={v.tipo} onValueChange={(x) => set("tipo", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Entrega en efectivo</SelectItem>
                <SelectItem value="descuento">Descuento de sueldo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {v.tipo === "efectivo" && (
            <div className="space-y-1.5">
              <Label>Ingresa a la cuenta / caja</Label>
              <Select value={v.cuenta_id} onValueChange={(x) => set("cuenta_id", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Solo registrar (no mueve caja)</SelectItem>
                  {(cuentas ?? []).filter((c) => c.activa !== false).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.banco ?? c.alias ?? "Cuenta"} — {formatPesos(c.saldo ?? 0)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Observaciones (opcional)</Label>
            <Textarea rows={2} value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====== PESTAÑA PRINCIPAL ======
export function PrestamosEmpleadoTab() {
  const qc = useQueryClient();
  const { data: prestamos } = usePrestamos();
  const { data: movs } = usePrestamoMovs();
  const { data: empleados } = useEmpleados();
  const [empF, setEmpF] = useState("all");
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});
  const [cobrar, setCobrar] = useState<{ p: Prestamo; saldo: number } | null>(null);

  const empMap = useMemo(
    () => Object.fromEntries((empleados ?? []).map((e) => [e.id, e.nombre])),
    [empleados],
  );

  const movsPorPrestamo = useMemo(() => {
    const m: Record<string, PrestamoMov[]> = {};
    for (const mv of movs ?? []) (m[mv.prestamo_id] ??= []).push(mv);
    return m;
  }, [movs]);

  const saldoDe = (p: Prestamo) =>
    Number(p.monto ?? 0) - (movsPorPrestamo[p.id] ?? []).reduce((a, m) => a + Number(m.monto ?? 0), 0);

  const lista = useMemo(() => {
    let l = prestamos ?? [];
    if (empF !== "all") l = l.filter((p) => p.empleado_id === empF);
    if (!verSaldadas) l = l.filter((p) => saldoDe(p) > 0.01);
    return l;
  }, [prestamos, empF, verSaldadas, movsPorPrestamo]);

  const resumen = useMemo(() => saldosPorEmpleado(prestamos ?? [], movs ?? []), [prestamos, movs]);
  const totalAdeudado = Object.values(resumen).reduce((a, r) => a + Math.max(0, r.saldo), 0);

  const borrar = async (p: Prestamo) => {
    if (!confirm("¿Eliminar esta deuda y sus devoluciones registradas?")) return;
    const { error } = await supabase.from("fema_empleado_prestamos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    invalidarPrestamos(qc);
  };

  const borrarMov = async (mv: PrestamoMov) => {
    if (!confirm("¿Eliminar esta devolución?")) return;
    const { error } = await supabase.from("fema_empleado_prestamo_mov").delete().eq("id", mv.id);
    if (error) return toast.error(error.message);
    toast.success("Devolución eliminada");
    invalidarPrestamos(qc);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={empF} onValueChange={setEmpF}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los empleados</SelectItem>
            {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={verSaldadas ? "default" : "outline"} onClick={() => setVerSaldadas((s) => !s)}>
          {verSaldadas ? "Viendo todas" : "Solo con saldo"}
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Total adeudado a la empresa: <b className="text-foreground">{formatPesos(totalAdeudado)}</b>
          </span>
          <NuevoPrestamoDialog />
        </div>
      </div>

      {/* Saldos por empleado */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead className="text-right">Tomado</TableHead>
              <TableHead className="text-right">Devuelto</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(resumen).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                Todavía no hay deudas ni préstamos cargados.
              </TableCell></TableRow>
            )}
            {Object.entries(resumen).map(([id, r]) => (
              <TableRow key={id}>
                <TableCell>{empMap[id] ?? "—"}</TableCell>
                <TableCell className="text-right">{formatPesos(r.tomado)}</TableCell>
                <TableCell className="text-right">{formatPesos(r.devuelto)}</TableCell>
                <TableCell className="text-right font-medium">
                  {r.saldo > 0.01
                    ? <span className="text-destructive">{formatPesos(r.saldo)}</span>
                    : <Badge variant="secondary">Al día</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detalle */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead>
              <TableHead>Empleado</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">Cuota</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                Sin registros para mostrar.
              </TableCell></TableRow>
            )}
            {lista.map((p) => {
              const saldo = saldoDe(p);
              const detalleMovs = movsPorPrestamo[p.id] ?? [];
              const open = !!abierto[p.id];
              return (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-7"
                        onClick={() => setAbierto((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>{formatFecha(p.fecha)}</TableCell>
                    <TableCell>{empMap[p.empleado_id] ?? "—"}</TableCell>
                    <TableCell>
                      <div>{p.concepto}</div>
                      {p.factura_compra_id && <span className="text-xs text-muted-foreground">Compra facturada a FEMA</span>}
                    </TableCell>
                    <TableCell className="text-right">{formatPesos(p.monto)}</TableCell>
                    <TableCell className="text-right">{formatPesos(p.valor_cuota)} × {p.cuotas}</TableCell>
                    <TableCell className="text-right font-medium">
                      {saldo > 0.01
                        ? <span className="text-destructive">{formatPesos(saldo)}</span>
                        : <Badge variant="secondary">Saldado</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {saldo > 0.01 && (
                          <Button size="sm" variant="outline" onClick={() => setCobrar({ p, saldo })}>
                            <HandCoins className="size-4 mr-1" /> Cobrar
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => borrar(p)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={7}>
                        {p.detalle && <p className="text-sm text-muted-foreground mb-2">{p.detalle}</p>}
                        {detalleMovs.length === 0
                          ? <p className="text-sm text-muted-foreground">Sin devoluciones registradas.</p>
                          : (
                            <div className="space-y-1">
                              {detalleMovs.map((mv) => (
                                <div key={mv.id} className="flex items-center gap-3 text-sm">
                                  <Wallet className="size-4 text-muted-foreground" />
                                  <span>{formatFecha(mv.fecha)}</span>
                                  <span>{TIPO_MOV[mv.tipo] ?? mv.tipo}</span>
                                  <span className="font-medium">{formatPesos(mv.monto)}</span>
                                  {mv.observaciones && <span className="text-muted-foreground">{mv.observaciones}</span>}
                                  <Button size="icon" variant="ghost" className="size-7 ml-auto" onClick={() => borrarMov(mv)}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {cobrar && <CobroPrestamoDialog prestamo={cobrar.p} saldo={cobrar.saldo} onClose={() => setCobrar(null)} />}
    </div>
  );
}
