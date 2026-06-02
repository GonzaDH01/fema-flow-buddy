import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Receipt, Wallet } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/kpis")({
  component: KpisPage,
});

type Factura = Database["public"]["Tables"]["facturas"]["Row"];
type Item = Database["public"]["Tables"]["factura_items"]["Row"];
type Iva = Database["public"]["Tables"]["iva"]["Row"];
type CP = Database["public"]["Tables"]["clientes_proveedores"]["Row"];
type Producto = Database["public"]["Tables"]["productos"]["Row"];
type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function KpisPage() {
  const currentYear = new Date().getFullYear();
  const [anio, setAnio] = useState(currentYear);
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;

  const { data, isLoading } = useQuery({
    queryKey: ["kpis", anio],
    queryFn: async () => {
      const [f, it, iv, cp, pr, gs] = await Promise.all([
        supabase.from("facturas").select("*").gte("fecha_emision", desde).lte("fecha_emision", hasta),
        supabase.from("factura_items").select("*"),
        supabase.from("iva").select("*"),
        supabase.from("clientes_proveedores").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("gastos").select("*").gte("fecha", desde).lte("fecha", hasta),
      ]);
      if (f.error) throw f.error;
      return {
        facturas: (f.data ?? []) as Factura[],
        items: (it.data ?? []) as Item[],
        iva: (iv.data ?? []) as Iva[],
        clientes: (cp.data ?? []) as CP[],
        productos: (pr.data ?? []) as Producto[],
        gastos: (gs.data ?? []) as Gasto[],
      };
    },
  });

  const facturas = data?.facturas ?? [];
  const facIds = useMemo(() => new Set(facturas.map((f) => f.id)), [facturas]);
  const cpById = useMemo(() => Object.fromEntries((data?.clientes ?? []).map((c) => [c.id, c])), [data]);
  const prodById = useMemo(() => Object.fromEntries((data?.productos ?? []).map((p) => [p.id, p])), [data]);

  const ventas = facturas.filter((f) => ["A", "B", "C"].includes(f.tipo) && f.estado !== "anulada");
  const compras = facturas.filter((f) => ["E", "M"].includes(f.tipo) && f.estado !== "anulada");
  const gastos = data?.gastos ?? [];

  const totVentas = ventas.reduce((s, f) => s + Number(f.total), 0);
  const totCompras = compras.reduce((s, f) => s + Number(f.total), 0);
  const ivaVentas = ventas.reduce((s, f) => s + Number(f.iva_total), 0);
  const ivaCompras = compras.reduce((s, f) => s + Number(f.iva_total), 0);
  const totGastos = gastos.reduce((s, g) => s + Number(g.monto), 0);

  // Serie mensual
  const porMes = useMemo(() => {
    const arr = MESES.map((m) => ({ mes: m, ventas: 0, compras: 0, gastos: 0 }));
    ventas.forEach((f) => { arr[new Date(f.fecha_emision).getMonth()].ventas += Number(f.total); });
    compras.forEach((f) => { arr[new Date(f.fecha_emision).getMonth()].compras += Number(f.total); });
    gastos.forEach((g) => { arr[new Date(g.fecha).getMonth()].gastos += Number(g.monto); });
    return arr;
  }, [ventas, compras, gastos]);

  // Top clientes (por ventas)
  const topClientes = useMemo(() => {
    const m = new Map<string, number>();
    ventas.forEach((f) => {
      const id = f.cliente_proveedor_id ?? "sin";
      m.set(id, (m.get(id) ?? 0) + Number(f.total));
    });
    return Array.from(m.entries())
      .map(([id, total]) => ({ nombre: cpById[id]?.razon_social ?? "Consumidor final", total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventas, cpById]);

  // Top productos (por monto vendido)
  const topProductos = useMemo(() => {
    const items = (data?.items ?? []).filter((i) => facIds.has(i.factura_id) && i.producto_id);
    const ventaIds = new Set(ventas.map((v) => v.id));
    const m = new Map<string, { qty: number; total: number }>();
    items.filter((i) => ventaIds.has(i.factura_id)).forEach((i) => {
      const cur = m.get(i.producto_id!) ?? { qty: 0, total: 0 };
      cur.qty += Number(i.cantidad);
      cur.total += Number(i.subtotal_neto);
      m.set(i.producto_id!, cur);
    });
    return Array.from(m.entries())
      .map(([id, v]) => ({ nombre: prodById[id]?.descripcion ?? "—", ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [data, facIds, ventas, prodById]);

  // Gastos por categoría
  const gastosPorCat = useMemo(() => {
    const m = new Map<string, number>();
    gastos.forEach((g) => m.set(g.categoria, (m.get(g.categoria) ?? 0) + Number(g.monto)));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [gastos]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">KPIs anuales / Export AFIP</h1>
          <p className="mt-1 text-muted-foreground">Indicadores del ejercicio y libros CITI (RG 3685).</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label>Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Ventas" value={fmt(totVentas)} sub={`IVA débito ${fmt(ivaVentas)}`} icon={TrendingUp} tone="success" />
        <KpiCard label="Compras" value={fmt(totCompras)} sub={`IVA crédito ${fmt(ivaCompras)}`} icon={TrendingDown} tone="default" />
        <KpiCard label="IVA a pagar" value={fmt(ivaVentas - ivaCompras)} sub="Débito − Crédito" icon={Receipt} tone={ivaVentas - ivaCompras >= 0 ? "warning" : "success"} />
        <KpiCard label="Gastos" value={fmt(totGastos)} sub={`${gastos.length} registros`} icon={Wallet} tone="default" />
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : (
        <Tabs defaultValue="evolucion">
          <TabsList>
            <TabsTrigger value="evolucion">Evolución mensual</TabsTrigger>
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
            <TabsTrigger value="gastos">Gastos por categoría</TabsTrigger>
            <TabsTrigger value="afip">Export AFIP CITI</TabsTrigger>
          </TabsList>

          <TabsContent value="evolucion" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-4 font-semibold">Ventas vs Compras vs Gastos — {anio}</h2>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={porMes}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => new Intl.NumberFormat("es-AR", { notation: "compact" }).format(v)} />
                    <Tooltip formatter={(v: number) => fmt2(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                    <Bar dataKey="ventas" fill={COLORS[1]} name="Ventas" />
                    <Bar dataKey="compras" fill={COLORS[2]} name="Compras" />
                    <Bar dataKey="gastos" fill={COLORS[3]} name="Gastos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rankings" className="mt-4 grid gap-4 md:grid-cols-2">
            <RankCard title="Top 5 clientes" rows={topClientes.map((c) => ({ label: c.nombre, value: fmt2(c.total) }))} />
            <RankCard title="Top 5 productos vendidos" rows={topProductos.map((p) => ({ label: p.nombre, value: `${p.qty.toFixed(0)} u · ${fmt2(p.total)}` }))} />
          </TabsContent>

          <TabsContent value="gastos" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-4 font-semibold">Distribución de gastos</h2>
              {gastosPorCat.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin gastos en el año.</p>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={gastosPorCat} dataKey="value" nameKey="name" outerRadius={120} label={(e) => `${e.name}: ${fmt(Number(e.value))}`}>
                        {gastosPorCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt2(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="afip" className="mt-4">
            <AfipExport anio={anio} facturas={facturas} iva={data?.iva ?? []} cpById={cpById} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: typeof TrendingUp; tone: "success" | "warning" | "default" }) {
  const ring =
    tone === "success" ? "ring-emerald-500/20 text-emerald-500" :
    tone === "warning" ? "ring-amber-500/20 text-amber-500" :
    "ring-border text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase text-muted-foreground">{label}</span>
        <div className={`grid h-8 w-8 place-items-center rounded-full ring-1 ${ring}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin datos</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
              <span className="flex items-center gap-2 truncate">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ============ AFIP CITI (RG 3685) ============
function pad(s: string | number, n: number, char = "0", left = true) {
  const str = String(s ?? "");
  if (str.length >= n) return str.slice(0, n);
  return left ? char.repeat(n - str.length) + str : str + char.repeat(n - str.length);
}
const padR = (s: string | number, n: number) => pad(s, n, " ", false);

// Mapeo simplificado tipo de comprobante AFIP
const TIPO_CBTE: Record<string, string> = { A: "001", B: "006", C: "011", E: "019", M: "051" };
const COND_IVA_DOC: Record<string, string> = {
  responsable_inscripto: "80",
  monotributo: "80",
  exento: "80",
  consumidor_final: "96",
  no_responsable: "96",
};

function buildCabecera(facturas: Factura[], cpById: Record<string, CP>, ivaRows: Iva[]) {
  return facturas.map((f) => {
    const cp = cpById[f.cliente_proveedor_id ?? ""];
    const fecha = f.fecha_emision.replace(/-/g, "");
    const tipoCbte = TIPO_CBTE[f.tipo] ?? "000";
    const pv = pad(f.punto_venta, 5);
    const nro = pad(f.numero, 20);
    const docTipo = COND_IVA_DOC[cp?.condicion_iva ?? "consumidor_final"] ?? "99";
    const docNro = pad((cp?.cuit ?? "").replace(/\D/g, ""), 20);
    const razon = padR((cp?.razon_social ?? "Consumidor Final").substring(0, 30), 30);
    const imp = (n: number) => pad(Math.round(n * 100), 15);
    const total = imp(Number(f.total));
    const totNoGrav = imp(0);
    const percNoCat = imp(0);
    const exentas = imp(0);
    const percIva = imp(0);
    const percIIBB = imp(Number(f.percepciones_total));
    const percMun = imp(0);
    const impuestosInternos = imp(0);
    const moneda = "PES";
    const cotiz = pad(1000000, 10); // 1.000000
    const ivas = ivaRows.filter((i) => i.factura_id === f.id);
    const cantAlic = pad(ivas.length || 1, 1);
    const codOp = " ";
    const otrosTrib = imp(0);
    const fechaVtoPago = "00000000";
    // Estructura simplificada CITI Ventas (longitud aprox 266 chars)
    return [
      fecha, tipoCbte, pv, nro, nro, docTipo, docNro, razon,
      total, totNoGrav, percNoCat, exentas, percIva, percIIBB, percMun,
      impuestosInternos, moneda, cotiz, cantAlic, codOp, otrosTrib, fechaVtoPago,
    ].join("");
  }).join("\n");
}

function buildAlicuotas(facturas: Factura[], ivaRows: Iva[]) {
  const lines: string[] = [];
  facturas.forEach((f) => {
    const tipoCbte = TIPO_CBTE[f.tipo] ?? "000";
    const pv = pad(f.punto_venta, 5);
    const nro = pad(f.numero, 20);
    const ivas = ivaRows.filter((i) => i.factura_id === f.id);
    const items = ivas.length > 0 ? ivas : [{ base_imponible: Number(f.neto), alicuota: 21, importe: Number(f.iva_total) } as Iva];
    items.forEach((iv) => {
      const codAlic = ({ 0: "3", 10.5: "4", 21: "5", 27: "6", 5: "8", 2.5: "9" } as Record<number, string>)[Number(iv.alicuota)] ?? "5";
      const base = pad(Math.round(Number(iv.base_imponible) * 100), 15);
      const imp = pad(Math.round(Number(iv.importe) * 100), 15);
      lines.push([tipoCbte, pv, nro, base, codAlic, imp].join(""));
    });
  });
  return lines.join("\n");
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function AfipExport({ anio, facturas, iva, cpById }: { anio: number; facturas: Factura[]; iva: Iva[]; cpById: Record<string, CP> }) {
  const [periodo, setPeriodo] = useState(`${anio}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [y, m] = periodo.split("-").map(Number);
  const inPeriodo = (f: Factura) => {
    const d = new Date(f.fecha_emision);
    return d.getFullYear() === y && d.getMonth() + 1 === m && f.estado !== "anulada";
  };
  const ventas = facturas.filter((f) => ["A", "B", "C"].includes(f.tipo) && inPeriodo(f));
  const compras = facturas.filter((f) => ["E", "M"].includes(f.tipo) && inPeriodo(f));

  const exportar = (tipo: "ventas" | "compras") => {
    const set = tipo === "ventas" ? ventas : compras;
    const ids = new Set(set.map((f) => f.id));
    const ivas = iva.filter((i) => ids.has(i.factura_id));
    const periodoCode = `${y}${String(m).padStart(2, "0")}`;
    const prefix = tipo === "ventas" ? "REGINFO_CV_VENTAS" : "REGINFO_CV_COMPRAS";
    download(`${prefix}_CBTE_${periodoCode}.txt`, buildCabecera(set, cpById, ivas));
    download(`${prefix}_ALICUOTAS_${periodoCode}.txt`, buildAlicuotas(set, ivas));
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Export AFIP CITI (RG 3685)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera los archivos REGINFO_CV de comprobantes y alícuotas para importar en SIAp. Formato simplificado, revisar con el contador antes de presentar.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <Label>Período (AAAA-MM)</Label>
          <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-40" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => exportar("ventas")} disabled={ventas.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> Ventas ({ventas.length})
          </Button>
          <Button onClick={() => exportar("compras")} disabled={compras.length === 0} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Compras ({compras.length})
          </Button>
        </div>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs uppercase text-muted-foreground">Ventas del período</div>
          <div className="mt-1 text-lg font-semibold">{ventas.length} comprobantes</div>
          <div className="text-xs text-muted-foreground">Total {fmt2(ventas.reduce((s, f) => s + Number(f.total), 0))}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs uppercase text-muted-foreground">Compras del período</div>
          <div className="mt-1 text-lg font-semibold">{compras.length} comprobantes</div>
          <div className="text-xs text-muted-foreground">Total {fmt2(compras.reduce((s, f) => s + Number(f.total), 0))}</div>
        </div>
      </div>
    </div>
  );
}