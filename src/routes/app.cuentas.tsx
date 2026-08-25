import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPesos, formatFecha } from "@/lib/format";
import { saldoFactura, esComprobanteInformativo } from "@/lib/finanzas";

export const Route = createFileRoute("/app/cuentas")({ component: Page });

type Fact = {
  id: string;
  fecha: string;
  numero: string | null;
  total: number;
  tercero_id: string | null;
};
type SaldoRow = { pagado: number; programado: number; prox: string | null };
export type PagoDetalle = {
  id: string;
  etiqueta: string;
  detalle: string;
  monto: number;
  fecha: string | null;
  estado: string;
  confirmado: boolean;
};
type Linea = Fact & {
  pagado: number;
  programado: number;
  saldo: number;
  dias: number;
  prox: string | null;
  pagos: PagoDetalle[];
  pendiente: boolean;
  informativo: boolean;
  tipoComprobante: string | null;
};
type Cuenta = {
  id: string;
  nombre: string;
  cuit: string | null;
  lineas: Linea[];
  total: number;
  pagado: number;
  programado: number;
  saldo: number;
  vencido: number;
  aVencer: number;
  pendientes: number;
  informativos: number;
};

const diasDesde = (f: string) => {
  const ms = Date.now() - new Date(`${f}T00:00:00`).getTime();
  return Math.floor(ms / 86_400_000);
};

const ESTADO_LABEL: Record<string, string> = {
  en_cartera: "En cartera",
  cobrado: "Cobrado",
  pagado: "Pagado",
  cedido: "Cedido",
  vencido: "Vencido",
  anulado: "Anulado",
};

const INSTRUMENTO_LABEL: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  echeq: "Echeq",
  cheque_fisico: "Cheque físico",
  cesion: "Echeq cedido",
  deposito: "Depósito",
  retencion: "Retención",
};

/** Describe cómo se abonó/cobró: echeq propio, cedido, transferencia, etc. */
function etiquetaPago(m: any, esCompra: boolean): string {
  const cedido = m.instrumento === "cesion" || !!m.echeq_origen_id;
  if (cedido) return "Echeq cedido";
  if (m.instrumento === "echeq" || m.instrumento === "cheque_fisico") {
    const base = m.instrumento === "echeq" ? "Echeq" : "Cheque";
    if (esCompra) return `${base} propio`;
    return `${base} de tercero`;
  }
  return INSTRUMENTO_LABEL[m.instrumento] ?? m.instrumento ?? "Movimiento";
}

const CONFIRMADOS_COMPRA = new Set(["pagado", "cedido"]);

