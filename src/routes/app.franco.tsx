import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, FileDown, Image as ImageIcon, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePaginacion, Paginacion } from "@/components/paginacion";

export const Route = createFileRoute("/app/franco")({ component: Page });

export const CATEGORIA_FRANCO = "Franco_Particular";

const ESTADOS = [
  { v: "pendiente", l: "Pendiente" },
  { v: "pagada", l: "Abonado" },
] as const;

type Row = {
  id: string;
  fecha: string;
  numero: string | null;
  tipo: string;
  tipo_comprobante: string | null;
  descripcion: string | null;
  proveedor_id: string | null;
  neto: number | null;
  iva_21: number | null;
  iva_105: number | null;
  percepciones: number | null;
  otros_impuestos: number | null;
  total: number;
  estado: string | null;
  fecha_pago: string | null;
  mes: number | null;
  imagen_path: string | null;
  fema_proveedores?: { nombre: string } | null;
};

const n = (x: any) => Number(x ?? 0);

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [mes, setMes] = useState<string>("todos");
  const [estadoF, setEstadoF] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [imgRow, setImgRow] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["franco", year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_compra")
        .select("*, fema_proveedores(nombre)")
        .eq("anio", year)
        .eq("categoria", CATEGORIA_FRANCO as any)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (mes !== "todos" && String(r.mes ?? "") !== mes) return false;
      if (estadoF !== "todos" && (r.estado ?? "pendiente") !== estadoF) return false;
      if (!q) return true;
      return [r.numero, r.descripcion, r.fema_proveedores?.nombre].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [rows, mes, estadoF, busca]);

  const pag = usePaginacion(filtered, 50);

  const totales = useMemo(() => {
    const t = filtered.reduce(
      (a, r) => {
        const iva = n(r.iva_21) + n(r.iva_105);
        a.total += n(r.total);
        a.neto += n(r.neto);
        a.iva += iva;
        a.otros += n(r.percepciones) + n(r.otros_impuestos);
        if ((r.estado ?? "pendiente") === "pagada") a.abonado += n(r.total);
        else a.pendiente += n(r.total);
        return a;
      },
      { total: 0, neto: 0, iva: 0, otros: 0, abonado: 0, pendiente: 0 },
    );
    return t;
  }, [filtered]);

  const cambiarEstado = async (r: Row, estado: string) => {
    const { error } = await supabase
      .from("fema_facturas_compra")
      .update({ estado: estado as any, fecha_pago: estado === "pagada" ? (r.fecha_pago ?? new Date().toISOString().slice(0, 10)) : null })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(estado === "pagada" ? "Marcada como abonada" : "Marcada como pendiente");
    qc.invalidateQueries({ queryKey: ["franco"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
  };

  const exportar = () => {
    // (exportación a Excel)
    // (exportación a Excel)
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        Fecha: r.fecha,
        Comprobante: `${r.tipo}-${r.numero ?? "s/n"}`,
        Tipo: r.tipo_comprobante ?? "Factura",
        Proveedor: r.fema_proveedores?.nombre ?? "—",
        Detalle: r.descripcion ?? "",
        Neto: n(r.neto),
        IVA: n(r.iva_21) + n(r.iva_105),
        "Otros imp.": n(r.percepciones) + n(r.otros_impuestos),
        Total: n(r.total),
        Estado: (r.estado ?? "pendiente") === "pagada" ? "Abonado" : "Pendiente",
        "Fecha de pago": r.fecha_pago ?? "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Franco");
    XLSX.writeFile(wb, `franco-${year}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold sm:text-2xl">Franco {year}</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Comprobantes a nombre de FEMA Agronegocios abonados con tarjeta personal de Franco. No impactan en caja,
              pero sí en IVA e impuestos de Auditoría.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {rows.some((r) => (r.estado ?? "pendiente") !== "pagada") && (
            <Button variant="secondary" onClick={marcarTodasAbonadas}>
              Marcar todas abonadas
            </Button>
          )}
          <Button variant="outline" onClick={exportar}>
            <FileDown className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { l: "Total comprobantes", v: formatPesos(totales.total) },
          { l: "Neto gravado", v: formatPesos(totales.neto) },
          { l: "IVA crédito fiscal", v: formatPesos(totales.iva), color: "text-primary" },
          { l: "Abonado por Franco", v: formatPesos(totales.abonado) },
          { l: "Pendiente", v: formatPesos(totales.pendiente), color: "text-destructive" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={`mt-1 text-base font-bold ${k.color ?? ""}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Buscar proveedor, número o detalle…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los meses</SelectItem>
            {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={estadoF} onValueChange={setEstadoF}>
          <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprobante</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[150px]">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    Sin comprobantes de Franco. Cargá facturas desde OCR o Compras eligiendo la categoría <b>Franco</b>.
                  </TableCell>
                </TableRow>
              )}
              {pag.pageItems.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.imagen_path ? (
                      <button
                        type="button"
                        onClick={() => setImgRow(r)}
                        className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
                        title="Ver imagen del comprobante"
                      >
                        <ImageIcon className="h-3 w-3" />
                        {r.tipo}-{r.numero ?? "—"}
                      </button>
                    ) : (
                      <>{r.tipo}-{r.numero ?? "—"}</>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{r.fema_proveedores?.nombre ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatFecha(r.fecha)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground" title={r.descripcion ?? ""}>
                    {r.descripcion ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatPesos(n(r.neto))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatPesos(n(r.iva_21) + n(r.iva_105))}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(n(r.total))}</TableCell>
                  <TableCell>
                    <Select value={(r.estado ?? "pendiente")} onValueChange={(v) => cambiarEstado(r, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {r.fecha_pago && (
                      <Badge variant="outline" className="mt-1 text-[10px]">Pagó {formatFecha(r.fecha_pago)}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Paginacion page={pag.page} totalPages={pag.totalPages} total={pag.total} pageSize={pag.pageSize} onPage={pag.setPage} label="comprobantes" />
      </div>

      <Dialog open={!!imgRow} onOpenChange={(o) => !o && setImgRow(null)}>
        {imgRow && <ImagenDialog row={imgRow} />}
      </Dialog>
    </div>
  );
}

function ImagenDialog({ row }: { row: Row }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["franco-img", row.id, row.imagen_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("facturas-img").createSignedUrl(row.imagen_path!, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const esPdf = (row.imagen_path ?? "").toLowerCase().endsWith(".pdf");
  return (
    <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Comprobante {row.tipo}-{row.numero ?? "s/n"}</DialogTitle>
        <DialogDescription>Imagen del comprobante cargado.</DialogDescription>
      </DialogHeader>
      {isLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>}
      {error && <p className="py-8 text-sm text-destructive">No se pudo cargar la imagen.</p>}
      {data && (esPdf
        ? <iframe src={data} className="h-[70vh] w-full rounded-lg border border-border" title="Comprobante" />
        : <img src={data} alt="Comprobante" className="w-full rounded-lg border border-border" />)}
      {data && (
        <DialogFooter>
          <Button variant="outline" onClick={() => window.open(data, "_blank")}>Abrir en pestaña nueva</Button>
        </DialogFooter>
      )}
    </DialogContent>
  );
}
