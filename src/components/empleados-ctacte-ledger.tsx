import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Printer, ArrowLeft, Wallet, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NuevoPagoDialog } from "@/components/empleados-pagos";
import { NuevoPrestamoDialog, CobroPrestamoDialog, type Prestamo } from "@/components/empleados-prestamos";
import { LiquidarHectareasDialog } from "@/components/empleados-hectareas";
import { supabase } from "@/integrations/supabase/client";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePrestamos, usePrestamoMovs, invalidarPrestamos } from "@/components/empleados-prestamos";

type Linea = { fecha: string; concepto: string; debe: number; haber: number };

const TIPO_DEV: Record<string, string> = {
  descuento: "Devolución por descuento de sueldo",
  efectivo: "Devolución en efectivo / transferencia",
  otro: "Devolución / compensación",
};

/** Libro Debe / Haber / Saldo por empleado. Debe = lo que el empleado debe a FEMA. */
export function CuentaCorrienteLedger({ onIrLiquidador }: { onIrLiquidador?: () => void } = {}) {
  const [empId, setEmpId] = useState<string>("");
  const [devolver, setDevolver] = useState<{ p: Prestamo; resta: number } | null>(null);
  const { data: prestamos = [] } = usePrestamos();
  const { data: movs = [] } = usePrestamoMovs();
  const { data: empleados = [] } = useQuery({
    queryKey: ["fema_empleados_ledger"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleados").select("id,nombre,cuil,activo,funcion,frecuencia_pago").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: pagos = [] } = useQuery({
    queryKey: ["fema_pagos_empleado_ledger", empId],
    enabled: !!empId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_pagos_empleado").select("monto,tipo_pago,estado").eq("empleado_id", empId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const emp = empleados.find((e: any) => e.id === empId) as any;

  const lineas = useMemo(() => {
    const l: Linea[] = [];
    for (const p of prestamos.filter((x) => x.empleado_id === empId)) {
      const tipo = p.factura_compra_id ? "Compra de la empresa" : "Préstamo / adelanto";
      l.push({ fecha: p.fecha, concepto: `${tipo}: ${p.concepto}${p.detalle ? ` — ${p.detalle}` : ""}`, debe: Number(p.monto || 0), haber: 0 });
    }
    for (const m of movs.filter((x) => x.empleado_id === empId)) {
      l.push({ fecha: m.fecha, concepto: `${TIPO_DEV[m.tipo] ?? "Devolución"}${m.observaciones ? ` — ${m.observaciones}` : ""}`, debe: 0, haber: Number(m.monto || 0) });
    }
    l.sort((a, b) => a.fecha.localeCompare(b.fecha));
    let s = 0;
    return l.map((x) => ({ ...x, saldo: (s += x.debe - x.haber) }));
  }, [prestamos, movs, empId]);

  const totDebe = lineas.reduce((a, x) => a + x.debe, 0);
  const totHaber = lineas.reduce((a, x) => a + x.haber, 0);
  const comprasEmpresa = prestamos.filter((p) => p.empleado_id === empId && p.factura_compra_id).reduce((a, p) => a + Number(p.monto || 0), 0);
  const haberes = pagos.filter((p: any) => p.estado !== "anulado").reduce((a: number, p: any) => a + Number(p.monto || 0), 0);
  const ratio = haberes > 0 ? (comprasEmpresa / haberes) * 100 : 0;
  // Doble saldo: lo que la empresa le debe (haberes liquidados sin pagar) vs. lo que el empleado debe.
  const aPagar = pagos.filter((p: any) => p.estado === "pendiente" || p.estado === "programado").reduce((a: number, p: any) => a + Number(p.monto || 0), 0);
  const qc = useQueryClient();
  const abiertas = prestamos.filter((p) => p.empleado_id === empId).map((p) => {
    const devuelto = movs.filter((m: any) => m.prestamo_id === p.id).reduce((a, m) => a + Number(m.monto || 0), 0);
    return { ...p, resta: Math.round((Number(p.monto || 0) - devuelto) * 100) / 100 };
  }).filter((p) => p.resta > 0.009);
  const toggleDescontable = async (id: string, v: boolean) => {
    const { error } = await supabase.from("fema_empleado_prestamos").update({ descontable: v }).eq("id", id);
    if (error) return toast.error(error.message);
    invalidarPrestamos(qc);
  };

  if (!empId) return <ResumenCtaCte empleados={empleados as any[]} prestamos={prestamos} movs={movs} onElegir={setEmpId} />;

  return (
    <Card>
      <CardHeader className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEmpId("")}><ArrowLeft className="mr-1 h-4 w-4" />Volver</Button>
            <CardTitle>Cuenta corriente de {emp?.nombre}</CardTitle>
          </div>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
            <SelectContent>
              {empleados.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nombre}{e.activo === false ? " (inactivo)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <NuevoPagoDialog key={`pago-${empId}`} empleadoId={empId} label="Pago" />
          <NuevoPrestamoDialog key={`cargo-${empId}`} empleadoId={empId} label="Compra o cargo" />
          <Button size="sm" variant="outline" disabled={abiertas.length === 0}
            onClick={() => { const d = abiertas[0]; if (d) setDevolver({ p: d, resta: d.resta }); }}>
            <Wallet className="mr-1 h-4 w-4" />Devolución
          </Button>
          {onIrLiquidador && <Button size="sm" variant="outline" onClick={onIrLiquidador}>Liquidación</Button>}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir ficha</Button>
        </div>
      </CardHeader>
      {devolver && <CobroPrestamoDialog prestamo={devolver.p} saldo={devolver.resta} onClose={() => setDevolver(null)} />}
      {empId && (
        <CardContent className="space-y-4 ctacte-print">
          <div className="hidden print:block border-b pb-2">
            <div className="text-lg font-bold">FEMA AGRONEGOCIOS S.A.S. — CUIT 30-71914814-6</div>
            <div>Cuenta corriente de {emp?.nombre}{emp?.cuil ? ` — CUIL ${emp.cuil}` : ""}</div>
            <div className="text-xs">Emitido el {formatFecha(new Date().toLocaleDateString("en-CA"))}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Total financiado (Debe)" v={formatPesos(totDebe)} />
            <Kpi label="Total devuelto (Haber)" v={formatPesos(totHaber)} />
            <Kpi label="Saldo que adeuda" v={formatPesos(totDebe - totHaber)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi label="La empresa le debe (haberes sin pagar)" v={formatPesos(aPagar)} />
            <Kpi label="El empleado debe" v={formatPesos(totDebe - totHaber)} />
          </div>
          {abiertas.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="font-medium text-sm">Deudas abiertas</div>
              {abiertas.map((d: any) => (
                <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm sm:flex sm:justify-between">
                  <div className="min-w-0">
                    <span className="truncate">{formatFecha(d.fecha)} · {d.concepto}</span>{" "}
                    <span className="text-muted-foreground">falta {formatPesos(d.resta)} de {formatPesos(Number(d.monto))}</span>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 print:hidden">
                    <input type="checkbox" checked={d.descontable !== false} onChange={(e) => toggleDescontable(d.id, e.target.checked)} />
                    Descontable del sueldo
                  </label>
                  <Button size="sm" variant="ghost" className="shrink-0 print:hidden" onClick={() => setDevolver({ p: d, resta: d.resta })}>Registrar devolución</Button>
                  <Badge variant="outline" className="hidden print:inline-flex">{d.descontable !== false ? "Descontable" : "No descontable"}</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-md border border-dashed p-3 text-sm print:hidden">
            <div className="font-medium">Control gerencial (no se imprime)</div>
            <div>Compras de la empresa imputadas: <b>{formatPesos(comprasEmpresa)}</b> · Haberes pagados: <b>{formatPesos(haberes)}</b> · Ratio: <b>{ratio.toFixed(1)}%</b></div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead>
                <TableHead className="text-right">Debe</TableHead><TableHead className="text-right">Haber</TableHead><TableHead className="text-right">Saldo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lineas.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin movimientos</TableCell></TableRow>}
                {lineas.map((x, i) => (
                  <TableRow key={i}>
                    <TableCell>{formatFecha(x.fecha)}</TableCell><TableCell>{x.concepto}</TableCell>
                    <TableCell className="text-right">{x.debe ? formatPesos(x.debe) : ""}</TableCell>
                    <TableCell className="text-right">{x.haber ? formatPesos(x.haber) : ""}</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(x.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Kpi({ label, v }: { label: string; v: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{v}</div></div>;
}

type Prest = { id: string; empleado_id: string; monto: number | string | null };
type Mov = { prestamo_id: string; monto: number | string | null };

/** Vista general: saldos duales por empleado (lo que FEMA debe pagar y lo que cada empleado debe). */
function ResumenCtaCte({ empleados, prestamos, movs, onElegir }: {
  empleados: any[]; prestamos: Prest[]; movs: Mov[]; onElegir: (id: string) => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const { data: pend = [] } = useQuery({
    queryKey: ["fema_pagos_empleado_pendientes_resumen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_pagos_empleado").select("empleado_id,monto,estado").in("estado", ["pendiente", "programado"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: carnets = [] } = useQuery({
    queryKey: ["fema_empleado_carnets_resumen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleado_carnets").select("empleado_id,fecha_vencimiento");
      if (error) throw error;
      return data ?? [];
    },
  });
  const hoy = new Date().toLocaleDateString("en-CA");
  const limite = (() => { const d = new Date(`${hoy}T00:00:00`); d.setDate(d.getDate() + 30); return d.toLocaleDateString("en-CA"); })();
  const carnetsAlerta = carnets.filter((c: any) => c.fecha_vencimiento && c.fecha_vencimiento <= limite).length;

  const filas = useMemo(() => {
    const devuelto: Record<string, number> = {};
    for (const m of movs) devuelto[m.prestamo_id] = (devuelto[m.prestamo_id] ?? 0) + Number(m.monto ?? 0);
    return empleados
      .filter((e) => (verInactivos || e.activo !== false) && e.nombre.toLowerCase().includes(buscar.toLowerCase()))
      .map((e) => {
        const adeuda = prestamos.filter((p) => p.empleado_id === e.id)
          .reduce((a, p) => a + Math.max(0, Number(p.monto ?? 0) - (devuelto[p.id] ?? 0)), 0);
        const aPagar = pend.filter((p: any) => p.empleado_id === e.id).reduce((a: number, p: any) => a + Number(p.monto ?? 0), 0);
        return { e, adeuda: Math.round(adeuda * 100) / 100, aPagar };
      });
  }, [empleados, prestamos, movs, pend, buscar, verInactivos]);
  const totPagar = filas.reduce((a, f) => a + f.aPagar, 0);
  const totAdeuda = filas.reduce((a, f) => a + f.adeuda, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="La empresa debe pagar" v={formatPesos(totPagar)} />
        <Kpi label="Los empleados deben" v={formatPesos(totAdeuda)} />
        <Kpi label="Carnets vencidos / por vencer (≤30 días)" v={String(carnetsAlerta)} />
      </div>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Saldos por empleado</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="w-56 pl-8" placeholder="Buscar empleado..." value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              </div>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />Inactivos</label>
              <LiquidarHectareasDialog />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Tocá un empleado para ver su ficha y cargar pagos, compras, devoluciones o liquidaciones.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Empleado</TableHead><TableHead>Función</TableHead><TableHead>Frecuencia</TableHead>
              <TableHead className="text-right">A pagar</TableHead><TableHead className="text-right">Adeuda</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filas.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin empleados</TableCell></TableRow>}
              {filas.map(({ e, aPagar, adeuda }) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => onElegir(e.id)}>
                  <TableCell className="font-medium">{e.nombre}{e.activo === false && <Badge variant="outline" className="ml-2">inactivo</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground">{e.funcion ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.frecuencia_pago ?? "—"}</TableCell>
                  <TableCell className="text-right">{aPagar ? formatPesos(aPagar) : "—"}</TableCell>
                  <TableCell className={`text-right ${adeuda ? "font-semibold text-destructive" : ""}`}>{adeuda ? formatPesos(adeuda) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
