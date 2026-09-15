import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EmpleadoPago, importePorDias, modalidadDe, DIAS_BASE } from "@/components/empleados-semanas";
import { ExtraDialog, MODALIDAD_EXTRA } from "@/components/empleados-extra";

type HoraRow = { empleado_id: string | null; fecha: string; horas: number };
type PagoRow = { empleado_id: string | null; periodo_desde: string | null; periodo_hasta: string | null };
type ExtraRow = { id: string; empleado_id: string | null; fecha: string; monto: number; tareas: string | null };

type Cupon = {
  empleado: string; desde: string; hasta: string;
  dias: number; jornadas: number; extras: ExtraRow[]; total: number;
};

function ultimoDia(anio: number, mes: number) {
  return new Date(anio, mes, 0).getDate();
}

/** Abre el cupón / orden de pago listo para imprimir o firmar. */
function imprimirCupon(c: Cupon) {
  const logo = absoluteAssetUrl(femaLogoUrl);
  const wm = absoluteAssetUrl(femaWatermarkUrl);
  const filas = [
    `<tr><td>Jornadas trabajadas del período</td><td class="right">${c.dias}</td><td class="right">${formatPesos(c.jornadas)}</td></tr>`,
    ...c.extras.map((e) => `<tr><td>Extra ${formatFecha(e.fecha)} — ${e.tareas ?? "Trabajo extraordinario"}</td><td class="right">—</td><td class="right">${formatPesos(Number(e.monto))}</td></tr>`),
  ].join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cupón de pago ${c.empleado}</title>
<style>${femaPrintCSS}</style></head><body>
<div class="fema-page">
  ${femaWatermarkHTML(wm)}
  <div class="fema-content">
    ${femaHeaderHTML("ORDEN DE PAGO", [
      { label: "Fecha:", value: formatFecha(c.hasta) },
      { label: "Período:", value: `${formatFecha(c.desde)} al ${formatFecha(c.hasta)}` },
    ], logo)}
    ${femaClientHTML([
      { label: "Empleado:", value: c.empleado },
      { label: "Concepto:", value: "Pago de jornadas del período" },
      { label: "Jornadas:", value: String(c.dias) },
      { label: "Extras:", value: String(c.extras.length) },
    ])}
    <table class="fema">
      <thead><tr><th>Detalle</th><th class="right">Jornadas</th><th class="right">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="fema-spacer"></div>
    <div class="fema-bottom">
      <div class="fema-obs"><div class="t">OBSERVACIONES:</div>Cupón generado desde el módulo Empleados.</div>
      <div class="fema-tot">
        <div class="row"><span>Jornadas:</span><span>${formatPesos(c.jornadas)}</span></div>
        <div class="row"><span>Extras:</span><span>${formatPesos(c.total - c.jornadas)}</span></div>
        <div class="row total"><span>Total a pagar</span><span>${formatPesos(c.total)}</span></div>
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

/** Arma el cupón de pago de cada empleado con los días trabajados y los extras del período. */
export function CuponesPagoTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [tramo, setTramo] = useState("mes");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [generando, setGenerando] = useState(false);
  const [ultimos, setUltimos] = useState<Cupon[]>([]);

  const a = Number(anio), m = Number(mes);
  const fin = ultimoDia(a, m);
  const p = (d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const desde = tramo === "q2" ? p(16) : p(1);
  const hasta = tramo === "q1" ? p(15) : p(fin);

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_cupones"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,frecuencia_pago,importe_periodo,valor_hora,sueldo_bruto,activo,forma_pago")
        .order("nombre");
      return (data ?? []) as EmpleadoPago[];
    },
  });

  const { data: horas } = useQuery({
    queryKey: ["fema_horas_cupon", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_horas_trabajadas")
        .select("empleado_id,fecha,horas")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return (data ?? []) as HoraRow[];
    },
  });

  const { data: extras } = useQuery({
    queryKey: ["fema_extras_cupon", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_pagos_empleado")
        .select("id,empleado_id,fecha,monto,tareas")
        .eq("modalidad", MODALIDAD_EXTRA)
        .is("solicitud_id", null)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return (data ?? []) as ExtraRow[];
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["fema_pagos_cupon", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_pagos_empleado")
        .select("empleado_id,periodo_desde,periodo_hasta")
        .eq("periodo_desde", desde)
        .eq("periodo_hasta", hasta);
      if (error) throw error;
      return (data ?? []) as PagoRow[];
    },
  });

  const yaGenerado = useMemo(
    () => new Set((pagos ?? []).map((x) => x.empleado_id ?? "")),
    [pagos],
  );

  const filas = useMemo(() => {
    const activos = (empleados ?? []).filter((e) => e.activo !== false);
    return activos.map((e) => {
      const regs = (horas ?? []).filter((h) => h.empleado_id === e.id);
      const dias = new Set(regs.map((h) => h.fecha)).size;
      const hs = regs.reduce((s, h) => s + Number(h.horas || 0), 0);
      const ext = (extras ?? []).filter((x) => x.empleado_id === e.id);
      const jornadas = importePorDias(e, dias, hs);
      const montoExtras = ext.reduce((s, x) => s + Number(x.monto || 0), 0);
      return {
        emp: e, dias, horas: hs, jornadas, extras: ext, montoExtras,
        total: jornadas + montoExtras, generado: yaGenerado.has(e.id),
      };
    });
  }, [empleados, horas, extras, yaGenerado]);

  const seleccionadas = filas.filter((f) => sel[f.emp.id] && !f.generado && f.total > 0);
  const totalSel = seleccionadas.reduce((s, f) => s + f.total, 0);
  const listaEmpleados = (empleados ?? []).filter((e) => e.activo !== false).map((e) => ({ id: e.id, nombre: e.nombre }));

  const generar = async () => {
    if (seleccionadas.length === 0) return toast.error("Seleccioná al menos un empleado con jornadas o extras");
    setGenerando(true);
    const generados: Cupon[] = [];
    try {
      for (const f of seleccionadas) {
        const pagoIds: string[] = f.extras.map((x) => x.id);
        if (f.jornadas > 0) {
          const { data: nuevo, error } = await supabase.from("fema_pagos_empleado").insert({
            user_id: user!.id,
            empleado_id: f.emp.id,
            fecha: hasta,
            modalidad: modalidadDe(f.emp, tramo),
            periodo_desde: desde,
            periodo_hasta: hasta,
            horas: f.horas,
            monto: Math.round(f.jornadas * 100) / 100,
            tareas: `${f.dias} jornada(s) trabajada(s)`,
            estado: "pendiente",
            forma_pago: f.emp.forma_pago ?? null,
            observaciones: `Cupón ${formatFecha(desde)} → ${formatFecha(hasta)}`,
            anio: a,
            mes: m,
          }).select("id").single();
          if (error) throw error;
          pagoIds.push(nuevo!.id);
        }

        const { data: sol, error: eSol } = await supabase
          .from("fema_solicitudes_factura_empleado")
          .insert({
            user_id: user!.id,
            empleado_id: f.emp.id,
            fecha: hasta,
            periodo_desde: desde,
            periodo_hasta: hasta,
            total: Math.round(f.total * 100) / 100,
            estado: "pendiente",
            anio: a,
            mes: m,
            observaciones: `Cupón ${formatFecha(desde)} → ${formatFecha(hasta)} · ${f.dias} jornada(s)${f.extras.length ? ` + ${f.extras.length} extra(s)` : ""}`,
          })
          .select("id")
          .single();
        if (eSol) throw eSol;

        if (pagoIds.length > 0) {
          const { error: eUp } = await supabase
            .from("fema_pagos_empleado")
            .update({ solicitud_id: sol!.id })
            .in("id", pagoIds);
          if (eUp) throw eUp;
        }

        generados.push({
          empleado: f.emp.nombre, desde, hasta, dias: f.dias,
          jornadas: f.jornadas, extras: f.extras, total: f.total,
        });
      }

      toast.success(`${generados.length} cupón(es) por ${formatPesos(totalSel)}. Solicitud de factura creada.`);
      setUltimos(generados);
      setSel({});
      qc.invalidateQueries({ queryKey: ["fema_pagos_cupon"] });
      qc.invalidateQueries({ queryKey: ["fema_extras_cupon"] });
      qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
      qc.invalidateQueries({ queryKey: ["fema_solicitudes_empleado"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron generar los cupones");
    } finally {
      setGenerando(false);
    }
  };

  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-medium">Cupones de pago</h3>
            <p className="text-xs text-muted-foreground">
              Suma las jornadas marcadas y los pagos extra del período, y genera la orden de pago con su solicitud de factura.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <Select value={mes} onValueChange={(x) => { setMes(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_LARGOS.map((x, i) => <SelectItem key={x} value={String(i + 1)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Año</Label>
              <Select value={anio} onValueChange={(x) => { setAnio(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anios.map((x) => <SelectItem key={x} value={String(x)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={tramo} onValueChange={(x) => { setTramo(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mes completo</SelectItem>
                  <SelectItem value="q1">1ª quincena (1 al 15)</SelectItem>
                  <SelectItem value="q2">2ª quincena (16 a fin de mes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ExtraDialog empleados={listaEmpleados} fecha={hasta} trigger={<span>+ Pago extra</span>} />
            <Button onClick={generar} disabled={generando || seleccionadas.length === 0}>
              <Receipt className="size-4 mr-1" /> Generar cupones ({seleccionadas.length})
              {seleccionadas.length > 0 && <span className="ml-1 font-semibold">· {formatPesos(totalSel)}</span>}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Empleado</TableHead>
                <TableHead>Cobra</TableHead>
                <TableHead className="text-right">Jornadas</TableHead>
                <TableHead className="text-right">Importe jornadas</TableHead>
                <TableHead className="text-right">Extras</TableHead>
                <TableHead className="text-right">Total del cupón</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin empleados activos</TableCell></TableRow>
              )}
              {filas.map((f) => (
                <TableRow key={f.emp.id}>
                  <TableCell>
                    <Checkbox
                      checked={!!sel[f.emp.id]}
                      disabled={f.generado || f.total <= 0}
                      onCheckedChange={(c) => setSel((s) => ({ ...s, [f.emp.id]: !!c }))}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{f.emp.nombre}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(f.emp.frecuencia_pago ?? "Mensual")} · base {DIAS_BASE(f.emp.frecuencia_pago)} día(s)
                  </TableCell>
                  <TableCell className="text-right font-mono">{f.dias}</TableCell>
                  <TableCell className="text-right">{formatPesos(f.jornadas)}</TableCell>
                  <TableCell className="text-right">
                    {f.extras.length > 0
                      ? <span title={f.extras.map((x) => `${formatFecha(x.fecha)} ${x.tareas ?? ""}`).join(" · ")}>{formatPesos(f.montoExtras)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(f.total)}</TableCell>
                  <TableCell>
                    {f.generado
                      ? <Badge variant="secondary">Cupón generado</Badge>
                      : f.total > 0
                        ? <Badge variant="outline">Listo para generar</Badge>
                        : <span className="text-xs text-muted-foreground">Sin jornadas ni extras</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {ultimos.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h4 className="text-sm font-medium">Cupones generados recién</h4>
          {ultimos.map((c) => (
            <div key={c.empleado} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
              <span>{c.empleado} · {formatFecha(c.desde)} → {formatFecha(c.hasta)} · <b>{formatPesos(c.total)}</b></span>
              <Button size="sm" variant="outline" onClick={() => imprimirCupon(c)}>
                <Printer className="size-4 mr-1" /> Imprimir cupón
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        El importe de jornadas surge del importe acordado dividido por los días base de su frecuencia, por los días trabajados.
        Los extras cargados en el período se suman automáticamente. Al generar el cupón queda el pago pendiente y la solicitud
        de factura lista en la pestaña Facturas.
      </p>
    </div>
  );
}
