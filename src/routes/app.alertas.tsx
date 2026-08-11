import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, RefreshCw, ArrowRight, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPesos, formatFecha } from "@/lib/format";
import { esComprobanteInformativo } from "@/lib/finanzas";
import {
  type Alerta, type Severidad, ordenarAlertas, severidadPorAtraso, diasHasta, hoyISO,
} from "@/lib/alertas";

export const Route = createFileRoute("/app/alertas")({ component: Page });

const n = (v: unknown) => Number(v ?? 0) || 0;

const SEV_STYLE: Record<Severidad, { label: string; cls: string }> = {
  critica: { label: "Crítica", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  alta: { label: "Alta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  media: { label: "Media", cls: "bg-primary/10 text-primary border-primary/30" },
  info: { label: "Info", cls: "bg-muted text-muted-foreground border-border" },
};

function useAlertas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fema_alertas", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Alerta[]> => {
      const hoy = hoyISO();
      const [movs, sc, sv, fc, fv, prov, cli, cuotas, gf] = await Promise.all([
        supabase.from("fema_movimientos_pago")
          .select("id,instrumento,direccion,estado,vencimiento,monto,contraparte,factura_compra_id,factura_venta_id"),
        (supabase as any).from("fema_v_saldos_compra").select("factura_id,pagado,programado"),
        (supabase as any).from("fema_v_saldos_venta").select("factura_id,cobrado,programado"),
        supabase.from("fema_facturas_compra").select("id,fecha,numero,total,proveedor_id,imagen_path,tipo_comprobante,categoria"),
        supabase.from("fema_facturas_venta").select("id,fecha,numero,total,cliente_id"),
        supabase.from("fema_proveedores").select("id,nombre"),
        supabase.from("fema_clientes").select("id,nombre"),
        supabase.from("fema_creditos_cuotas").select("id,numero_cuota,fecha_vencimiento,monto,estado,credito_id"),
        supabase.from("fema_gastos_fijos_mov").select("id,anio,mes,monto,pagado,gasto_fijo_id"),
      ]);

      const out: Alerta[] = [];
      const nombre = (rows: any[] | null, id: string | null) =>
        (rows ?? []).find((r: any) => r.id === id)?.nombre ?? "Sin identificar";

      // 1. Echeqs recibidos vencidos sin cobrar
      for (const m of (movs.data ?? []) as any[]) {
        if (m.direccion !== "cobro" || m.estado !== "en_cartera" || !m.vencimiento) continue;
        const d = diasHasta(m.vencimiento);
        if (d === null) continue;
        if (d < 0) {
          out.push({
            id: `echeq-venc-${m.id}`,
            severidad: severidadPorAtraso(-d),
            categoria: "Echeqs a cobrar",
            titulo: `${m.instrumento ?? "Echeq"} vencido sin cobrar — ${m.contraparte ?? "s/d"}`,
            detalle: `Fecha de pago ${formatFecha(m.vencimiento)} (${-d} días de atraso). Marcalo como cobrado y acreditalo en banco.`,
            monto: n(m.monto), fecha: m.vencimiento, to: "/app/medios",
          });
        } else if (d <= 7) {
          out.push({
            id: `echeq-prox-${m.id}`,
            severidad: "info",
            categoria: "Echeqs a cobrar",
            titulo: `Cobro próximo — ${m.contraparte ?? "s/d"}`,
            detalle: `Se acredita en ${d} día(s) (${formatFecha(m.vencimiento)}).`,
            monto: n(m.monto), fecha: m.vencimiento, to: "/app/medios",
          });
        }
      }

      // 2. Echeqs propios a debitar en los próximos 15 días
      const propiosProx = ((movs.data ?? []) as any[]).filter(
        (m) => m.direccion === "pago" && m.estado === "en_cartera" && m.vencimiento &&
          (diasHasta(m.vencimiento) ?? 99) <= 15,
      );
      for (const m of propiosProx) {
          const d = diasHasta(m.vencimiento)!;
          out.push({
            id: `propio-${m.id}`,
            severidad: d < 0 ? "critica" : d <= 3 ? "alta" : "media",
            categoria: "Echeqs emitidos",
            titulo: `${d < 0 ? "Echeq propio vencido" : "Echeq propio por debitar"} — ${m.contraparte ?? "s/d"}`,
            detalle: d < 0
              ? `Debía debitarse el ${formatFecha(m.vencimiento)}. Registrá el débito de caja.`
              : `Se debita en ${d} día(s) (${formatFecha(m.vencimiento)}).`,
            monto: n(m.monto), fecha: m.vencimiento, to: "/app/medios",
          });
      }

      // 3. Facturas de compra vencidas sin pagar
      const mapC: Record<string, any> = {};
      for (const r of ((sc.data ?? []) as any[])) mapC[r.factura_id] = r;
      for (const f of ((fc.data ?? []) as any[])) {
        // Franco abona con tarjeta personal: no genera deuda con proveedores.
        const informativo =
          esComprobanteInformativo(f.tipo_comprobante) || f.categoria === "Franco_Particular";
        const s = mapC[f.id] ?? {};
        const saldo = Math.max(0, n(f.total) - n(s.pagado) - n(s.programado));
        const dias = -(diasHasta(f.fecha) ?? 0);
        if (!informativo && saldo > 1 && dias > 30) {
          out.push({
            id: `compra-${f.id}`,
            severidad: severidadPorAtraso(dias),
            categoria: "Deuda con proveedores",
            titulo: `${nombre(prov.data as any, f.proveedor_id)} — comprobante ${f.numero ?? "s/n"}`,
            detalle: `Sin pagar ni programar desde hace ${dias} días (${formatFecha(f.fecha)}).`,
            monto: saldo, fecha: f.fecha, to: "/app/cuentas",
          });
        }
        if (!f.imagen_path && dias >= 0) {
          out.push({
            id: `sinimg-${f.id}`,
            severidad: "info",
            categoria: "Documentación",
            titulo: `Compra sin imagen adjunta — ${nombre(prov.data as any, f.proveedor_id)}`,
            detalle: `Comprobante ${f.numero ?? "s/n"} del ${formatFecha(f.fecha)} sin respaldo digital.`,
            monto: n(f.total), fecha: f.fecha, to: "/app/imagenes",
          });
        }
      }

      // 4. Facturas de venta pendientes de cobro
      const mapV: Record<string, any> = {};
      for (const r of ((sv.data ?? []) as any[])) mapV[r.factura_id] = r;
      for (const f of ((fv.data ?? []) as any[])) {
        const s = mapV[f.id] ?? {};
        const saldo = Math.max(0, n(f.total) - n(s.cobrado) - n(s.programado));
        const dias = -(diasHasta(f.fecha) ?? 0);
        if (saldo > 1 && dias > 30) {
          out.push({
            id: `venta-${f.id}`,
            severidad: severidadPorAtraso(dias),
            categoria: "Cobranzas",
            titulo: `${nombre(cli.data as any, f.cliente_id)} — factura ${f.numero ?? "s/n"}`,
            detalle: `Sin cobrar ni documentar desde hace ${dias} días (${formatFecha(f.fecha)}).`,
            monto: saldo, fecha: f.fecha, to: "/app/cuentas",
          });
        }
      }

      // 5. Cuotas de créditos vencidas o próximas
      for (const c of ((cuotas.data ?? []) as any[])) {
        if ((c.estado ?? "") === "pagada") continue;
        const d = diasHasta(c.fecha_vencimiento);
        if (d === null) continue;
        if (d < 0 || d <= 10) {
          out.push({
            id: `cuota-${c.id}`,
            severidad: d < 0 ? severidadPorAtraso(-d) : "media",
            categoria: "Créditos / financiación",
            titulo: `Cuota ${c.numero_cuota} ${d < 0 ? "vencida" : "por vencer"}`,
            detalle: d < 0
              ? `Venció el ${formatFecha(c.fecha_vencimiento)} (${-d} días).`
              : `Vence en ${d} día(s) — ${formatFecha(c.fecha_vencimiento)}.`,
            monto: n(c.monto), fecha: c.fecha_vencimiento, to: "/app/creditos",
          });
        }
      }

      // 6. Gastos fijos del mes en curso sin pagar
      const anio = Number(hoy.slice(0, 4));
      const mes = Number(hoy.slice(5, 7));
      const pend = ((gf.data ?? []) as any[]).filter((g) => g.anio === anio && g.mes === mes && !g.pagado);
      if (pend.length) {
        out.push({
          id: `gf-${anio}-${mes}`,
          severidad: "media",
          categoria: "Gastos fijos",
          titulo: `${pend.length} gasto(s) fijo(s) del mes sin marcar como pagados`,
          detalle: "Revisá la pestaña Gastos fijos y confirmá los pagos realizados.",
          monto: pend.reduce((s, g) => s + n(g.monto), 0),
          to: "/app/compras",
        });
      }

      return ordenarAlertas(out);
    },
  });
}

