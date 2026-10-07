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
  const factura = (facturasQ.data ?? []).find((f) => f.id === facturaId);
  const nombreContratista = contratistas.find((c) => c.clave === contratista)?.nombre
    ?? (filas[0]?.equipo_nombre ?? "");

  const imprimir = () => {
    if (!filas.length) return toast.error("No hay viajes para liquidar");
    const logo = absoluteAssetUrl(femaLogoUrl);
    const wm = absoluteAssetUrl(femaWatermarkUrl);
    const choferes = [...new Set(filas.map((f) => f.chofer).filter(Boolean))].join(", ") || "—";
    const filasHtml = filas.map((f) => {
      const p = planMap.get(f.planilla_id)!;
      return `<tr><td>${formatFecha(p.fecha)}</td><td>${p.cliente_nombre ?? "—"}</td><td>${[p.establecimiento, p.lote].filter(Boolean).join(" / ") || "—"}</td><td>${f.chofer ?? "—"}${f.dominio ? ` (${f.dominio})` : ""}</td><td class="right">${formatNumero(f.viajes, 0)}</td><td class="right">${formatNumero(f.metros_bolsa, 0)}</td></tr>`;
    }).join("");
    const concHtml = conceptos.map((c) => `<div class="row"><span>${c.d}</span><span>${formatPesos(c.v)}</span></div>`).join("");
    const periodo = modo === "planilla"
      ? formatFecha(planMap.get(planillaId)?.fecha ?? "")
      : `${desde ? formatFecha(desde) : "inicio"} al ${hasta ? formatFecha(hasta) : "hoy"}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${nombreContratista}</title>
<style>${femaPrintCSS}</style></head><body><div class="fema-page">${femaWatermarkHTML(wm)}<div class="fema-content">
${femaHeaderHTML("LIQUIDACIÓN CONTRATISTA", [
  { label: "Fecha:", value: formatFecha(new Date().toISOString().slice(0, 10)) },
  { label: "Período:", value: periodo },
], logo)}
${femaClientHTML([
  { label: "Contratista:", value: nombreContratista },
  { label: "Choferes:", value: choferes },
  { label: "Viajes:", value: formatNumero(totViajes, 0) },
  { label: "Factura:", value: factura ? `${factura.tipo_comprobante ?? "Factura"} ${factura.tipo ?? ""} ${factura.numero ?? "s/n"} — ${formatPesos(Number(factura.total))}` : "Pendiente de recibir" },
])}
<table class="fema"><thead><tr><th>Fecha</th><th>Cliente</th><th>Establecimiento / Lote</th><th>Chofer</th><th class="right">Viajes</th><th class="right">Metros</th></tr></thead>
<tbody>${filasHtml}<tr><td colspan="4" class="right"><b>Totales</b></td><td class="right"><b>${formatNumero(totViajes, 0)}</b></td><td class="right"><b>${formatNumero(totMetros, 0)}</b></td></tr></tbody></table>
<div class="fema-spacer"></div>
<div class="fema-bottom"><div class="fema-obs"><div class="t">OBSERVACIONES:</div>Liquidación generada desde Planilla Bolsero.</div>
<div class="fema-tot">${concHtml}<div class="row total"><span>Total a abonar</span><span>${formatPesos(total)}</span></div></div></div>
<div class="fema-sign"><div>Firma de la empresa</div><div>Firma del contratista</div></div>
</div></div></body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return toast.error("Permití las ventanas emergentes para imprimir");
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
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
