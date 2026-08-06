import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPesos, formatNumero, MESES } from "@/lib/format";
import {
  calcularResultado, costosPorCategoria, rentabilidadPorCliente, unitarios,
  evolucionMensual, etiquetaCategoria,
  type VentaLinea, type CompraLinea,
} from "@/lib/rentabilidad";

export const Route = createFileRoute("/app/rentabilidad")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Rentabilidad operativa | FEMA" },
      { name: "description", content: "Márgenes por cliente, costos por categoría e indicadores por hectárea y metro de bolsa." },
      { property: "og:title", content: "Rentabilidad operativa | FEMA" },
      { property: "og:description", content: "Márgenes, costos directos e indicadores unitarios del contratista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const n = (v: unknown) => Number(v ?? 0) || 0;

function useRentabilidad(year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fema_rentabilidad", year, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const desde = `${year}-01-01`;
      const hasta = `${year}-12-31`;
      const [fv, fc, cli] = await Promise.all([
        supabase.from("fema_facturas_venta")
          .select("id,fecha,neto,total,cliente_id,hectareas,metros_bolsa,trabajo")
          .gte("fecha", desde).lte("fecha", hasta),
        supabase.from("fema_facturas_compra")
          .select("id,fecha,neto,total,categoria")
          .gte("fecha", desde).lte("fecha", hasta),
        supabase.from("fema_clientes").select("id,nombre"),
      ]);

      const nombre = (id: string | null) =>
        ((cli.data ?? []) as any[]).find((c) => c.id === id)?.nombre ?? "Sin cliente";

      const ventas: VentaLinea[] = ((fv.data ?? []) as any[]).map((f) => ({
        clienteId: f.cliente_id ?? null,
        cliente: nombre(f.cliente_id ?? null),
        fecha: f.fecha,
        // Si no hay neto cargado, se usa el total como aproximación.
        neto: n(f.neto) || n(f.total),
        trabajo: f.trabajo ?? null,
        hectareas: n(f.hectareas),
        metrosBolsa: n(f.metros_bolsa),
      }));

      const compras: CompraLinea[] = ((fc.data ?? []) as any[]).map((f) => ({
        fecha: f.fecha,
        neto: n(f.neto) || n(f.total),
        categoria: f.categoria ?? null,
      }));

      return { ventas, compras };
    },
  });
}