function Page() {
  const { data, isLoading, refetch, isFetching } = useAlertas();
  const [cat, setCat] = useState<string>("todas");
  const alertas = data ?? [];

  const categorias = useMemo(
    () => ["todas", ...Array.from(new Set(alertas.map((a) => a.categoria)))],
    [alertas],
  );
  const filtradas = cat === "todas" ? alertas : alertas.filter((a) => a.categoria === cat);
  const conteo = (s: Severidad) => alertas.filter((a) => a.severidad === s).length;
  const expuesto = alertas
    .filter((a) => a.severidad !== "info")
    .reduce((s, a) => s + (a.monto ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 text-primary" /> Centro de alertas
          </h2>
          <p className="text-sm text-muted-foreground">
            Todo lo que requiere una acción, ordenado por criticidad.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["critica", "alta", "media"] as Severidad[]).map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {SEV_STYLE[s].label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{conteo(s)}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monto expuesto
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatPesos(expuesto)}</CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cat === c ? "default" : "outline"}
            onClick={() => setCat(c)}
            className="text-xs"
          >
            {c === "todas" ? `Todas (${alertas.length})` : `${c} (${alertas.filter((a) => a.categoria === c).length})`}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Analizando el sistema...</div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">Sin alertas pendientes en esta categoría.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severidad === "critica" ? "text-destructive"
                    : a.severidad === "alta" ? "text-amber-600"
                    : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${SEV_STYLE[a.severidad].cls}`}>
                      {SEV_STYLE[a.severidad].label}
                    </Badge>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {a.categoria}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{a.detalle}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                {a.monto ? (
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {formatPesos(a.monto)}
                  </span>
                ) : null}
                {a.to ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={a.to}>
                      Ir <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
