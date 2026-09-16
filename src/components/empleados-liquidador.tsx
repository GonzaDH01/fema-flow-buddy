import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import {
  femaPrintCSS, femaHeaderHTML, femaClientHTML, femaWatermarkHTML,
  absoluteAssetUrl, femaLogoUrl, femaWatermarkUrl,
} from "@/lib/fema-doc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EmpleadoPago, DIAS_BASE, modalidadDe } from "@/components/empleados-semanas";
import { ExtraDialog, MODALIDAD_EXTRA } from "@/components/empleados-extra";

const JORNADA = 8;
const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type ExtraRow = { id: string; empleado_id: string | null; fecha: string; monto: number; tareas: string | null };
type HoraRow = { id: string; empleado_id: string | null; fecha: string };

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function ultimoDia(anio: number, mes: number) {
  return new Date(anio, mes, 0).getDate();
}
function rango(desde: string, hasta: string) {
  const out: string[] = [];
  const d = new Date(desde + "T00:00:00");
  const fin = new Date(hasta + "T00:00:00");
  while (d <= fin) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}
/** Lunes de la semana a la que pertenece la fecha. */
function lunesDe(fechaIso: string) {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
function diaSemana(fechaIso: string) {
  return new Date(fechaIso + "T00:00:00").getDay(); // 0 = domingo
}

type Liquidacion = {
  empleado: string; desde: string; hasta: string;
  diasAcordados: number; faltas: string[]; diasPagados: number;
  valorJornal: number; importeBase: number; descuento: number;
  extras: ExtraRow[]; total: number;
};

function imprimirLiquidacion(l: Liquidacion) {
  const logo = absoluteAssetUrl(femaLogoUrl);
  const wm = absoluteAssetUrl(femaWatermarkUrl);
  const filas = [
    `<tr><td>Jornadas del período (${l.diasPagados} de ${l.diasAcordados})</td><td class="right">${l.diasPagados}</td><td class="right">${formatPesos(l.importeBase)}</td></tr>`,
    ...(l.descuento > 0
      ? [`<tr><td>Descuento por inasistencias (${l.faltas.length} día/s: ${l.faltas.map((f) => formatFecha(f)).join(", ")})</td><td class="right">-${l.faltas.length}</td><td class="right">-${formatPesos(l.descuento)}</td></tr>`]
      : []),
    ...l.extras.map((e) => `<tr><td>Extra ${formatFecha(e.fecha)} — ${e.tareas ?? "Trabajo extraordinario"}</td><td class="right">—</td><td class="right">${formatPesos(Number(e.monto))}</td></tr>`),
  ].join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${l.empleado}</title>
<style>${femaPrintCSS}</style></head><body>
<div class="fema-page">
  ${femaWatermarkHTML(wm)}
  <div class="fema-content">
    ${femaHeaderHTML("ORDEN DE PAGO", [
      { label: "Fecha:", value: formatFecha(l.hasta) },
      { label: "Período:", value: `${formatFecha(l.desde)} al ${formatFecha(l.hasta)}` },
    ], logo)}
    ${femaClientHTML([
      { label: "Empleado:", value: l.empleado },
      { label: "Jornadas acordadas:", value: String(l.diasAcordados) },
      { label: "Inasistencias:", value: String(l.faltas.length) },
      { label: "Valor jornada:", value: formatPesos(l.valorJornal) },
    ])}
    <table class="fema">
      <thead><tr><th>Detalle</th><th class="right">Jornadas</th><th class="right">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="fema-spacer"></div>
    <div class="fema-bottom">
      <div class="fema-obs"><div class="t">OBSERVACIONES:</div>Liquidación generada desde el módulo Empleados.</div>
      <div class="fema-tot">
        <div class="row"><span>Jornadas:</span><span>${formatPesos(l.importeBase)}</span></div>
        <div class="row"><span>Extras:</span><span>${formatPesos(l.total - l.importeBase)}</span></div>
        <div class="row total"><span>Total a pagar</span><span>${formatPesos(l.total)}</span></div>
      </div>
    </div>
    <div class="fema-sign"><div>Firma de la empresa</div><div>Firma del empleado</div></div>
  </div>
</div>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return toast.error("El navegador bloqueó la ventana de impresión");
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}

/**
 * Liquidación ágil: se elige el empleado y la quincena, se marcan solo las faltas
 * y el sistema descuenta esos días del importe acordado.
 */
export function LiquidadorTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hoy = new Date();

  const [empleadoId, setEmpleadoId] = useState("");
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [tramo, setTramo] = useState("q1");
  const [semanasOff, setSemanasOff] = useState<Record<string, boolean>>({});
  const [faltas, setFaltas] = useState<Record<string, boolean>>({});
  const [incluirSabado, setIncluirSabado] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [ultima, setUltima] = useState<Liquidacion | null>(null);

  const a = Number(anio), m = Number(mes);
  const fin = ultimoDia(a, m);
  const p = (d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const desde = tramo === "q2" ? p(16) : p(1);
  const hasta = tramo === "q1" ? p(15) : p(fin);

  // Al cambiar de empleado o de período se limpian las marcas de la pantalla.
  useEffect(() => { setFaltas({}); setSemanasOff({}); }, [empleadoId, anio, mes, tramo]);

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_liquidador"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,frecuencia_pago,importe_periodo,valor_hora,sueldo_bruto,activo,forma_pago")
        .order("nombre");
      return (data ?? []) as EmpleadoPago[];
    },
  });

  const emp = (empleados ?? []).find((e) => e.id === empleadoId) ?? null;

  const { data: extras } = useQuery({
    enabled: !!empleadoId,
    queryKey: ["fema_extras_liquidador", empleadoId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_pagos_empleado")
        .select("id,empleado_id,fecha,monto,tareas")
        .eq("empleado_id", empleadoId)
        .eq("modalidad", MODALIDAD_EXTRA)
        .is("solicitud_id", null)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return (data ?? []) as ExtraRow[];
    },
  });

  const { data: horas } = useQuery({
    enabled: !!empleadoId,
    queryKey: ["fema_horas_liquidador", empleadoId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_horas_trabajadas")
        .select("id,empleado_id,fecha")
        .eq("empleado_id", empleadoId)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return (data ?? []) as HoraRow[];
    },
  });

  const { data: yaPagado } = useQuery({
    enabled: !!empleadoId,
    queryKey: ["fema_pagos_liquidador", empleadoId, desde, hasta],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_pagos_empleado")
        .select("id")
        .eq("empleado_id", empleadoId)
        .eq("periodo_desde", desde)
        .eq("periodo_hasta", hasta)
        .neq("modalidad", MODALIDAD_EXTRA);
      return (data ?? []).length > 0;
    },
  });

  // Semanas del período, para elegir cuáles se están abonando.
  const semanas = useMemo(() => {
    const map = new Map<string, string[]>();
    rango(desde, hasta).forEach((f) => {
      const k = lunesDe(f);
      map.set(k, [...(map.get(k) ?? []), f]);
    });
    return Array.from(map.entries()).map(([lunes, dias]) => ({ lunes, dias }));
  }, [desde, hasta]);

  const esLaborable = (f: string) => {
    const d = diaSemana(f);
    return d !== 0 && (incluirSabado || d !== 6);
  };

  const diasLiquidados = useMemo(
    () => semanas.filter((s) => !semanasOff[s.lunes]).flatMap((s) => s.dias).filter(esLaborable),
    [semanas, semanasOff, incluirSabado],
  );

  const diasAcordados = diasLiquidados.length;
  const faltasList = diasLiquidados.filter((f) => faltas[f]);
  const diasPagados = diasAcordados - faltasList.length;

  const importeAcordado = Number(emp?.importe_periodo ?? 0) || Number(emp?.sueldo_bruto ?? 0);
  const baseDias = emp ? DIAS_BASE(emp.frecuencia_pago) : 0;
  const valorJornal = emp
    ? ((emp.frecuencia_pago ?? "").toLowerCase().startsWith("por hora")
      ? Number(emp.valor_hora ?? 0) * JORNADA
      : (importeAcordado ? importeAcordado / baseDias : Number(emp.valor_hora ?? 0) * JORNADA))
    : 0;

  const importeBase = valorJornal * diasPagados;
  const descuento = valorJornal * faltasList.length;
  const montoExtras = (extras ?? []).reduce((s, x) => s + Number(x.monto || 0), 0);
  const total = importeBase + montoExtras;

  const generar = async () => {
    if (!emp) return toast.error("Elegí el empleado");
    if (total <= 0) return toast.error("No hay importe para liquidar");
    setGenerando(true);
    try {
      // 1. El calendario de jornadas queda como registro histórico del período.
      const existentes = new Map((horas ?? []).map((h) => [h.fecha, h.id]));
      for (const f of diasLiquidados) {
        const falto = !!faltas[f];
        const reg = existentes.get(f);
        if (!falto && !reg) {
          const d = new Date(f + "T00:00:00");
          const { error } = await supabase.from("fema_horas_trabajadas").insert({
            user_id: user!.id, empleado_id: emp.id, fecha: f, horas: JORNADA,
            referencia: `Liquidación ${formatFecha(desde)} → ${formatFecha(hasta)}`,
            tarea: "Jornada trabajada",
            mes: d.getMonth() + 1, anio: d.getFullYear(),
          });
          if (error) throw error;
        } else if (falto && reg) {
          const { error } = await supabase.from("fema_horas_trabajadas").delete().eq("id", reg);
          if (error) throw error;
        }
      }

      // 2. Pago de jornadas + extras del período bajo una misma solicitud de factura.
      const pagoIds: string[] = (extras ?? []).map((x) => x.id);
      if (importeBase > 0) {
        const { data: nuevo, error } = await supabase.from("fema_pagos_empleado").insert({
          user_id: user!.id, empleado_id: emp.id, fecha: hasta,
          modalidad: modalidadDe(emp, tramo),
          periodo_desde: desde, periodo_hasta: hasta,
          horas: diasPagados * JORNADA,
          monto: Math.round(importeBase * 100) / 100,
          tareas: `${diasPagados} jornada(s) de ${diasAcordados}${faltasList.length ? ` · ${faltasList.length} falta(s)` : ""}`,
          estado: "pendiente",
          forma_pago: emp.forma_pago ?? null,
          observaciones: `Liquidación ${formatFecha(desde)} → ${formatFecha(hasta)}`,
          anio: a, mes: m,
        }).select("id").single();
        if (error) throw error;
        pagoIds.push(nuevo!.id);
      }

      const { data: sol, error: eSol } = await supabase
        .from("fema_solicitudes_factura_empleado")
        .insert({
          user_id: user!.id, empleado_id: emp.id, fecha: hasta,
          periodo_desde: desde, periodo_hasta: hasta,
          total: Math.round(total * 100) / 100,
          estado: "pendiente", anio: a, mes: m,
          observaciones: `Liquidación ${formatFecha(desde)} → ${formatFecha(hasta)} · ${diasPagados} jornada(s)${faltasList.length ? `, ${faltasList.length} falta(s)` : ""}`,
        })
        .select("id")
        .single();
      if (eSol) throw eSol;

      if (pagoIds.length > 0) {
        const { error: eUp } = await supabase
          .from("fema_pagos_empleado").update({ solicitud_id: sol!.id }).in("id", pagoIds);
        if (eUp) throw eUp;
      }

      const resumen: Liquidacion = {
        empleado: emp.nombre, desde, hasta, diasAcordados,
        faltas: faltasList, diasPagados, valorJornal,
        importeBase, descuento, extras: extras ?? [], total,
      };
      setUltima(resumen);
      toast.success(`Liquidación de ${emp.nombre} por ${formatPesos(total)} generada`);
      qc.invalidateQueries({ queryKey: ["fema_horas_liquidador"] });
      qc.invalidateQueries({ queryKey: ["fema_pagos_liquidador"] });
      qc.invalidateQueries({ queryKey: ["fema_extras_liquidador"] });
      qc.invalidateQueries({ queryKey: ["fema_horas_semana"] });
      qc.invalidateQueries({ queryKey: ["fema_horas"] });
      qc.invalidateQueries({ queryKey: ["fema_horas_cupon"] });
      qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
      qc.invalidateQueries({ queryKey: ["fema_solicitudes_empleado"] });
      imprimirLiquidacion(resumen);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar la liquidación");
    } finally {
      setGenerando(false);
    }
  };

  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2];
  const activos = (empleados ?? []).filter((e) => e.activo !== false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-medium">Liquidar pago</h3>
            <p className="text-xs text-muted-foreground">
              Elegí el empleado y la quincena: se paga completa y solo marcás los días que faltó.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Empleado</Label>
              <Select value={empleadoId} onValueChange={setEmpleadoId}>
                <SelectTrigger className="h-9 w-60"><SelectValue placeholder="Elegir empleado..." /></SelectTrigger>
                <SelectContent>
                  {activos.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_LARGOS.map((x, i) => <SelectItem key={x} value={String(i + 1)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Año</Label>
              <Select value={anio} onValueChange={setAnio}>
                <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anios.map((x) => <SelectItem key={x} value={String(x)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={tramo} onValueChange={setTramo}>
                <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="q1">1ª quincena (1 al 15)</SelectItem>
                  <SelectItem value="q2">2ª quincena (16 a fin de mes)</SelectItem>
                  <SelectItem value="mes">Mes completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {!emp ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Elegí un empleado para liquidar el período.
          </div>
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Cobra: <b className="text-foreground">{emp.frecuencia_pago ?? "Mensual"}</b></span>
                <span>Importe acordado: <b className="text-foreground">{formatPesos(importeAcordado)}</b></span>
                <span>Valor jornada: <b className="text-foreground">{formatPesos(valorJornal)}</b></span>
                <label className="flex items-center gap-2">
                  <Checkbox checked={incluirSabado} onCheckedChange={(v) => setIncluirSabado(Boolean(v))} />
                  Contar sábados
                </label>
              </div>

              {semanas.map((s) => {
                const activa = !semanasOff[s.lunes];
                const laborables = s.dias.filter(esLaborable);
                return (
                  <div key={s.lunes} className={`rounded-lg border p-3 ${activa ? "" : "opacity-50"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={activa}
                          onCheckedChange={(v) => setSemanasOff((x) => ({ ...x, [s.lunes]: !v }))}
                        />
                        Semana del {formatFecha(s.dias[0])} al {formatFecha(s.dias[s.dias.length - 1])}
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {laborables.filter((f) => activa && !faltas[f]).length} de {laborables.length} jornadas
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {laborables.map((f) => {
                        const falto = !!faltas[f];
                        return (
                          <button
                            key={f}
                            type="button"
                            disabled={!activa}
                            onClick={() => setFaltas((x) => ({ ...x, [f]: !x[f] }))}
                            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                              falto
                                ? "border-destructive bg-destructive/10 text-destructive line-through"
                                : "border-primary/40 bg-primary/10 text-foreground"
                            }`}
                          >
                            <span className="block font-medium">{DIA_LARGO[diaSemana(f)].slice(0, 3)} {formatFecha(f).slice(0, 5)}</span>
                            <span className="block text-[10px]">{falto ? "Faltó" : "Trabajó"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Tocá un día para marcarlo como falta: se descuenta el jornal y queda sin tilde en el calendario de días
                trabajados, que se conserva solo como información.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <h4 className="text-sm font-medium">Detalle de la liquidación</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Jornadas del período</span><span className="font-mono">{diasAcordados}</span></div>
                <div className="flex justify-between"><span>Inasistencias</span><span className="font-mono text-destructive">{faltasList.length}</span></div>
                <div className="flex justify-between"><span>Jornadas a pagar</span><span className="font-mono">{diasPagados}</span></div>
                <div className="my-2 border-t" />
                <div className="flex justify-between"><span>Importe jornadas</span><span>{formatPesos(importeBase)}</span></div>
                {descuento > 0 && (
                  <div className="flex justify-between text-destructive"><span>Descuento por faltas</span><span>-{formatPesos(descuento)}</span></div>
                )}
                <div className="flex justify-between"><span>Pagos extra</span><span>{montoExtras > 0 ? formatPesos(montoExtras) : "—"}</span></div>
                <div className="my-2 border-t" />
                <div className="flex justify-between text-base font-semibold"><span>Total a pagar</span><span>{formatPesos(total)}</span></div>
              </div>

              {yaPagado && <Badge variant="secondary">Ya hay una liquidación de este período</Badge>}

              <div className="flex flex-col gap-2">
                <ExtraDialog
                  empleados={activos.map((e) => ({ id: e.id, nombre: e.nombre }))}
                  empleadoId={emp.id}
                  fecha={hasta}
                  trigger={<span>+ Pago extra</span>}
                />
                <Button onClick={generar} disabled={generando || total <= 0}>
                  <Receipt className="size-4 mr-1" /> Liquidar e imprimir orden de pago
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {ultima && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>
            {ultima.empleado} · {formatFecha(ultima.desde)} → {formatFecha(ultima.hasta)} ·{" "}
            {ultima.diasPagados} jornada(s){ultima.faltas.length ? `, ${ultima.faltas.length} falta(s)` : ""} ·{" "}
            <b>{formatPesos(ultima.total)}</b>
          </span>
          <Button size="sm" variant="outline" onClick={() => imprimirLiquidacion(ultima)}>
            <Printer className="size-4 mr-1" /> Reimprimir orden de pago
          </Button>
        </div>
      )}
    </div>
  );
}

/** Campo de fecha suelto reutilizado por otras vistas del módulo. */
export function FechaInput(props: React.ComponentProps<typeof Input>) {
  return <Input type="date" {...props} />;
}
