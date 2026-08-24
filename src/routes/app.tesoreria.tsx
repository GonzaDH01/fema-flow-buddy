import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw, Wallet, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPesos, formatFecha } from "@/lib/format";
import { esComprobanteInformativo } from "@/lib/finanzas";
import { proyectar, primerDeficit, type Flujo, type Semana } from "@/lib/tesoreria";

export const Route = createFileRoute("/app/tesoreria")({ component: Page });

const n = (v: unknown) => Number(v ?? 0) || 0;

const HORIZONTES = [
  { key: "1m", label: "1 mes", semanas: 5 },
  { key: "3m", label: "3 meses", semanas: 13 },
  { key: "6m", label: "6 meses", semanas: 26 },
  { key: "12m", label: "1 año", semanas: 52 },
] as const;

function useTesoreria(incluirEstimados: boolean, semanasHorizonte: number, incluirSaldoBanco: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fema_tesoreria", incluirEstimados, semanasHorizonte, incluirSaldoBanco, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const [movs, cuotas, gf, gfm, sc, sv, fc, fv, prov, cli, ctas] = await Promise.all([
        supabase.from("fema_movimientos_pago")
          .select("id,instrumento,direccion,estado,vencimiento,monto,contraparte"),
        supabase.from("fema_creditos_cuotas").select("id,numero_cuota,fecha_vencimiento,monto,estado,credito_id"),
        supabase.from("fema_gastos_fijos").select("id,concepto,monto_mensual,dia_vencimiento,activo,mes_fin"),
        supabase.from("fema_gastos_fijos_mov").select("gasto_fijo_id,anio,mes,pagado"),
        (supabase as any).from("fema_v_saldos_compra").select("factura_id,pagado,programado"),
        (supabase as any).from("fema_v_saldos_venta").select("factura_id,cobrado,programado"),
        supabase.from("fema_facturas_compra").select("id,fecha,numero,total,proveedor_id,categoria,tipo_comprobante"),
        supabase.from("fema_facturas_venta").select("id,fecha,numero,total,cliente_id"),
        supabase.from("fema_proveedores").select("id,nombre"),
        supabase.from("fema_clientes").select("id,nombre"),
        supabase.from("fema_cuentas_bancarias").select("id,banco,alias,tipo_cuenta,saldo,activa"),
      ]);

      const cuentas = ((ctas.data ?? []) as any[]).filter((c) => c.activa !== false);
      const saldoBanco = cuentas.reduce((s, c) => s + n(c.saldo), 0);

      const nom = (rows: any[] | null, id: string | null) =>
        (rows ?? []).find((r: any) => r.id === id)?.nombre ?? "s/ identificar";

      const flujos: Flujo[] = [];

      // Documentos en cartera (echeqs / cheques) con fecha cierta
      for (const m of (movs.data ?? []) as any[]) {
        if (m.estado !== "en_cartera" || !m.vencimiento) continue;
        const cobro = m.direccion === "cobro";
        flujos.push({
          fecha: m.vencimiento,
          concepto: `${m.instrumento ?? "Documento"} ${cobro ? "a cobrar" : "a pagar"} — ${m.contraparte ?? "s/d"}`,
          origen: cobro ? "Echeqs a cobrar" : "Echeqs emitidos",
          monto: cobro ? n(m.monto) : -n(m.monto),
        });
      }

      // Cuotas de créditos pendientes
      for (const c of (cuotas.data ?? []) as any[]) {
        if ((c.estado ?? "") === "pagada" || !c.fecha_vencimiento) continue;
        flujos.push({
          fecha: c.fecha_vencimiento,
          concepto: `Cuota ${c.numero_cuota} de crédito`,
          origen: "Créditos",
          monto: -n(c.monto),
        });
      }

      // Gastos fijos activos, proyectados a 4 meses
      const pagados = new Set(
        ((gfm.data ?? []) as any[])
          .filter((m) => m.pagado)
          .map((m) => `${m.gasto_fijo_id}-${m.anio}-${m.mes}`),
      );
      const base = new Date(`${hoy}T00:00:00Z`);
      const mesesProyeccion = Math.ceil(semanasHorizonte / 4) + 1;
      for (const g of (gf.data ?? []) as any[]) {
        if (g.activo === false) continue;
        for (let k = 0; k < mesesProyeccion; k++) {
          const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, Math.min(n(g.dia_vencimiento) || 10, 28)));
          const f = d.toISOString().slice(0, 10);
          if (f < hoy) continue;
          if (g.mes_fin && f > g.mes_fin) continue;
          if (pagados.has(`${g.id}-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`)) continue;
          flujos.push({
            fecha: f, concepto: `Gasto fijo: ${g.concepto}`, origen: "Gastos fijos",
            monto: -n(g.monto_mensual),
          });
        }
      }

      // Saldos de facturas sin documentar (estimación por antigüedad)
      if (incluirEstimados) {
        const mc: Record<string, any> = {};
        for (const r of (sc.data ?? []) as any[]) mc[r.factura_id] = r;
        for (const f of (fc.data ?? []) as any[]) {
          if (f.categoria === "Franco_Particular") continue;
          // Notas de crédito/débito: informativas, no generan deuda.
          if (esComprobanteInformativo(f.tipo_comprobante)) continue;
          const s = mc[f.id] ?? {};
          const saldo = Math.max(0, n(f.total) - n(s.pagado) - n(s.programado));
          if (saldo <= 1) continue;
          const venc = f.fecha > hoy ? f.fecha : hoy;
          flujos.push({
            fecha: venc, concepto: `Saldo compra ${f.numero ?? "s/n"} — ${nom(prov.data as any, f.proveedor_id)}`,
            origen: "Deuda proveedores (estimado)", monto: -saldo,
          });
        }
        const mv: Record<string, any> = {};
        for (const r of (sv.data ?? []) as any[]) mv[r.factura_id] = r;
        for (const f of (fv.data ?? []) as any[]) {
          const s = mv[f.id] ?? {};
          const saldo = Math.max(0, n(f.total) - n(s.cobrado) - n(s.programado));
          if (saldo <= 1) continue;
          const venc = f.fecha > hoy ? f.fecha : hoy;
          flujos.push({
            fecha: venc, concepto: `Saldo a cobrar ${f.numero ?? "s/n"} — ${nom(cli.data as any, f.cliente_id)}`,
            origen: "Cobranzas (estimado)", monto: saldo,
          });
        }
      }

      const inicial = incluirSaldoBanco ? saldoBanco : 0;
      const semanas = proyectar(flujos, inicial, hoy, semanasHorizonte);
      return { semanas, semanasVista: semanas, saldoBanco, cuentas };
    },
  });
}

