import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  absoluteAssetUrl, femaClientHTML, femaHeaderHTML, femaLogoUrl, femaPdfOptions,
  femaPrintCSS, femaWatermarkHTML, femaWatermarkUrl,
} from "@/lib/fema-doc";

type Venta = {
  id: string; numero: string | null; tipo: string | null; tipo_comprobante?: string | null;
  fecha: string; cliente_id: string | null; trabajo: string | null; cultivo?: string | null;
  total: number | string; observaciones?: string | null; [k: string]: any;
};

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const fecha = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ESTADOS: Record<string, string> = { en_cartera: "Pendiente", depositado: "Cobrado", acreditado: "Cobrado", debitado: "Cobrado", pagado: "Cobrado", rechazado: "Rechazado", anulado: "Anulado" };
const TIPOS: Record<string, string> = { echeq: "E-cheq", cheque_fisico: "Cheque", transferencia: "Transferencia", efectivo: "Efectivo" };

export function LiquidacionVentaDialog({ venta, onClose }: { venta: Venta | null; onClose: () => void }) {
  const id = venta?.id;
  const { data } = useQuery({
    queryKey: ["liquidacion_venta", id],
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const nums = String(venta!.trabajo ?? "").match(/\d{4}-\d{8}/g) ?? [];
      const [cli, items, movs, pres] = await Promise.all([
        venta!.cliente_id
          ? supabase.from("fema_clientes").select("nombre,cuit,domicilio,localidad,provincia,condicion_iva").eq("id", venta!.cliente_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("fema_venta_items").select("descripcion,unidad,cantidad,precio_unitario").eq("factura_venta_id", id!).order("orden"),
        (supabase as any).from("fema_movimientos_pago").select("*").eq("factura_venta_id", id!).order("vencimiento", { ascending: true }),
        nums.length
          ? (supabase as any).from("fema_presupuestos").select("id,numero,fecha,neto,total,cliente_id").in("numero", nums)
          : Promise.resolve({ data: [] }),
      ]);
      let presup: any[] = ((pres as any).data ?? []).filter((p: any) => !venta!.cliente_id || p.cliente_id === venta!.cliente_id);
      if (presup.length) {
        const { data: pit } = await (supabase as any).from("fema_presupuesto_items")
          .select("presupuesto_id,descripcion,cantidad,precio_unitario,orden").in("presupuesto_id", presup.map((p) => p.id)).order("orden");
        presup = presup.sort((a, b) => String(a.numero).localeCompare(String(b.numero)))
          .map((p) => ({ ...p, items: (pit ?? []).filter((i: any) => i.presupuesto_id === p.id) }));
      }
      return { cliente: (cli as any).data, items: (items as any).data ?? [], movs: (movs as any).data ?? [], presup };
    },
  });

  const oficial = !!venta?.numero && venta.tipo_comprobante !== "Estimado";
  const titulo = "DETALLE DE TRABAJO Y PLAN DE PAGO";

  const html = useMemo(() => {
    if (!venta || !data) return "";
    const v = venta;
    const total = Number(v.total) || 0;
    const neto = Number(v.subtotal ?? v.neto ?? 0) || 0;
    const iva21 = Number(v.iva_21 ?? 0) || 0;
    const iva105 = Number(v.iva_105 ?? 0) || 0;
    const iva = Number(v.iva ?? v.iva_monto ?? 0) || (iva21 + iva105);
    const ha = Number(v.hectareas ?? 0) || 0;
    const mt = Number(v.metros_bolsa ?? 0) || 0;
    const servicios: any[] = [
      ...(ha > 0 ? [{ descripcion: `Picado ${v.cultivo ?? ""} c/ recolector`.replace(/\s+/g, " "), unidad: "Hectárea", cantidad: ha, precio_unitario: Number(v.precio_ha ?? 0) }] : []),
      ...(mt > 0 ? [{ descripcion: `Embolsado ${v.cultivo ?? ""}`.replace(/\s+/g, " "), unidad: "Metro", cantidad: mt, precio_unitario: Number(v.precio_metro ?? 0) }] : []),
    ];
    const items: any[] = [...servicios, ...data.items];
    if (!items.length) items.push({ descripcion: v.trabajo || "Servicios", unidad: "", cantidad: 1, precio_unitario: neto || total });
    const itemsHTML = items.map((it) => `<tr><td>${esc(it.descripcion)}</td><td>${esc(it.unidad)}</td>
      <td class="right">${Number(it.cantidad).toLocaleString("es-AR")}</td>
      <td class="right">${Number(it.precio_unitario) ? pesos(Number(it.precio_unitario)) : "Bonificado"}</td>
      <td class="right">${pesos(Number(it.cantidad) * Number(it.precio_unitario))}</td></tr>`).join("");
    const presup: any[] = data.presup ?? [];
    const presupHTML = presup.length > 1 ? `
      <div class="sec">DETALLE POR PRESUPUESTO</div>
      ${presup.map((p) => `<table class="fema"><thead><tr><th colspan="3">Presupuesto Nº ${esc(p.numero)} — ${fecha(p.fecha)}</th><th class="right">P. unitario</th><th class="right">Subtotal</th></tr></thead><tbody>
        ${p.items.map((i: any) => `<tr><td colspan="2">${esc(i.descripcion)}</td><td class="right">${Number(i.cantidad).toLocaleString("es-AR")}</td>
          <td class="right">${Number(i.precio_unitario) ? pesos(Number(i.precio_unitario)) : "Bonificado"}</td><td class="right">${pesos(Number(i.cantidad) * Number(i.precio_unitario))}</td></tr>`).join("")}
        <tr class="tot"><td colspan="4" class="right">Neto ${pesos(Number(p.neto))} · <b>Total c/ IVA</b></td><td class="right"><b>${pesos(Number(p.total))}</b></td></tr>
      </tbody></table>`).join("")}` : "";
    const movs: any[] = data.movs;
    const planHTML = movs.length ? `
      <div class="sec">CONDICIONES Y PLAN DE PAGO ACORDADO</div>
      <table class="fema"><thead><tr><th>Cuota</th><th>Vencimiento</th><th>Medio</th><th>Banco / Nº</th><th>Estado</th><th class="right">Importe</th></tr></thead>
      <tbody>${movs.map((m, i) => `<tr><td>${i + 1} / ${movs.length}</td><td>${fecha(m.vencimiento ?? m.fecha_emision)}</td>
        <td>${esc(TIPOS[m.tipo] ?? m.tipo ?? "—")}</td><td>${esc([m.banco, m.numero].filter(Boolean).join(" #") || "—")}</td>
        <td>${esc(ESTADOS[m.estado] ?? m.estado ?? "—")}</td><td class="right">${pesos(Number(m.monto))}</td></tr>`).join("")}
      <tr class="tot"><td colspan="5" class="right"><b>Total plan</b></td><td class="right"><b>${pesos(movs.reduce((a, m) => a + Number(m.monto || 0), 0))}</b></td></tr>
      </tbody></table>` : "";
    const c = data.cliente ?? {};
    const leyenda = oficial ? "" : `<div style="margin-top:8px;border:0.75px solid #000;background:#f2f2f2;padding:5px 8px;letter-spacing:.03em;text-align:center;font-weight:bold;font-size:11px">
      DOCUMENTO NO VÁLIDO COMO FACTURA — Pendiente de emisión del comprobante fiscal</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>${femaPrintCSS}
      @page{size:A4 portrait;margin:10mm}
      html,body{background:#fff}
      .liq-print{font-size:9.5px}
      .liq-print.fema-page,.liq-print .fema-content{min-height:0}
      .liq-print .fema-hdr .l img{height:40px}
      .liq-print .fema-hdr .l,.liq-print .fema-hdr .r{padding:6px 8px}
      .liq-print .fema-hdr .r .ttl{font-size:15px}
      .liq-print .fema-hdr .r .meta{margin-top:6px;font-size:10px}
      .liq-print .fema-client{font-size:9.5px;padding:4px 8px;gap:2px 18px}
      .liq-print .fema-hdr,.liq-print .fema-client{border-width:1px}
      .liq-print .fema-hdr .x{border-left-width:1px;border-right-width:1px}
      .liq-print table.fema{border:0.75px solid #000;margin-top:8px;font-size:9.5px;line-height:1.35}
      .liq-print table.fema thead th{border:0.5px solid #555;background:#e8e8e8;padding:4px 5px;text-transform:uppercase;font-size:8.5px;letter-spacing:.03em;vertical-align:middle}
      .liq-print table.fema tbody td{border:0.5px solid #888;padding:4px 5px 5px;vertical-align:middle}
      .liq-print table.fema tbody tr:nth-child(even) td{background:#f6f6f6}
      .liq-print table.fema tbody tr.tot td{background:#e8e8e8;border-top:0.75px solid #000}
      .liq-print .sec{margin-top:8px;border:0.75px solid #000;border-bottom:0;background:#d9d9d9;padding:4px 8px;font-weight:bold;font-size:9.5px;letter-spacing:.04em}
      .liq-print .sec + table.fema{margin-top:0}
      .liq-print .fema-bottom{margin-top:10px;grid-template-columns:1fr 230px}
      .liq-print .fema-tot{border:0.75px solid #000;font-size:9.5px}
      .liq-print .fema-obs{border-width:0.75px}
      .liq-print .fema-tot .row{padding:3px 8px}
      .liq-print .fema-tot .row.total{background:#e8e8e8;border-top:0.75px solid #000;font-size:12px}
      .liq-print .fema-obs{min-height:55px;font-size:9.5px;padding:6px 8px}
      .liq-print .fema-sign{margin-top:32px;font-size:9.5px}
      .liq-print tr{page-break-inside:avoid}
      </style></head><body><div class="fema-page liq-print">
      ${femaWatermarkHTML(absoluteAssetUrl(femaWatermarkUrl))}
      <div class="fema-content">
      ${femaHeaderHTML(titulo, [
        { label: oficial ? `Factura ARCA ${esc(v.tipo ?? "")}:`.replace(" :", ":") : "Ref.:", value: oficial ? esc(v.numero) : `LIQ-${v.id.slice(0, 8).toUpperCase()}` },
        { label: "Fecha:", value: fecha(v.fecha) },
      ], absoluteAssetUrl(femaLogoUrl))}
      ${femaClientHTML([
        { label: "Cliente:", value: esc(c.nombre) },
        { label: "CUIT:", value: esc(c.cuit) },
        { label: "Domicilio:", value: esc([c.domicilio, c.localidad, c.provincia].filter(Boolean).join(", ")) },
        { label: "Cond. IVA:", value: esc(c.condicion_iva) },
        { label: "Trabajo:", value: esc(v.trabajo) },
        { label: "Cultivo:", value: esc(v.cultivo) },
      ])}
      ${leyenda}
      <table class="fema"><thead><tr><th>Descripción</th><th>Unidad</th><th class="right">Cantidad</th><th class="right">P. unitario</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${itemsHTML}</tbody></table>
      ${presupHTML}
      ${planHTML}
      <div class="fema-spacer"></div>
      <div class="fema-bottom">
        <div class="fema-obs"><div class="t">OBSERVACIONES:</div>${esc(v.observaciones ?? "").replace(/\n/g, "<br>")}</div>
        <div class="fema-tot">
          ${neto ? `<div class="row"><span>Neto:</span><span>${pesos(neto)}</span></div>` : ""}
          ${iva21 ? `<div class="row"><span>IVA 21%:</span><span>${pesos(iva21)}</span></div>` : ""}
          ${iva105 ? `<div class="row"><span>IVA 10,5%:</span><span>${pesos(iva105)}</span></div>` : ""}
          ${iva && !iva21 && !iva105 ? `<div class="row"><span>IVA:</span><span>${pesos(iva)}</span></div>` : ""}
          <div class="row total"><span>Total</span><span>${pesos(total)}</span></div>
        </div>
      </div>
      <div class="fema-sign"><div>Firma FEMA</div><div>Conformidad del cliente</div></div>
      </div></div></body></html>`;
  }, [venta, data, oficial, titulo]);

  const imprimir = () => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("El navegador bloqueó la ventana"); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const pdf = async () => {
    // Área útil A4 con márgenes de 10 mm: 190 x 277 mm
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:190mm;background:#fff";
    const doc = new DOMParser().parseFromString(html, "text/html");
    holder.innerHTML = `<style>${doc.head.querySelector("style")?.textContent ?? ""}</style>${doc.body.innerHTML}`;
    document.body.appendChild(holder);
    try {
      const root = holder.querySelector(".liq-print") as HTMLElement;
      // Ajuste a una sola hoja: si el contenido es más alto que la hoja, se ensancha
      // el lienzo para que, al escalarse al ancho A4, todo entre en una carilla.
      const target = 277 / 190;
      let wmm = 190;
      for (let i = 0; i < 6; i++) {
        const ratio = root.scrollHeight / root.scrollWidth;
        if (ratio <= target) break;
        wmm = Math.min(wmm * Math.min(ratio / target, 1.25), 400);
        holder.style.width = `${wmm}mm`;
      }
      const html2pdf = (await import("html2pdf.js")).default;
      const cli = (data?.cliente?.nombre ?? "cliente").replace(/[^\w]+/g, "_");
      const name = `DETALLE_Y_PLAN_DE_PAGO_${cli}_${fecha(venta?.fecha).replace(/\//g, "-")}.pdf`;
      const opts: any = femaPdfOptions(name, ".liq-print", 10);
      opts.pagebreak = { mode: ["avoid-all"] };
      await html2pdf().set(opts).from(root).save();
    } catch (e: any) {
      toast.error("Error generando PDF: " + (e?.message ?? ""));
    } finally { holder.remove(); }
  };

  return (
    <Dialog open={!!venta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalle de trabajo y plan de pago</DialogTitle>
          <DialogDescription>
            {oficial ? "Resumen para el cliente. Se adjunta junto a la factura oficial de ARCA." : "Documento interno, no válido como factura hasta cargar el número fiscal."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-muted">
          {html ? <iframe title="Vista previa" srcDoc={html} className="w-full h-[65vh] bg-background" />
            : <div className="p-8 text-center text-muted-foreground">Cargando…</div>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={imprimir} disabled={!html}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
          <Button onClick={pdf} disabled={!html}><FileDown className="h-4 w-4 mr-1" />Exportar PDF</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
