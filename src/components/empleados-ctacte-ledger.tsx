import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePrestamos, usePrestamoMovs } from "@/components/empleados-prestamos";

type Linea = { fecha: string; concepto: string; debe: number; haber: number };

const TIPO_DEV: Record<string, string> = {
  descuento: "Devolución por descuento de sueldo",
  efectivo: "Devolución en efectivo / transferencia",
  otro: "Devolución / compensación",
};

/** Libro Debe / Haber / Saldo por empleado. Debe = lo que el empleado debe a FEMA. */
export function CuentaCorrienteLedger() {
  const [empId, setEmpId] = useState<string>("");
  const { data: prestamos = [] } = usePrestamos();
  const { data: movs = [] } = usePrestamoMovs();
  const { data: empleados = [] } = useQuery({
    queryKey: ["fema_empleados_ledger"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleados").select("id,nombre,cuil,activo").order("nombre");
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

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 print:hidden">
        <CardTitle>Cuenta corriente individual</CardTitle>
        <div className="flex gap-2">
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
            <SelectContent>
              {empleados.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nombre}{e.activo === false ? " (inactivo)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!empId} onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir ficha</Button>
        </div>
      </CardHeader>
      {empId && (
        <CardContent className="space-y-4 ctacte-print">
          <div className="hidden print:block border-b pb-2">
            <div className="text-lg font-bold">FEMA AGRONEGOCIOS S.A.S. — CUIT 30-71914814-6</div>
            <div>Cuenta corriente de {emp?.nombre}{emp?.cuil ? ` — CUIL ${emp.cuil}` : ""}</div>
            <div className="text-xs">Emitido el {formatFecha(new Date().toISOString().slice(0, 10))}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Total financiado (Debe)" v={formatPesos(totDebe)} />
            <Kpi label="Total devuelto (Haber)" v={formatPesos(totHaber)} />
            <Kpi label="Saldo que adeuda" v={formatPesos(totDebe - totHaber)} />
          </div>
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