function useCuentas(tipo: "compra" | "venta", anio: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fema_cuentas_corrientes", tipo, anio, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Cuenta[]> => {
      const esCompra = tipo === "compra";
      const tablaFact = esCompra ? "fema_facturas_compra" : "fema_facturas_venta";
      const tablaEnt = esCompra ? "fema_proveedores" : "fema_clientes";
      const vista = esCompra ? "fema_v_saldos_compra" : "fema_v_saldos_venta";
      const fk = esCompra ? "proveedor_id" : "cliente_id";

      const [fRes, eRes, sRes, mRes, iRes] = await Promise.all([
        (supabase as any)
          .from(tablaFact)
          .select(`id,fecha,numero,total,tipo_comprobante,categoria,${fk}`)
          .lte("fecha", `${anio}-12-31`)
          .order("fecha", { ascending: true }),
        supabase.from(tablaEnt as any).select("id,nombre,cuit"),
        (supabase as any)
          .from(vista)
          .select(
            esCompra
              ? "factura_id,pagado,programado,proximo_vencimiento"
              : "factura_id,cobrado,programado,proximo_vencimiento",
          ),
        (supabase as any)
          .from("fema_movimientos_pago")
          .select(
            "id,instrumento,direccion,estado,numero,banco,contraparte,monto,fecha_emision,vencimiento,echeq_origen_id,factura_compra_id,factura_venta_id",
          )
          .not(esCompra ? "factura_compra_id" : "factura_venta_id", "is", null),
        (supabase as any)
          .from("fema_imputaciones")
          .select("id,movimiento_pago_id,monto,fecha,factura_compra_id,factura_venta_id")
          .not(esCompra ? "factura_compra_id" : "factura_venta_id", "is", null),
      ]);
      if (fRes.error) throw fRes.error;
      if (eRes.error) throw eRes.error;
      if (sRes.error) throw sRes.error;
      if (mRes.error) throw mRes.error;
      if (iRes.error) throw iRes.error;

      const movs: Record<string, any> = Object.fromEntries(
        ((mRes.data ?? []) as any[]).map((m) => [m.id, m]),
      );
      const facCol = esCompra ? "factura_compra_id" : "factura_venta_id";
      const pagosPorFactura: Record<string, PagoDetalle[]> = {};
      const movsImputados = new Set<string>();

      const armar = (m: any, monto: number, fecha: string | null, id: string): PagoDetalle => {
        const partes = [
          m.numero ? `Nº ${m.numero}` : null,
          m.banco || null,
          m.contraparte || null,
        ].filter(Boolean);
        const confirmado = esCompra
          ? CONFIRMADOS_COMPRA.has(m.estado)
          : m.estado === "cobrado";
        return {
          id,
          etiqueta: etiquetaPago(m, esCompra),
          detalle: partes.join(" · "),
          monto,
          fecha: fecha ?? m.vencimiento ?? m.fecha_emision ?? null,
          estado: ESTADO_LABEL[m.estado] ?? m.estado,
          confirmado,
        };
      };

      for (const imp of ((iRes.data ?? []) as any[])) {
        const fid = imp[facCol];
        const m = movs[imp.movimiento_pago_id];
        if (!fid || !m) continue;
        movsImputados.add(m.id);
        (pagosPorFactura[fid] ??= []).push(
          armar(m, Number(imp.monto || 0), imp.fecha ?? null, imp.id),
        );
      }
      for (const m of ((mRes.data ?? []) as any[])) {
        const fid = m[facCol];
        if (!fid || movsImputados.has(m.id)) continue;
        (pagosPorFactura[fid] ??= []).push(armar(m, Number(m.monto || 0), null, m.id));
      }
      for (const lista of Object.values(pagosPorFactura)) {
        lista.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
      }

      const saldos: Record<string, SaldoRow> = {};
      for (const r of (sRes.data ?? []) as any[]) {
        saldos[r.factura_id] = {
          pagado: Number((esCompra ? r.pagado : r.cobrado) || 0),
          programado: Number(r.programado || 0),
          prox: r.proximo_vencimiento ?? null,
        };
      }
      const ents = Object.fromEntries(
        ((eRes.data ?? []) as any[]).map((e) => [e.id, e]),
      );

      const acc: Record<string, Cuenta> = {};
      for (const raw of ((fRes.data ?? []) as any[])) {
        // Franco abona con su tarjeta personal: no genera deuda en cuenta corriente.
        if (raw.categoria === "Franco_Particular") continue;
        // Notas de crédito/débito: se muestran en la cuenta corriente
        // (las emite el proveedor) pero no generan saldo a pagar.
        const informativo = esComprobanteInformativo(raw.tipo_comprobante);
        const f: Fact = {
          id: raw.id,
          fecha: raw.fecha,
          numero: raw.numero,
          total: Number(raw.total || 0),
          tercero_id: raw[fk] ?? null,
        };
        const s = saldos[f.id] ?? { pagado: 0, programado: 0, prox: null };
        const saldo = informativo ? 0 : saldoFactura(f.total, s.pagado, s.programado);
        const key = f.tercero_id ?? "__sin__";
        const ent = f.tercero_id ? ents[f.tercero_id] : null;
        acc[key] ??= {
          id: key,
          nombre: ent?.nombre ?? "Sin asignar",
          cuit: ent?.cuit ?? null,
          lineas: [],
          total: 0,
          pagado: 0,
          programado: 0,
          saldo: 0,
          vencido: 0,
          aVencer: 0,
          pendientes: 0,
          informativos: 0,
        };
        const dias = diasDesde(f.fecha);
        const linea: Linea = {
          ...f,
          pagado: s.pagado,
          programado: s.programado,
          saldo,
          dias,
          prox: s.prox,
          pagos: pagosPorFactura[f.id] ?? [],
          pendiente: !informativo && (saldo > 0.01 || s.programado > 0.01),
          informativo,
          tipoComprobante: raw.tipo_comprobante ?? null,
        };
        const c = acc[key]!;
        c.lineas.push(linea);
        if (informativo) {
          c.informativos += 1;
          continue;
        }
        if (!linea.pendiente) continue;
        c.pendientes += 1;
        c.total += f.total;
        c.pagado += s.pagado;
        c.programado += s.programado;
        c.saldo += saldo;
        if (dias > 30) c.vencido += saldo;
        else c.aVencer += saldo;
      }
      return Object.values(acc).sort((a, b) => b.saldo - a.saldo);
    },
  });
}

