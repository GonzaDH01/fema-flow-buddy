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
  const titulo = oficial ? `FACTURA ${venta?.tipo ?? ""}`.trim() : "LIQUIDACIÓN DE SERVICIOS";

  const html = useMemo(() => {
    if (!venta || !data) return "";
    const v = venta;
    const total = Number(v.total) || 0;
    const neto = Number(v.subtotal ?? v.neto ?? 0) || 0;
    const iva = Number(v.iva ?? v.iva_monto ?? 0) || 0;
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
      <div style="margin-top:14px;font-weight:bold;font-style:italic;text-decoration:underline">DETALLE POR PRESUPUESTO</div>
      ${presup.map((p) => `<table class="fema"><thead><tr><th colspan="3">Presupuesto Nº ${esc(p.numero)} — ${fecha(p.fecha)}</th><th class="right">P. unitario</th><th class="right">Subtotal</th></tr></thead><tbody>
        ${p.items.map((i: any) => `<tr><td colspan="2">${esc(i.descripcion)}</td><td class="right">${Number(i.cantidad).toLocaleString("es-AR")}</td>
          <td class="right">${Number(i.precio_unitario) ? pesos(Number(i.precio_unitario)) : "Bonificado"}</td><td class="right">${pesos(Number(i.cantidad) * Number(i.precio_unitario))}</td></tr>`).join("")}
        <tr><td colspan="4" class="right">Neto ${pesos(Number(p.neto))} · <b>Total c/ IVA</b></td><td class="right"><b>${pesos(Number(p.total))}</b></td></tr>
      </tbody></table>`).join("")}` : "";
    const movs: any[] = data.movs;
    const planHTML = movs.length ? `
      <div style="margin-top:14px;font-weight:bold;font-style:italic;text-decoration:underline">CONDICIONES Y PLAN DE PAGO ACORDADO</div>
      <table class="fema"><thead><tr><th>Cuota</th><th>Vencimiento</th><th>Medio</th><th>Banco / Nº</th><th>Estado</th><th class="right">Importe</th></tr></thead>
      <tbody>${movs.map((m, i) => `<tr><td>${i + 1} / ${movs.length}</td><td>${fecha(m.vencimiento ?? m.fecha_emision)}</td>
        <td>${esc(TIPOS[m.tipo] ?? m.tipo ?? "—")}</td><td>${esc([m.banco, m.numero].filter(Boolean).join(" #") || "—")}</td>
        <td>${esc(ESTADOS[m.estado] ?? m.estado ?? "—")}</td><td class="right">${pesos(Number(m.monto))}</td></tr>`).join("")}
      <tr><td colspan="5" class="right"><b>Total plan</b></td><td class="right"><b>${pesos(movs.reduce((a, m) => a + Number(m.monto || 0), 0))}</b></td></tr>
      </tbody></table>` : "";
    const c = data.cliente ?? {};
    const leyenda = oficial ? "" : `<div style="margin-top:6px;border:1px dashed #000;padding:4px 8px;text-align:center;font-weight:bold;font-size:11px">
      DOCUMENTO NO VÁLIDO COMO FACTURA — Pendiente de emisión del comprobante fiscal</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>${femaPrintCSS}
      html,body{background:#fff}</style></head><body><div class="fema-page liq-print">
      ${femaWatermarkHTML(absoluteAssetUrl(femaWatermarkUrl))}
      <div class="fema-content">
      ${femaHeaderHTML(titulo, [
        { label: oficial ? "Nº:" : "Ref.:", value: oficial ? esc(v.numero) : `LIQ-${v.id.slice(0, 8).toUpperCase()}` },
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
      ${planHTML}
      <div class="fema-spacer"></div>
      <div class="fema-bottom">
        <div class="fema-obs"><div class="t">OBSERVACIONES:</div>${esc(v.observaciones ?? "").replace(/\n/g, "<br>")}</div>
        <div class="fema-tot">
          ${neto ? `<div class="row"><span>Neto:</span><span>${pesos(neto)}</span></div>` : ""}
          ${iva ? `<div class="row"><span>IVA:</span><span>${pesos(iva)}</span></div>` : ""}
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
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;background:#fff";
    const doc = new DOMParser().parseFromString(html, "text/html");
    holder.innerHTML = `<style>${doc.head.querySelector("style")?.textContent ?? ""}</style>${doc.body.innerHTML}`;
    document.body.appendChild(holder);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const cli = (data?.cliente?.nombre ?? "cliente").replace(/[^\w]+/g, "_");
      const name = `${oficial ? "FACTURA" : "LIQUIDACION"}_${cli}_${fecha(venta?.fecha).replace(/\//g, "-")}.pdf`;
      await html2pdf().set(femaPdfOptions(name, ".liq-print")).from(holder.querySelector(".liq-print") as HTMLElement).save();
    } catch (e: any) {
      toast.error("Error generando PDF: " + (e?.message ?? ""));
    } finally { holder.remove(); }
  };

  return (
    <Dialog open={!!venta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{oficial ? "Factura" : "Liquidación de servicios"}</DialogTitle>
          <DialogDescription>
            {oficial ? "Vista previa del comprobante." : "Documento interno, no válido como factura hasta cargar el número fiscal."}
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
