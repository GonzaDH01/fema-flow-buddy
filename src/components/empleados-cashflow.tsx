import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { useYear } from "@/lib/year-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TIPO: Record<string, string> = { sueldo: "Sueldo", hectareas: "Hectáreas", extra: "Extra / bono", adelanto: "Adelanto", alquiler: "Alquiler" };

/** Flujo de caja del personal: pagos ya realizados (real) vs. pendientes o programados (proyectado). */
export function CashflowPersonalTab() {
  const { year } = useYear();
  const [mes, setMes] = useState("all");
  const { data: pagos = [] } = useQuery({
    queryKey: ["fema_pagos_empleado_cashflow", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_pagos_empleado")
        .select("id,fecha,monto,estado,forma_pago,tipo_pago,tareas,empleado_id,fema_empleados(nombre)")
        .gte("fecha", `${year}-01-01`).lte("fecha", `${year}-12-31`).neq("estado", "anulado").order("fecha");
      if (error) throw error;
      return data ?? [];
    },
  });
  const filas = useMemo(
    () => pagos.filter((p: any) => mes === "all" || Number(p.fecha.slice(5, 7)) === Number(mes)),
    [pagos, mes],
  );
  const real = filas.filter((p: any) => p.estado === "pagado").reduce((a: number, p: any) => a + Number(p.monto ?? 0), 0);
  const proy = filas.filter((p: any) => p.estado !== "pagado").reduce((a: number, p: any) => a + Number(p.monto ?? 0), 0);
  const porMedio = filas.filter((p: any) => p.estado === "pagado").reduce((acc: Record<string, number>, p: any) => {
    const k = p.forma_pago || "Sin medio"; acc[k] = (acc[k] ?? 0) + Number(p.monto ?? 0); return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Pagado (real)" v={formatPesos(real)} />
        <Kpi label="Pendiente / programado (proyectado)" v={formatPesos(proy)} />
        <Kpi label="Total del período" v={formatPesos(real + proy)} />
      </div>
      {Object.keys(porMedio).length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(porMedio).map(([k, v]) => <Badge key={k} variant="secondary">{k}: {formatPesos(v)}</Badge>)}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Flujo de caja del personal {year}</CardTitle>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el año</SelectItem>
              {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Empleado</TableHead><TableHead>Concepto</TableHead>
              <TableHead>Medio</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Importe</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin pagos en el período</TableCell></TableRow>}
              {filas.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{formatFecha(p.fecha)}</TableCell>
                  <TableCell className="font-medium">{p.fema_empleados?.nombre ?? "—"}</TableCell>
                  <TableCell>{TIPO[p.tipo_pago] ?? p.tipo_pago}{p.tareas ? <span className="text-muted-foreground"> · {p.tareas}</span> : null}</TableCell>
                  <TableCell>{p.forma_pago ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.estado === "pagado" ? "default" : "outline"}>{p.estado === "pagado" ? "real" : "proyectado"}</Badge></TableCell>
                  <TableCell className="text-right">{formatPesos(Number(p.monto ?? 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, v }: { label: string; v: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{v}</div></div>;
}