function Panel({ tipo, anio }: { tipo: "compra" | "venta"; anio: number }) {
  const { data, isLoading } = useCuentas(tipo, anio);
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const esCompra = tipo === "compra";

  const rows = useMemo(() => {
    let all = data ?? [];
    if (!verTodas) all = all.filter((c) => c.pendientes > 0 || c.informativos > 0);
    if (!q.trim()) return all;
    const s = q.toLowerCase();
    return all.filter(
      (c) => c.nombre.toLowerCase().includes(s) || (c.cuit ?? "").toLowerCase().includes(s),
    );
  }, [data, q, verTodas]);

  const tot = useMemo(
    () =>
      rows.reduce(
        (a, c) => ({
          saldo: a.saldo + c.saldo,
          vencido: a.vencido + c.vencido,
          programado: a.programado + c.programado,
        }),
        { saldo: 0, vencido: 0, programado: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {esCompra ? "Total a pagar" : "Total a cobrar"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatPesos(tot.saldo)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Vencido (+30 días)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold text-destructive">
            {formatPesos(tot.vencido)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {esCompra ? "Documentos emitidos a debitar" : "Documentos en cartera a cobrar"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatPesos(tot.programado)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            {esCompra ? "Cuenta corriente de proveedores" : "Cuenta corriente de clientes"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {rows.length} de {(data ?? []).length} con comprobantes cargados
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id={`todas-${tipo}`} checked={verTodas} onCheckedChange={setVerTodas} />
              <Label htmlFor={`todas-${tipo}`} className="text-xs text-muted-foreground">
                Ver también canceladas
              </Label>
            </div>
            <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={esCompra ? "Buscar proveedor..." : "Buscar cliente..."}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-52 pl-8 md:w-64"
            />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{esCompra ? "Proveedor" : "Cliente"}</th>
                <th className="px-3 py-2 text-right">Comprobante</th>
                <th className="px-3 py-2 text-right">Facturado</th>
                <th className="px-3 py-2 text-right">{esCompra ? "Pagado" : "Cobrado"}</th>
                <th className="px-3 py-2 text-right">Programado</th>
                <th className="px-3 py-2 text-right">Vencido</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Cargando...</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin saldos pendientes</td></tr>
              )}
              {rows.map((c) => {
                const open = abierta === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b hover:bg-muted/40"
                      onClick={() => setAbierta(open ? null : c.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {c.nombre}
                        </div>
                        {c.cuit && <div className="pl-5.5 text-xs text-muted-foreground">{c.cuit}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {verTodas ? c.lineas.length : c.pendientes + c.informativos}
                      </td>
                      <td className="px-3 py-2 text-right">{formatPesos(c.total)}</td>
                      <td className="px-3 py-2 text-right">{formatPesos(c.pagado)}</td>
                      <td className="px-3 py-2 text-right">{formatPesos(c.programado)}</td>
                      <td className="px-3 py-2 text-right">
                        {c.vencido > 0.01
                          ? <span className="font-medium text-destructive">{formatPesos(c.vencido)}</span>
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatPesos(c.saldo)}</td>
                    </tr>
                    {open && (
                      <tr key={`${c.id}-det`} className="border-b bg-muted/20">
                        <td colSpan={7} className="px-3 py-3">
                          <table className="w-full text-xs">
                             <thead className="text-muted-foreground">
                               <tr>
                                 <th className="py-1 text-left">Fecha</th>
                                 <th className="py-1 text-left">Comprobante</th>
                                 <th className="py-1 text-left">Estado</th>
                                 <th className="py-1 text-right">Total</th>
                                 <th className="py-1 text-right">{esCompra ? "Pagado" : "Cobrado"}</th>
                                 <th className="py-1 text-right">Programado</th>
                                 <th className="py-1 text-right">Saldo</th>
                                 <th className="py-1 text-right">Antigüedad</th>
                                 <th className="py-1 text-right">Próx. vto.</th>
                               </tr>
                             </thead>
                             <tbody>
                               {(verTodas
                                 ? c.lineas
                                 : c.lineas.filter((l) => l.pendiente || l.informativo)
                               ).map((l) => (
                                 <Fragment key={l.id}>
                                   <tr className="border-t border-border/60">
                                     <td className="py-1">{formatFecha(l.fecha)}</td>
                                     <td className="py-1">{l.numero ?? "—"}</td>
                                     <td className="py-1">
                                       {l.informativo ? (
                                         <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-400" variant="outline">
                                           Informativo · {l.tipoComprobante ?? "NC / ND"}
                                         </Badge>
                                       ) : l.saldo > 0.01 ? (
                                         <Badge variant="destructive">
                                           {esCompra ? "Pendiente de pago" : "Pendiente de cobro"}
                                         </Badge>
                                       ) : l.programado > 0.01 ? (
                                         <Badge variant="secondary">
                                           {esCompra ? "Abonada (doc. a debitar)" : "Documentos en cartera"}
                                         </Badge>
                                       ) : (
                                         <Badge variant="outline">{esCompra ? "Abonada" : "Cobrada"}</Badge>
                                       )}
                                     </td>
                                     <td className="py-1 text-right">{formatPesos(l.total)}</td>
                                     <td className="py-1 text-right">{formatPesos(l.pagado)}</td>
                                     <td className="py-1 text-right">{formatPesos(l.programado)}</td>
                                     <td className="py-1 text-right font-medium">
                                       {l.informativo ? "—" : formatPesos(l.saldo)}
                                     </td>
                                     <td className="py-1 text-right">
                                       <Badge variant={l.dias > 60 ? "destructive" : l.dias > 30 ? "secondary" : "outline"}>
                                         {l.dias} días
                                       </Badge>
                                     </td>
                                     <td className="py-1 text-right">{formatFecha(l.prox)}</td>
                                   </tr>
                                   <tr className="border-t border-dashed border-border/40">
                                     <td colSpan={9} className="pb-2 pl-2 pt-1">
                                       {l.informativo ? (
                                         <span className="text-[11px] text-muted-foreground">
                                           Nota de crédito / débito emitida por el {esCompra ? "proveedor" : "cliente"} — no requiere pago
                                         </span>
                                       ) : l.pagos.length === 0 ? (
                                         <span className="text-[11px] text-muted-foreground">
                                           Sin {esCompra ? "pagos" : "cobros"} registrados
                                         </span>
                                       ) : (
                                         <div className="flex flex-wrap gap-1.5">
                                           {l.pagos.map((p) => (
                                             <span
                                               key={p.id}
                                               className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${
                                                 p.confirmado
                                                   ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                                   : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                               }`}
                                             >
                                               <span className="font-medium">{p.etiqueta}</span>
                                               <span>{formatPesos(p.monto)}</span>
                                               {p.fecha && <span className="opacity-70">{formatFecha(p.fecha)}</span>}
                                               {p.detalle && <span className="opacity-70">{p.detalle}</span>}
                                               <span className="opacity-70">· {p.estado}</span>
                                             </span>
                                           ))}
                                         </div>
                                       )}
                                     </td>
                                   </tr>
                                 </Fragment>
                               ))}
                             </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Page() {
  const { year } = useYear();
  return (
    <Tabs defaultValue="proveedores" className="space-y-4">
      <TabsList>
        <TabsTrigger value="proveedores">Proveedores (a pagar)</TabsTrigger>
        <TabsTrigger value="clientes">Clientes (a cobrar)</TabsTrigger>
      </TabsList>
      <TabsContent value="proveedores">
        <Panel tipo="compra" anio={year} />
      </TabsContent>
      <TabsContent value="clientes">
        <Panel tipo="venta" anio={year} />
      </TabsContent>
    </Tabs>
  );
}