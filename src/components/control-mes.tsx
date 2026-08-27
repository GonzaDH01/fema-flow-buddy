import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { esComprobanteInformativo } from "@/lib/finanzas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sb = supabase as any;

const INSTRUMENTO_LABEL: Record<string, string> = {
  echeq: "E-cheq",
  cheque_fisico: "Cheque físico",
  transferencia: "Transferencia",
  cesion: "Cesión de e-cheq",
  efectivo: "Efectivo",
  otro: "Otro",
};

type Pago = {
  id: string;
  factura_id: string;
  fecha: string;
  instrumento: string;
  estado: string;
  numero: string | null;
  monto: number;
  dentro: boolean;
};

const ultimoDia = (anio: number, mes: number) =>
  new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

export function ControlMes() {
  const { user } = useAuth();
  const { year } = useYear();
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);

  const desde = `${year}-${String(mes).padStart(2, "0")}-01`;
  const hasta = ultimoDia(year, mes);

  const { data, isLoading } = useQuery({
    queryKey: ["control_mes_compras", user?.id, year, mes],
    enabled: !!user,
    queryFn: async () => {
      const { data: facturas, error } = await sb
        .from("fema_facturas_compra")
        .select("id,fecha,numero,total,tipo_comprobante,categoria,descripcion,proveedor_id,estado,fema_proveedores(nombre)")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });
      if (error) throw error;

      const ids = (facturas ?? []).map((f: any) => f.id);
      if (ids.length === 0) return { facturas: facturas ?? [], pagos: [] as Pago[] };

      const [{ data: movs, error: e1 }, { data: imps, error: e2 }] = await Promise.all([
        sb.from("fema_movimientos_pago")
          .select("id,factura_compra_id,fecha_emision,vencimiento,instrumento,estado,numero,monto,direccion")
          .in("factura_compra_id", ids),
        sb.from("fema_imputaciones")
          .select("id,factura_compra_id,movimiento_pago_id,monto,fecha")
          .in("factura_compra_id", ids),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const movIds = [...new Set((imps ?? []).map((i: any) => i.movimiento_pago_id).filter(Boolean))];
      let movsImp: any[] = [];
      if (movIds.length > 0) {
        const { data: mi, error: e3 } = await sb.from("fema_movimientos_pago")
          .select("id,instrumento,estado,numero,fecha_emision")
          .in("id", movIds);
        if (e3) throw e3;
        movsImp = mi ?? [];
      }
      const movById = new Map(movsImp.map((m: any) => [m.id, m]));
      const conImputacion = new Set((imps ?? []).map((i: any) => i.movimiento_pago_id));

      const dentroDelMes = (f?: string | null) => !!f && f >= desde && f <= hasta;
      const pagos: Pago[] = [];

      for (const m of (movs ?? []) as any[]) {
        if (conImputacion.has(m.id)) continue;
        const confirmado = m.estado === "pagado" || m.estado === "cedido"
          || (m.estado === "en_cartera" && m.direccion === "pago");
        if (!confirmado) continue;
        pagos.push({
          id: m.id,
          factura_id: m.factura_compra_id,
          fecha: m.fecha_emision,
          instrumento: m.instrumento,
          estado: m.estado,
          numero: m.numero,
          monto: Number(m.monto || 0),
          dentro: dentroDelMes(m.fecha_emision),
        });
      }

      for (const i of (imps ?? []) as any[]) {
        const m = movById.get(i.movimiento_pago_id) as any;
        const fecha = i.fecha ?? m?.fecha_emision ?? null;
        pagos.push({
          id: i.id,
          factura_id: i.factura_compra_id,
          fecha,
          instrumento: m?.instrumento ?? "otro",
          estado: m?.estado ?? "—",
          numero: m?.numero ?? null,
          monto: Number(i.monto || 0),
          dentro: dentroDelMes(fecha),
        });
      }

      return { facturas: facturas ?? [], pagos };
    },
  });

  const facturas = (data?.facturas ?? []) as any[];
  const pagos = (data?.pagos ?? []) as Pago[];

  const filas = useMemo(() => {
    return facturas.map((f) => {
      const info = esComprobanteInformativo(f.tipo_comprobante);
      const propios = pagos.filter((p) => p.factura_id === f.id);
      const dentro = propios.filter((p) => p.dentro).reduce((s, p) => s + p.monto, 0);
      const fuera = propios.filter((p) => !p.dentro).reduce((s, p) => s + p.monto, 0);
      const total = info ? 0 : Number(f.total || 0);
      const deuda = Math.max(0, total - dentro - fuera);
      return {
        ...f,
        info,
        proveedor: f.fema_proveedores?.nombre ?? "—",
        totalReal: total,
        dentro,
        fuera,
        deuda,
        pagos: propios,
      };
    });
  }, [facturas, pagos]);

  const kpis = useMemo(() => {
    const activas = filas.filter((f) => !f.info);
    return {
      cantidad: filas.length,
      total: activas.reduce((s, f) => s + f.totalReal, 0),
      dentro: activas.reduce((s, f) => s + f.dentro, 0),
      fuera: activas.reduce((s, f) => s + f.fuera, 0),
      deuda: activas.reduce((s, f) => s + f.deuda, 0),
      informativas: filas.filter((f) => f.info).reduce((s, f) => s + Number(f.total || 0), 0),
    };
  }, [filas]);

  const porInstrumento = useMemo(() => {
    const map: Record<string, { dentro: number; fuera: number }> = {};
    for (const p of pagos) {
      const k = p.instrumento || "otro";
      map[k] = map[k] ?? { dentro: 0, fuera: 0 };
      if (p.dentro) map[k].dentro += p.monto;
      else map[k].fuera += p.monto;
    }
    return Object.entries(map).sort((a, b) =>
      (b[1].dentro + b[1].fuera) - (a[1].dentro + a[1].fuera));
  }, [pagos]);

  const detallePagos = useMemo(() => {
    const nombre = new Map(filas.map((f) => [f.id, `${f.proveedor} · ${f.numero ?? "s/n"}`]));
    return [...pagos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map((p) => ({ ...p, etiqueta: nombre.get(p.factura_id) ?? "—" }));
  }, [pagos, filas]);

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.map((f) => ({
      Fecha: f.fecha,
      Comprobante: f.tipo_comprobante ?? "",
      Numero: f.numero ?? "",
      Proveedor: f.proveedor,
      Categoria: f.categoria ?? "",
      Descripcion: f.descripcion ?? "",
      Total: f.info ? 0 : f.totalReal,
      "Pagado en el mes": f.dentro,
      "Pagado fuera del mes": f.fuera,
      Deuda: f.deuda,
      Informativa: f.info ? "Sí" : "No",
    }))), "Facturas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detallePagos.map((p) => ({
      Fecha: p.fecha ?? "",
      Factura: p.etiqueta,
      Instrumento: INSTRUMENTO_LABEL[p.instrumento] ?? p.instrumento,
      Numero: p.numero ?? "",
      Estado: p.estado,
      Monto: p.monto,
      Momento: p.dentro ? "Dentro del mes" : "Fuera del mes",
    }))), "Pagos");
    XLSX.writeFile(wb, `control-${MESES_LARGOS[mes - 1]}-${year}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Control mensual para el contador</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_LARGOS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m} {year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportar}>
              <FileDown className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label={`Facturas de ${MESES_LARGOS[mes - 1]}`} value={String(kpis.cantidad)} />
          <Kpi label="Total facturado" value={formatPesos(kpis.total)} />
          <Kpi label="Pagado dentro del mes" value={formatPesos(kpis.dentro)} tone="text-emerald-400" />
          <Kpi label="Pagado fuera del mes" value={formatPesos(kpis.fuera)} tone="text-amber-400" />
          <Kpi label="Queda como deuda" value={formatPesos(kpis.deuda)} tone="text-red-400" />
        </CardContent>
      </Card>

      <Tabs defaultValue="facturas">
        <TabsList>
          <TabsTrigger value="facturas">Facturas del mes</TabsTrigger>
          <TabsTrigger value="pagos">Detalle de pagos</TabsTrigger>
          <TabsTrigger value="medios">Por medio de pago</TabsTrigger>
        </TabsList>

        <TabsContent value="facturas" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nº factura</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pagado en el mes</TableHead>
                    <TableHead className="text-right">Pagado fuera del mes</TableHead>
                    <TableHead className="text-right">Deuda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
                  )}
                  {!isLoading && filas.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin facturas en {MESES_LARGOS[mes - 1]} {year}</TableCell></TableRow>
                  )}
                  {filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{formatFecha(f.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{f.numero ?? "—"}</TableCell>
                      <TableCell>
                        {f.proveedor}
                        {f.info && <Badge variant="outline" className="ml-2">Informativa</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{String(f.categoria ?? "").replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right">{f.info ? "—" : formatPesos(f.totalReal)}</TableCell>
                      <TableCell className="text-right text-emerald-400">{f.dentro ? formatPesos(f.dentro) : "—"}</TableCell>
                      <TableCell className="text-right text-amber-400">{f.fuera ? formatPesos(f.fuera) : "—"}</TableCell>
                      <TableCell className="text-right text-red-400">{f.deuda > 0.01 ? formatPesos(f.deuda) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {filas.length > 0 && (
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell colSpan={4}>Totales</TableCell>
                      <TableCell className="text-right">{formatPesos(kpis.total)}</TableCell>
                      <TableCell className="text-right">{formatPesos(kpis.dentro)}</TableCell>
                      <TableCell className="text-right">{formatPesos(kpis.fuera)}</TableCell>
                      <TableCell className="text-right">{formatPesos(kpis.deuda)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagos" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha del pago</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Medio de pago</TableHead>
                    <TableHead>Nº</TableHead>
                    <TableHead>Momento</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detallePagos.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin pagos registrados para las facturas del mes</TableCell></TableRow>
                  )}
                  {detallePagos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatFecha(p.fecha)}</TableCell>
                      <TableCell>{p.etiqueta}</TableCell>
                      <TableCell>{INSTRUMENTO_LABEL[p.instrumento] ?? p.instrumento}</TableCell>
                      <TableCell className="font-mono text-xs">{p.numero ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.dentro
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                          : "border-amber-500/30 bg-amber-500/15 text-amber-400"}>
                          {p.dentro ? "Dentro del mes" : "Fuera del mes"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatPesos(p.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medios" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medio de pago</TableHead>
                    <TableHead className="text-right">Emitido dentro del mes</TableHead>
                    <TableHead className="text-right">Emitido fuera del mes</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porInstrumento.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin pagos</TableCell></TableRow>
                  )}
                  {porInstrumento.map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{INSTRUMENTO_LABEL[k] ?? k}</TableCell>
                      <TableCell className="text-right text-emerald-400">{formatPesos(v.dentro)}</TableCell>
                      <TableCell className="text-right text-amber-400">{formatPesos(v.fuera)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPesos(v.dentro + v.fuera)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
