import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/reportes")({
  component: ReportesPage,
});

type Factura = Database["public"]["Tables"]["facturas"]["Row"];
type CP = Database["public"]["Tables"]["clientes_proveedores"]["Row"];
type Iva = Database["public"]["Tables"]["iva"]["Row"];
type Ret = Database["public"]["Tables"]["retenciones"]["Row"];
type Perc = Database["public"]["Tables"]["percepciones"]["Row"];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

const firstDay = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((v) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportesPage() {
  const [desde, setDesde] = useState(firstDay());
  const [hasta, setHasta] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["reportes", desde, hasta],
    queryFn: async () => {
      const [f, c, iv, rt, pc] = await Promise.all([
        supabase.from("facturas").select("*").gte("fecha_emision", desde).lte("fecha_emision", hasta).order("fecha_emision"),
        supabase.from("clientes_proveedores").select("*"),
        supabase.from("iva").select("*"),
        supabase.from("retenciones").select("*"),
        supabase.from("percepciones").select("*"),
      ]);
      if (f.error) throw f.error;
      return {
        facturas: (f.data ?? []) as Factura[],
        clientes: (c.data ?? []) as CP[],
        iva: (iv.data ?? []) as Iva[],
        retenciones: (rt.data ?? []) as Ret[],
        percepciones: (pc.data ?? []) as Perc[],
      };
    },
  });

  const facturas = data?.facturas ?? [];
  const facturaIds = new Set(facturas.map((f) => f.id));
  const cpById = useMemo(() => Object.fromEntries((data?.clientes ?? []).map((c) => [c.id, c])), [data]);
  const facById = useMemo(() => Object.fromEntries(facturas.map((f) => [f.id, f])), [facturas]);

  // Ventas: A, B, C (emitidas); Compras: E, M (recibidas) — simplificado por tipo
  const ventas = facturas.filter((f) => ["A", "B", "C"].includes(f.tipo) && f.estado !== "anulada");
  const compras = facturas.filter((f) => ["E", "M"].includes(f.tipo) && f.estado !== "anulada");

  const ivaRows = (data?.iva ?? []).filter((i) => facturaIds.has(i.factura_id));
  const retRows = (data?.retenciones ?? []).filter((r) => facturaIds.has(r.factura_id));
  const percRows = (data?.percepciones ?? []).filter((p) => facturaIds.has(p.factura_id));

  const sum = (arr: { importe?: number | null; base_imponible?: number | null; total?: number | null; neto?: number | null; iva_total?: number | null }[], key: "importe" | "base_imponible" | "total" | "neto" | "iva_total") =>
    arr.reduce((s, r) => s + Number(r[key] ?? 0), 0);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Reportes contables</h1>
        <p className="mt-1 text-muted-foreground">Libros IVA, retenciones y percepciones del período.</p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <Stat label="Facturas" value={facturas.length} />
          <Stat label="Ventas" value={fmt(sum(ventas, "total"))} />
          <Stat label="Compras" value={fmt(sum(compras, "total"))} />
          <Stat label="IVA neto" value={fmt(sum(ventas, "iva_total") - sum(compras, "iva_total"))} />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : (
        <Tabs defaultValue="ventas">
          <TabsList>
            <TabsTrigger value="ventas">IVA Ventas</TabsTrigger>
            <TabsTrigger value="compras">IVA Compras</TabsTrigger>
            <TabsTrigger value="retenciones">Retenciones</TabsTrigger>
            <TabsTrigger value="percepciones">Percepciones</TabsTrigger>
          </TabsList>

          <TabsContent value="ventas" className="mt-4">
            <LibroIva
              titulo="Libro IVA Ventas"
              facturas={ventas}
              iva={ivaRows.filter((i) => ventas.find((f) => f.id === i.factura_id))}
              cpById={cpById}
              filename={`iva-ventas-${desde}_${hasta}.csv`}
            />
          </TabsContent>

          <TabsContent value="compras" className="mt-4">
            <LibroIva
              titulo="Libro IVA Compras"
              facturas={compras}
              iva={ivaRows.filter((i) => compras.find((f) => f.id === i.factura_id))}
              cpById={cpById}
              filename={`iva-compras-${desde}_${hasta}.csv`}
            />
          </TabsContent>

          <TabsContent value="retenciones" className="mt-4">
            <TablaImpuesto
              titulo="Retenciones del período"
              rows={retRows.map((r) => ({
                fecha: r.fecha,
                comprobante: comp(facById[r.factura_id]),
                cp: cpById[facById[r.factura_id]?.cliente_proveedor_id ?? ""]?.razon_social ?? "—",
                tipo: r.tipo,
                jurisdiccion: r.jurisdiccion ?? "—",
                base: Number(r.base_imponible),
                alicuota: Number(r.alicuota),
                importe: Number(r.importe),
              }))}
              filename={`retenciones-${desde}_${hasta}.csv`}
            />
          </TabsContent>

          <TabsContent value="percepciones" className="mt-4">
            <TablaImpuesto
              titulo="Percepciones del período"
              rows={percRows.map((p) => ({
                fecha: p.fecha,
                comprobante: comp(facById[p.factura_id]),
                cp: cpById[facById[p.factura_id]?.cliente_proveedor_id ?? ""]?.razon_social ?? "—",
                tipo: p.tipo,
                jurisdiccion: p.jurisdiccion ?? "—",
                base: Number(p.base_imponible),
                alicuota: Number(p.alicuota),
                importe: Number(p.importe),
              }))}
              filename={`percepciones-${desde}_${hasta}.csv`}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function comp(f?: Factura) {
  if (!f) return "—";
  return `${f.tipo} ${String(f.punto_venta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function LibroIva({
  titulo,
  facturas,
  iva,
  cpById,
  filename,
}: {
  titulo: string;
  facturas: Factura[];
  iva: Iva[];
  cpById: Record<string, CP>;
  filename: string;
}) {
  const exportCsv = () => {
    const header = ["Fecha", "Comprobante", "CUIT", "Razón social", "Cond. IVA", "Neto", "IVA 21", "IVA 10.5", "Otros IVA", "Percepciones", "Total"];
    const rows = facturas.map((f) => {
      const cp = cpById[f.cliente_proveedor_id ?? ""];
      const ivas = iva.filter((i) => i.factura_id === f.id);
      const iva21 = ivas.filter((i) => Number(i.alicuota) === 21).reduce((s, i) => s + Number(i.importe), 0);
      const iva105 = ivas.filter((i) => Number(i.alicuota) === 10.5).reduce((s, i) => s + Number(i.importe), 0);
      const otros = ivas.filter((i) => ![21, 10.5].includes(Number(i.alicuota))).reduce((s, i) => s + Number(i.importe), 0);
      return [
        f.fecha_emision,
        comp(f),
        cp?.cuit ?? "",
        cp?.razon_social ?? "",
        cp?.condicion_iva ?? "",
        Number(f.neto).toFixed(2),
        iva21.toFixed(2),
        iva105.toFixed(2),
        otros.toFixed(2),
        Number(f.percepciones_total).toFixed(2),
        Number(f.total).toFixed(2),
      ];
    });
    downloadCsv(filename, [header, ...rows]);
  };

  const totalNeto = facturas.reduce((s, f) => s + Number(f.neto), 0);
  const totalIva = facturas.reduce((s, f) => s + Number(f.iva_total), 0);
  const totalPerc = facturas.reduce((s, f) => s + Number(f.percepciones_total), 0);
  const totalTotal = facturas.reduce((s, f) => s + Number(f.total), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="font-semibold">{titulo}</h2>
        <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv} disabled={facturas.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      {facturas.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Sin movimientos en el período.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Comprob.</th>
                <th className="px-3 py-2">CUIT</th>
                <th className="px-3 py-2">Razón social</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2 text-right">IVA</th>
                <th className="px-3 py-2 text-right">Percep.</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => {
                const cp = cpById[f.cliente_proveedor_id ?? ""];
                return (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{f.fecha_emision}</td>
                    <td className="px-3 py-2 font-medium">{comp(f)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{cp?.cuit ?? "—"}</td>
                    <td className="px-3 py-2">{cp?.razon_social ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(f.neto))}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(f.iva_total))}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(f.percepciones_total))}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(Number(f.total))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr className="border-t border-border">
                <td colSpan={4} className="px-3 py-2 text-right">Totales</td>
                <td className="px-3 py-2 text-right">{fmt(totalNeto)}</td>
                <td className="px-3 py-2 text-right">{fmt(totalIva)}</td>
                <td className="px-3 py-2 text-right">{fmt(totalPerc)}</td>
                <td className="px-3 py-2 text-right">{fmt(totalTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

type ImpRow = {
  fecha: string;
  comprobante: string;
  cp: string;
  tipo: string;
  jurisdiccion: string;
  base: number;
  alicuota: number;
  importe: number;
};

function TablaImpuesto({ titulo, rows, filename }: { titulo: string; rows: ImpRow[]; filename: string }) {
  const total = rows.reduce((s, r) => s + r.importe, 0);
  const exportCsv = () => {
    const header = ["Fecha", "Comprobante", "Cliente/Proveedor", "Tipo", "Jurisdicción", "Base", "Alícuota %", "Importe"];
    const data = rows.map((r) => [r.fecha, r.comprobante, r.cp, r.tipo, r.jurisdiccion, r.base.toFixed(2), r.alicuota.toFixed(2), r.importe.toFixed(2)]);
    downloadCsv(filename, [header, ...data]);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="font-semibold">{titulo}</h2>
        <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Sin movimientos en el período.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Comprob.</th>
                <th className="px-3 py-2">Cliente/Prov.</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Jurisd.</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">Alic. %</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{r.fecha}</td>
                  <td className="px-3 py-2 font-medium">{r.comprobante}</td>
                  <td className="px-3 py-2">{r.cp}</td>
                  <td className="px-3 py-2 uppercase">{r.tipo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.jurisdiccion}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.base)}</td>
                  <td className="px-3 py-2 text-right">{r.alicuota.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(r.importe)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr className="border-t border-border">
                <td colSpan={7} className="px-3 py-2 text-right">Total</td>
                <td className="px-3 py-2 text-right">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}