function Kpi({ label, value, tone, sub }: { label: string; value: string; tone?: "up" | "down"; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-semibold ${tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : ""}`}>
          {value}
        </div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function Page() {
  const { year } = useYear();
  const { data, isLoading, isFetching, refetch } = useRentabilidad(year);
  const [soloDirectos, setSoloDirectos] = useState(false);

  const ventas = data?.ventas ?? [];
  const compras = data?.compras ?? [];

  const res = useMemo(() => calcularResultado(ventas, compras), [ventas, compras]);
  const cats = useMemo(() => costosPorCategoria(compras), [compras]);
  const base = soloDirectos ? res.costosDirectos : res.costosDirectos + res.costosIndirectos;
  const porCliente = useMemo(() => rentabilidadPorCliente(ventas, base), [ventas, base]);
  const uni = useMemo(() => unitarios(ventas, base), [ventas, base]);
  const meses = useMemo(() => evolucionMensual(ventas, compras), [ventas, compras]);

  const positivo = res.resultadoOperativo >= 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <PieChart className="h-5 w-5 text-primary" /> Rentabilidad operativa {year}
          </h2>
          <p className="text-sm text-muted-foreground">
            Sobre importes netos. Se excluyen cuotas de créditos, compra de maquinaria e inversiones
            (son financiación, no costo del servicio).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={soloDirectos ? "default" : "outline"} onClick={() => setSoloDirectos((v) => !v)}>
            {soloDirectos ? "Imputar solo directos" : "Imputar costo total"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ingresos netos" value={formatPesos(res.ingresos)} tone="up" sub={`${ventas.length} facturas de venta`} />
        <Kpi label="Costos directos" value={formatPesos(res.costosDirectos)} tone="down" sub="Gasoil, repuestos, mecánicos, fletes, mano de obra" />
        <Kpi label="Margen bruto" value={formatPesos(res.margenBruto)} sub={`${formatNumero(res.margenBrutoPct, 1)}% sobre ventas`} />
        <Kpi
          label="Resultado operativo"
          value={formatPesos(res.resultadoOperativo)}
          tone={positivo ? "up" : "down"}
          sub={`${formatNumero(res.resultadoOperativoPct, 1)}% — indirectos ${formatPesos(res.costosIndirectos)}`}
        />
      </div>

      {res.noOperativos > 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Fuera del resultado operativo: {formatPesos(res.noOperativos)} en cuotas de créditos, maquinaria/rodados e inversiones.
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Calculando rentabilidad...</div>
      ) : (
        <Tabs defaultValue="clientes">
          <TabsList className="flex-wrap">
            <TabsTrigger value="clientes">Por cliente</TabsTrigger>
            <TabsTrigger value="costos">Costos por categoría</TabsTrigger>
            <TabsTrigger value="unitarios">Indicadores unitarios</TabsTrigger>
            <TabsTrigger value="meses">Evolución mensual</TabsTrigger>
          </TabsList>

          <TabsContent value="clientes" className="mt-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-right">Facturas</th>
                    <th className="px-3 py-2 text-right">Ingresos netos</th>
                    <th className="px-3 py-2 text-right">Part.</th>
                    <th className="px-3 py-2 text-right">Has.</th>
                    <th className="px-3 py-2 text-right">Mts. bolsa</th>
                    <th className="px-3 py-2 text-right">Costo imputado</th>
                    <th className="px-3 py-2 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {porCliente.map((f) => (
                    <tr key={f.clienteId ?? f.cliente} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{f.cliente}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.facturas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPesos(f.ingresos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatNumero(f.participacion, 1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.hectareas ? formatNumero(f.hectareas, 1) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.metrosBolsa ? formatNumero(f.metrosBolsa, 0) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatPesos(f.costoImputado)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={f.margen < 0 ? "text-destructive" : "text-primary"}>{formatPesos(f.margen)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{formatNumero(f.margenPct, 1)}%</span>
                      </td>
                    </tr>
                  ))}
                  {porCliente.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Sin ventas registradas en {year}.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="costos" className="mt-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto neto</th>
                    <th className="px-3 py-2 text-right">% de costos</th>
                    <th className="px-3 py-2 text-right">% s/ ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.categoria} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{etiquetaCategoria(c.categoria)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={c.clase === "directo" ? "default" : c.clase === "indirecto" ? "secondary" : "outline"} className="text-[10px]">
                          {c.clase === "no_operativo" ? "no operativo" : c.clase}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPesos(c.monto)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {c.clase === "no_operativo" ? "—" : `${formatNumero(c.participacion, 1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {res.ingresos ? `${formatNumero((c.monto / res.ingresos) * 100, 1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {cats.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Sin compras registradas en {year}.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="unitarios" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi label="Hectáreas facturadas" value={formatNumero(uni.hectareas, 1)} />
              <Kpi label="Metros de bolsa" value={formatNumero(uni.metrosBolsa, 0)} />
              <Kpi label="Ingreso por hectárea" value={formatPesos(uni.ingresoPorHa)} tone="up" />
              <Kpi label="Costo por hectárea" value={formatPesos(uni.costoPorHa)} tone="down" sub={soloDirectos ? "solo costos directos" : "directos + indirectos"} />
              <Kpi label="Margen por hectárea" value={formatPesos(uni.margenPorHa)} tone={uni.margenPorHa >= 0 ? "up" : "down"} />
              <Kpi label="Ingreso por metro de bolsa" value={formatPesos(uni.ingresoPorMetro)} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Los unitarios usan las hectáreas y metros cargados en las facturas de venta. Si un trabajo se facturó
              sin esos datos, el ingreso se computa igual pero no suma unidades, así que el valor por hectárea queda alto.
            </p>
          </TabsContent>

          <TabsContent value="meses" className="mt-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Mes</th>
                    <th className="px-3 py-2 text-right">Ingresos</th>
                    <th className="px-3 py-2 text-right">Costos operativos</th>
                    <th className="px-3 py-2 text-right">Resultado</th>
                    <th className="px-3 py-2 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr key={m.mes} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{MESES[m.mes - 1]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.ingresos ? formatPesos(m.ingresos) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{m.costos ? formatPesos(m.costos) : "—"}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${m.resultado < 0 ? "text-destructive" : ""}`}>
                        {m.ingresos || m.costos ? formatPesos(m.resultado) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {m.ingresos ? (
                          <span className="inline-flex items-center gap-1">
                            {m.resultado >= 0 ? <TrendingUp className="h-3 w-3 text-primary" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
                            {formatNumero((m.resultado / m.ingresos) * 100, 1)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
