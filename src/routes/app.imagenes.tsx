import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  Image as ImageIcon, Download, Trash2, ShoppingCart, Receipt, FileImage, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/imagenes")({ component: Page });

type Row = {
  id: string;
  fecha: string;
  numero: string | null;
  total: number | null;
  imagen_path: string;
  tercero: string | null;
};

type Kind = "compra" | "venta";

function useImagenes(kind: Kind, desde: string, hasta: string) {
  return useQuery({
    queryKey: ["imagenes", kind, desde, hasta],
    queryFn: async (): Promise<Row[]> => {
      const tabla = kind === "compra" ? "fema_facturas_compra" : "fema_facturas_venta";
      const rel = kind === "compra"
        ? "fema_proveedores(nombre)"
        : "fema_clientes(nombre)";
      let q = supabase
        .from(tabla)
        .select(`id, fecha, numero, total, imagen_path, ${rel}`)
        .not("imagen_path", "is", null)
        .order("fecha", { ascending: false });
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        fecha: r.fecha,
        numero: r.numero,
        total: r.total,
        imagen_path: r.imagen_path,
        tercero: kind === "compra"
          ? (r.fema_proveedores?.nombre ?? null)
          : (r.fema_clientes?.nombre ?? null),
      }));
    },
  });
}

async function signedUrl(path: string) {
  const { data, error } = await supabase.storage
    .from("facturas-img")
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

function fileName(kind: Kind, r: Row) {
  const ext = r.imagen_path.split(".").pop() ?? "bin";
  const base = `${kind}_${r.fecha}_${(r.numero ?? r.id.slice(0, 6)).replace(/[^A-Za-z0-9_-]/g, "-")}`;
  return `${base}.${ext}`;
}

function Panel({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const [desde, setDesde] = useState<string>(first.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState<string>(now.toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const { data: rows, isLoading } = useImagenes(kind, desde, hasta);

  const selectedRows = useMemo(
    () => (rows ?? []).filter((r) => selected[r.id]),
    [rows, selected],
  );
  const allSelected = (rows?.length ?? 0) > 0 && selectedRows.length === (rows?.length ?? 0);

  const toggleAll = () => {
    if (!rows) return;
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(rows.map((r) => [r.id, true])));
  };

  const descargarUna = async (r: Row) => {
    try {
      const url = await signedUrl(r.imagen_path);
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = fileName(kind, r);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      toast.error(e.message ?? "Error al descargar");
    }
  };

  const verImagen = async (r: Row) => {
    try {
      const url = await signedUrl(r.imagen_path);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Error al abrir imagen");
    }
  };

  const descargarZip = async (liberarEspacio: boolean) => {
    if (selectedRows.length === 0) return toast.error("Seleccioná al menos una imagen");
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`facturas_${kind}_${desde}_a_${hasta}`)!;
      for (const r of selectedRows) {
        try {
          const url = await signedUrl(r.imagen_path);
          const res = await fetch(url);
          const blob = await res.blob();
          folder.file(fileName(kind, r), blob);
        } catch { /* saltar archivos rotos */ }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(zipBlob);
      a.href = objUrl;
      a.download = `facturas_${kind}_${desde}_a_${hasta}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);

      if (liberarEspacio) {
        const paths = selectedRows.map((r) => r.imagen_path);
        const { error: delErr } = await supabase.storage.from("facturas-img").remove(paths);
        if (delErr) throw delErr;
        const tabla = kind === "compra" ? "fema_facturas_compra" : "fema_facturas_venta";
        const ids = selectedRows.map((r) => r.id);
        const { error: updErr } = await supabase
          .from(tabla)
          .update({ imagen_path: null })
          .in("id", ids);
        if (updErr) throw updErr;
        toast.success(`Se liberó espacio: ${paths.length} imagen(es) eliminadas`);
        setSelected({});
        qc.invalidateQueries({ queryKey: ["imagenes", kind] });
      } else {
        toast.success(`ZIP descargado (${selectedRows.length} imágenes)`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Error en la descarga masiva");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <Label className="text-xs text-muted-foreground">Desde (fecha factura)</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setDesde(""); setHasta(""); }}>
          Limpiar
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Badge variant="secondary">{rows?.length ?? 0} imagen(es)</Badge>
          <Badge>{selectedRows.length} seleccionada(s)</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => descargarZip(false)}
            disabled={busy || selectedRows.length === 0}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Descargar ZIP
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={busy || selectedRows.length === 0}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Descargar y liberar espacio
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Descargar y eliminar del almacenamiento</AlertDialogTitle>
                <AlertDialogDescription>
                  Se descargará un ZIP con {selectedRows.length} imagen(es) y luego se
                  eliminarán del bucket. Los datos de las facturas (importes, proveedor,
                  etc.) NO se borran, solo la imagen escaneada. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => descargarZip(true)}>
                  Descargar y liberar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">{kind === "compra" ? "Proveedor" : "Cliente"}</th>
              <th className="px-3 py-2">Número</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (rows?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileImage className="h-8 w-8" />
                    <p>No hay imágenes en el rango seleccionado</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows!.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={!!selected[r.id]}
                      onCheckedChange={(v) =>
                        setSelected((s) => ({ ...s, [r.id]: v === true }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{r.fecha}</td>
                  <td className="px-3 py-2">{r.tercero ?? "—"}</td>
                  <td className="px-3 py-2">{r.numero ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.total != null ? r.total.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => verImagen(r)}>
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => descargarUna(r)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Page() {
  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Imágenes de Facturas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Archivo de comprobantes escaneados. Descargá individualmente, en lote (ZIP) o liberá espacio del almacenamiento.
        </p>
      </header>

      <Tabs defaultValue="compra">
        <TabsList>
          <TabsTrigger value="compra">
            <ShoppingCart className="mr-1.5 h-4 w-4" /> Compras
          </TabsTrigger>
          <TabsTrigger value="venta">
            <Receipt className="mr-1.5 h-4 w-4" /> Ventas / Servicios
          </TabsTrigger>
        </TabsList>
        <TabsContent value="compra" className="mt-4">
          <Panel kind="compra" />
        </TabsContent>
        <TabsContent value="venta" className="mt-4">
          <Panel kind="venta" />
        </TabsContent>
      </Tabs>
    </div>
  );
}