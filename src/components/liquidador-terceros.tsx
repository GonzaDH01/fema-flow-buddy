import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatFecha, formatNumero, formatPesos } from "@/lib/format";
import {
  femaPrintCSS, femaHeaderHTML, femaClientHTML, femaWatermarkHTML,
  absoluteAssetUrl, femaLogoUrl, femaWatermarkUrl,
} from "@/lib/fema-doc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PlanillaMin = { id: string; fecha: string; cliente_nombre: string | null; establecimiento: string | null; lote: string | null };
type EquipoMin = {
  id: string; planilla_id: string; equipo_id: string | null; equipo_nombre: string;
  chofer: string | null; dominio: string | null; es_tercero: boolean; viajes: number; metros_bolsa: number;
};

const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

export function LiquidadorTerceros({ planillas, equipos }: { planillas: PlanillaMin[]; equipos: EquipoMin[] }) {
  const [modo, setModo] = useState<"periodo" | "planilla">("periodo");
  const [contratista, setContratista] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [planillaId, setPlanillaId] = useState("");
  const [calculo, setCalculo] = useState<"viaje" | "avanzado">("viaje");
  const [tarifaViaje, setTarifaViaje] = useState("");
  const [arrancada, setArrancada] = useState("");
  const [litros, setLitros] = useState("");
  const [precioLitro, setPrecioLitro] = useState("");
  const [km, setKm] = useState("");
  const [tarifaKm, setTarifaKm] = useState("");
  const [facturaId, setFacturaId] = useState("none");

  const planMap = useMemo(() => new Map(planillas.map((p) => [p.id, p])), [planillas]);
  const terceros = useMemo(() => equipos.filter((e) => e.es_tercero), [equipos]);
  const claveDe = (e: EquipoMin) => e.equipo_id ?? e.equipo_nombre.trim().toUpperCase();

  const contratistas = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of terceros) if (!m.has(claveDe(e))) m.set(claveDe(e), e.equipo_nombre);
    return [...m.entries()].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [terceros]);

  const planillasConTerceros = useMemo(() => {
    const ids = new Set(terceros.map((e) => e.planilla_id));
    return planillas.filter((p) => ids.has(p.id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [planillas, terceros]);

  const filas = useMemo(() => {
    const r = terceros.filter((e) => {
      const p = planMap.get(e.planilla_id);
      if (!p) return false;
      if (modo === "planilla") return e.planilla_id === planillaId && (!contratista || claveDe(e) === contratista);
      if (!contratista || claveDe(e) !== contratista) return false;
      if (desde && p.fecha < desde) return false;
      if (hasta && p.fecha > hasta) return false;
      return true;
    });
    return r.sort((a, b) => (planMap.get(a.planilla_id)!.fecha).localeCompare(planMap.get(b.planilla_id)!.fecha));
  }, [terceros, planMap, modo, planillaId, contratista, desde, hasta]);

  const totViajes = filas.reduce((a, f) => a + Number(f.viajes || 0), 0);
  const totMetros = filas.reduce((a, f) => a + Number(f.metros_bolsa || 0), 0);

  const conceptos = calculo === "viaje"
    ? [{ d: `Viajes (${formatNumero(totViajes, 0)} × ${formatPesos(num(tarifaViaje))})`, v: totViajes * num(tarifaViaje) }]
    : [
        { d: "Arrancada", v: num(arrancada) },
        { d: `Combustible (${formatNumero(num(litros), 2)} L × ${formatPesos(num(precioLitro))})`, v: num(litros) * num(precioLitro) },
        { d: `Viajes (${formatNumero(totViajes, 0)} × ${formatPesos(num(tarifaViaje))})`, v: totViajes * num(tarifaViaje) },
        { d: `Kilómetros (${formatNumero(num(km), 0)} km × ${formatPesos(num(tarifaKm))})`, v: num(km) * num(tarifaKm) },
      ];
  const total = conceptos.reduce((a, c) => a + c.v, 0);

  const qc = useQueryClient();
  const facturasQ = useQuery({
    queryKey: ["liq_terceros_facturas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_facturas_compra")
        .select("id, fecha, numero, tipo, tipo_comprobante, total, estado, categoria, fema_proveedores(nombre)")
        .eq("categoria", "Transportistas")
        .order("fecha", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const proveedoresQ = useQuery({
    queryKey: ["liq_terceros_proveedores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_proveedores").select("id, nombre").order("nombre");
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const historialQ = useQuery({
    queryKey: ["liq_terceros_historial"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_liquidaciones_terceros")
        .select("*, fema_facturas_compra(id, numero, tipo, tipo_comprobante, total, estado, fecha_pago)")
        .order("fecha", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [proveedorId, setProveedorId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const factura = (facturasQ.data ?? []).find((f) => f.id === facturaId);
  const nombreContratista = contratistas.find((c) => c.clave === contratista)?.nombre
    ?? (filas[0]?.equipo_nombre ?? "");

  // Viajes ya incluidos en liquidaciones guardadas
  const yaLiquidados = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of historialQ.data ?? []) for (const id of l.equipo_ids ?? []) m.set(id, l.fecha);
    return m;
  }, [historialQ.data]);
  const filasRepetidas = filas.filter((f) => yaLiquidados.has(f.id)).length;

  const periodoTexto = modo === "planilla"
    ? formatFecha(planMap.get(planillaId)?.fecha ?? "")
    : `${desde ? formatFecha(desde) : "inicio"} al ${hasta ? formatFecha(hasta) : "hoy"}`;

  const imprimir = () => {
    if (!filas.length) return toast.error("No hay viajes para liquidar");
    imprimirHTML({
      filas, nombre: nombreContratista, periodo: periodoTexto, conceptos, total,
      fecha: new Date().toISOString().slice(0, 10),
      facturaTxt: factura ? `${factura.tipo_comprobante ?? "Factura"} ${factura.tipo ?? ""} ${factura.numero ?? "s/n"} — ${formatPesos(Number(factura.total))}` : "Pendiente de recibir",
    });
  };

  const imprimirHTML = (d: { filas: EquipoMin[]; nombre: string; periodo: string; conceptos: { d: string; v: number }[]; total: number; fecha: string; facturaTxt: string }) => {
    const logo = absoluteAssetUrl(femaLogoUrl);
    const wm = absoluteAssetUrl(femaWatermarkUrl);
    const tv = d.filas.reduce((a, f) => a + Number(f.viajes || 0), 0);
    const tm = d.filas.reduce((a, f) => a + Number(f.metros_bolsa || 0), 0);
    const choferes = [...new Set(d.filas.map((f) => f.chofer).filter(Boolean))].join(", ") || "—";
    const filasHtml = d.filas.map((f) => {
      const p = planMap.get(f.planilla_id);
      return `<tr><td>${p ? formatFecha(p.fecha) : "—"}</td><td>${p?.cliente_nombre ?? "—"}</td><td>${[p?.establecimiento, p?.lote].filter(Boolean).join(" / ") || "—"}</td><td>${f.chofer ?? "—"}${f.dominio ? ` (${f.dominio})` : ""}</td><td class="right">${formatNumero(f.viajes, 0)}</td><td class="right">${formatNumero(f.metros_bolsa, 0)}</td></tr>`;
    }).join("");
    const concHtml = d.conceptos.map((c) => `<div class="row"><span>${c.d}</span><span>${formatPesos(c.v)}</span></div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${d.nombre}</title>
<style>${femaPrintCSS}</style></head><body><div class="fema-page">${femaWatermarkHTML(wm)}<div class="fema-content">
${femaHeaderHTML("LIQUIDACIÓN CONTRATISTA", [
  { label: "Fecha:", value: formatFecha(d.fecha) },
  { label: "Período:", value: d.periodo },
], logo)}
${femaClientHTML([
  { label: "Contratista:", value: d.nombre },
  { label: "Choferes:", value: choferes },
  { label: "Viajes:", value: formatNumero(tv, 0) },
  { label: "Factura:", value: d.facturaTxt },
])}
<table class="fema"><thead><tr><th>Fecha</th><th>Cliente</th><th>Establecimiento / Lote</th><th>Chofer</th><th class="right">Viajes</th><th class="right">Metros</th></tr></thead>
<tbody>${filasHtml}<tr><td colspan="4" class="right"><b>Totales</b></td><td class="right"><b>${formatNumero(tv, 0)}</b></td><td class="right"><b>${formatNumero(tm, 0)}</b></td></tr></tbody></table>
<div class="fema-spacer"></div>
<div class="fema-bottom"><div class="fema-obs"><div class="t">OBSERVACIONES:</div>Liquidación generada desde Planilla Bolsero.</div>
<div class="fema-tot">${concHtml}<div class="row total"><span>Total a abonar</span><span>${formatPesos(d.total)}</span></div></div></div>
<div class="fema-sign"><div>Firma de la empresa</div><div>Firma del contratista</div></div>
</div></div></body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return toast.error("Permití las ventanas emergentes para imprimir");
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  const guardar = async () => {
    if (!filas.length) return toast.error("No hay viajes para liquidar");
    if (total <= 0) return toast.error("El total a abonar debe ser mayor a cero");
    if (facturaId === "none" && !proveedorId) return toast.error("Elegí el proveedor/transportista para generar la deuda en Cuentas Corrientes");
    if (filasRepetidas > 0 && !confirm(`${filasRepetidas} viaje(s) ya figuran en otra liquidación guardada. ¿Guardar igual?`)) return;
    setGuardando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sesión no válida");
      const hoy = new Date().toISOString().slice(0, 10);
      const planillaIds = [...new Set(filas.map((f) => f.planilla_id))];
      let facId: string | null = facturaId === "none" ? null : facturaId;
      if (!facId) {
        const { data: fc, error: e1 } = await (supabase as any).from("fema_facturas_compra").insert({
          user_id: uid, fecha: hoy, proveedor_id: proveedorId, tipo_comprobante: "Comprobante provisorio",
          numero: `LIQ-${hoy.replace(/-/g, "")}`, neto: total, total, categoria: "Transportistas", estado: "pendiente",
          anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)),
          descripcion: `Liquidación ${nombreContratista} · ${formatNumero(totViajes, 0)} viajes · ${periodoTexto}`,
          observaciones: "Generado desde Liquidador de terceros. Reemplazar por la factura del transportista al recibirla.",
        }).select("id").single();
        if (e1) throw e1;
        facId = fc.id;
      }
      const { error: e2 } = await (supabase as any).from("fema_liquidaciones_terceros").insert({
        user_id: uid, fecha: hoy, contratista: nombreContratista, contratista_clave: contratista || null,
        proveedor_id: proveedorId || null,
        periodo_desde: modo === "periodo" ? (desde || null) : (planMap.get(planillaId)?.fecha ?? null),
        periodo_hasta: modo === "periodo" ? (hasta || null) : (planMap.get(planillaId)?.fecha ?? null),
        planilla_ids: planillaIds, equipo_ids: filas.map((f) => f.id),
        viajes: totViajes, metros: totMetros, calculo,
        parametros: { tarifaViaje, arrancada, litros, precioLitro, km, tarifaKm, periodo: periodoTexto },
        conceptos, total, factura_compra_id: facId,
      });
      if (e2) throw e2;
      toast.success(facturaId === "none" ? "Liquidación guardada y deuda creada en Cuentas Corrientes" : "Liquidación guardada y asociada a la factura");
      qc.invalidateQueries({ queryKey: ["liq_terceros_historial"] });
      qc.invalidateQueries({ queryKey: ["liq_terceros_facturas"] });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
    } finally { setGuardando(false); }
  };

  const reimprimir = (l: any) => {
    const ids = new Set<string>(l.equipo_ids ?? []);
    const f = l.fema_facturas_compra;
    imprimirHTML({
      filas: equipos.filter((e) => ids.has(e.id)), nombre: l.contratista, periodo: l.parametros?.periodo ?? "—",
      conceptos: l.conceptos ?? [], total: Number(l.total), fecha: l.fecha,
      facturaTxt: f ? `${f.tipo_comprobante ?? "Factura"} ${f.tipo ?? ""} ${f.numero ?? "s/n"} — ${formatPesos(Number(f.total))}` : "Pendiente de recibir",
    });
  };

  const borrar = async (l: any) => {
    if (!confirm("¿Eliminar esta liquidación del historial? (La deuda en Compras no se borra)")) return;
    const { error } = await (supabase as any).from("fema_liquidaciones_terceros").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["liq_terceros_historial"] });
  };

  const asociarFactura = async (l: any, fid: string) => {
    const { error } = await (supabase as any).from("fema_liquidaciones_terceros").update({ factura_compra_id: fid === "none" ? null : fid }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Factura asociada");
    qc.invalidateQueries({ queryKey: ["liq_terceros_historial"] });
  };

  const campo = (label: string, node: React.ReactNode) => (
    <div className="space-y-1"><div className="text-xs text-muted-foreground">{label}</div>{node}</div>
  );

  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4">
        {campo("Agrupar por", (
          <Select value={modo} onValueChange={(v) => setModo(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="periodo">Contratista y período</SelectItem>
              <SelectItem value="planilla">Planilla individual</SelectItem>
            </SelectContent>
          </Select>
        ))}
        {modo === "planilla" && campo("Planilla", (
          <Select value={planillaId} onValueChange={setPlanillaId}>
            <SelectTrigger><SelectValue placeholder="Elegir planilla" /></SelectTrigger>
            <SelectContent>
              {planillasConTerceros.map((p) => (
                <SelectItem key={p.id} value={p.id}>{formatFecha(p.fecha)} — {p.cliente_nombre ?? "Sin cliente"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {campo(modo === "planilla" ? "Contratista (opcional)" : "Contratista", (
          <Select value={contratista || "all"} onValueChange={(v) => setContratista(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Elegir contratista" /></SelectTrigger>
            <SelectContent>
              {modo === "planilla" && <SelectItem value="all">Todos</SelectItem>}
              {contratistas.map((c) => <SelectItem key={c.clave} value={c.clave}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {modo === "periodo" && campo("Desde", <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />)}
        {modo === "periodo" && campo("Hasta", <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />)}
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Establecimiento / Lote</TableHead>
            <TableHead>Contratista</TableHead><TableHead>Chofer</TableHead>
            <TableHead className="text-right">Viajes</TableHead><TableHead className="text-right">Metros</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                {modo === "periodo" ? "Elegí un contratista para ver sus viajes." : "Elegí una planilla."}
              </TableCell></TableRow>
            )}
            {filas.map((f) => {
              const p = planMap.get(f.planilla_id)!;
              return (
                <TableRow key={f.id}>
                  <TableCell>{formatFecha(p.fecha)}</TableCell>
                  <TableCell>{p.cliente_nombre || "—"}</TableCell>
                  <TableCell>{[p.establecimiento, p.lote].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="font-medium">{f.equipo_nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{f.chofer || "—"}{f.dominio ? ` · ${f.dominio}` : ""}</TableCell>
                  <TableCell className="text-right font-semibold">{formatNumero(f.viajes, 0)}</TableCell>
                  <TableCell className="text-right">{formatNumero(f.metros_bolsa, 0)}</TableCell>
                </TableRow>
              );
            })}
            {filas.length > 0 && (
              <TableRow className="bg-muted/50">
                <TableCell colSpan={5} className="text-right font-semibold">Totales</TableCell>
                <TableCell className="text-right font-semibold">{formatNumero(totViajes, 0)}</TableCell>
                <TableCell className="text-right font-semibold">{formatNumero(totMetros, 0)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold uppercase tracking-wide">Cálculo a abonar</div>
            <Select value={calculo} onValueChange={(v) => setCalculo(v as any)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viaje">Tarifa por viaje</SelectItem>
                <SelectItem value="avanzado">Arrancada + litros + viajes + km</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {calculo === "avanzado" && campo("Arrancada ($)", <Input inputMode="decimal" value={arrancada} onChange={(e) => setArrancada(e.target.value)} />)}
            {campo("Valor por viaje ($)", <Input inputMode="decimal" value={tarifaViaje} onChange={(e) => setTarifaViaje(e.target.value)} />)}
            {calculo === "avanzado" && <>
              {campo("Litros", <Input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} />)}
              {campo("Precio por litro ($)", <Input inputMode="decimal" value={precioLitro} onChange={(e) => setPrecioLitro(e.target.value)} />)}
              {campo("Kilómetros recorridos", <Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />)}
              {campo("Valor por km ($)", <Input inputMode="decimal" value={tarifaKm} onChange={(e) => setTarifaKm(e.target.value)} />)}
            </>}
          </div>
          <div className="space-y-1 border-t pt-3 text-sm">
            {conceptos.map((c) => (
              <div key={c.d} className="flex justify-between"><span className="text-muted-foreground">{c.d}</span><span>{formatPesos(c.v)}</span></div>
            ))}
            <div className="flex justify-between pt-1 text-base font-bold"><span>Total a abonar</span><span>{formatPesos(total)}</span></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold uppercase tracking-wide">Factura del transportista</div>
          <Select value={facturaId} onValueChange={setFacturaId}>
            <SelectTrigger><SelectValue placeholder="Elegir factura cargada en Compras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin factura (pendiente de solicitar)</SelectItem>
              {(facturasQ.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {formatFecha(f.fecha)} · {f.fema_proveedores?.nombre ?? "Proveedor"} · {f.numero ?? "s/n"} · {formatPesos(Number(f.total))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Se listan las facturas de Compras con categoría Transportistas.</p>
          {factura && (
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <div className="flex justify-between"><span>Importe facturado</span><span className="font-semibold">{formatPesos(Number(factura.total))}</span></div>
              <div className="flex justify-between"><span>Liquidado</span><span>{formatPesos(total)}</span></div>
              <div className="flex justify-between"><span>Diferencia</span>
                <span className={Math.abs(Number(factura.total) - total) < 1 ? "font-semibold" : "font-semibold text-destructive"}>
                  {formatPesos(Number(factura.total) - total)}
                </span>
              </div>
              <div className="pt-1"><Badge variant={factura.estado === "pagada" ? "secondary" : "outline"}>{factura.estado === "pagada" ? "Pagada" : "Pendiente de pago"}</Badge></div>
            </div>
          )}
          <Button onClick={imprimir} className="w-full"><Printer className="mr-2 h-4 w-4" /> Imprimir liquidación</Button>
        </CardContent></Card>
      </div>
    </div>
  );
}