function Page() {
  const [estimados, setEstimados] = useState(true);
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]["key"]>("3m");
  const [conSaldo, setConSaldo] = useState(true);
  const cfg = HORIZONTES.find((h) => h.key === horizonte)!;
  const { data, isLoading, isFetching, refetch } = useTesoreria(estimados, cfg.semanas, conSaldo);
  const [abierta, setAbierta] = useState<string | null>(null);

  const semanas: Semana[] = data?.semanas ?? [];
  const deficit = useMemo(() => primerDeficit(data?.semanasVista ?? []), [data]);
  const totIn = semanas.reduce((s, w) => s + w.ingresos, 0);
  const totEg = semanas.reduce((s, w) => s + w.egresos, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-primary" /> Tesorería proyectada — {cfg.label} ({cfg.semanas} semanas)
          </h2>
          <p className="text-sm text-muted-foreground">
            Qué entra y qué sale semana a semana según lo cargado: echeqs, cuotas, gastos fijos y saldos de facturas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {HORIZONTES.map((h) => (
              <Button
                key={h.key}
                size="sm"
                variant={h.key === horizonte ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => { setHorizonte(h.key); setAbierta(null); }}
              >
                {h.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant={estimados ? "default" : "outline"} onClick={() => setEstimados((v) => !v)}>
            {estimados ? "Con estimados" : "Solo documentos ciertos"}
          </Button>
          <Button size="sm" variant={conSaldo ? "default" : "outline"} onClick={() => setConSaldo((v) => !v)}>
            {conSaldo ? "Con saldo de bancos" : "Desde cero"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Saldo inicial bancos</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{formatPesos(conSaldo ? (data?.saldoBanco ?? 0) : 0)}</div>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              {(data?.cuentas ?? []).map((c: any) => (
                <div key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{c.alias || c.banco}</span>
                  <span className="tabular-nums">{formatPesos(Number(c.saldo ?? 0))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Ingresos {cfg.label}</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-primary">{formatPesos(totIn)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Egresos {cfg.label}</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-destructive">{formatPesos(totEg)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Neto acumulado</CardTitle></CardHeader>
          <CardContent className={`text-xl font-semibold ${totIn - totEg < 0 ? "text-destructive" : ""}`}>
            {formatPesos(totIn - totEg)}
          </CardContent>
        </Card>
      </div>

      {deficit ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="font-medium text-destructive">
              El flujo acumulado queda negativo la semana del {formatFecha(deficit.inicio)}
            </div>
            <div className="text-muted-foreground">
              Acumulado {formatPesos(deficit.saldoFinal)}: los egresos comprometidos superan lo que entra.
              Reprogramá pagos o adelantá cobranzas antes de esa fecha.
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Calculando proyección...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Semana</th>
                <th className="px-3 py-2 text-right">Ingresos</th>
                <th className="px-3 py-2 text-right">Egresos</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2 text-right">Acumulado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {semanas.map((w, i) => {
                const open = abierta === w.inicio;
                return (
                  <Fragment key={w.inicio}>
                    <tr
                      className={`cursor-pointer border-t border-border hover:bg-muted/40 ${w.saldoFinal < 0 ? "bg-destructive/5" : ""}`}
                      onClick={() => setAbierta(open ? null : w.inicio)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <span className="font-medium">S{i + 1}</span>
                          <span className="text-muted-foreground">
                            {formatFecha(w.inicio)} – {formatFecha(w.fin)}
                          </span>
                          {i === 0 ? <Badge variant="outline" className="text-[10px]">incluye atrasados</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary">{w.ingresos ? formatPesos(w.ingresos) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{w.egresos ? formatPesos(w.egresos) : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${w.neto < 0 ? "text-destructive" : ""}`}>{formatPesos(w.neto)}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${w.saldoFinal < 0 ? "text-destructive" : ""}`}>
                        {formatPesos(w.saldoFinal)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{w.detalle.length || ""}</td>
                    </tr>
                    {open && w.detalle.length > 0 ? (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={6} className="px-3 py-2">
                          <div className="space-y-1">
                            {w.detalle.map((f, k) => (
                              <div key={k} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground">{formatFecha(f.fecha)}</span>
                                <span className="min-w-0 flex-1 truncate">{f.concepto}</span>
                                <Badge variant="outline" className="shrink-0 text-[10px]">{f.origen}</Badge>
                                <span className={`w-32 text-right tabular-nums ${f.monto < 0 ? "text-destructive" : "text-primary"}`}>
                                  {formatPesos(f.monto)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
