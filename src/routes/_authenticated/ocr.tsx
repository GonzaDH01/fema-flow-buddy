import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, ScanLine, Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { extractFactura, type ExtractedFactura } from "@/lib/ocr.functions";
import { pdfFirstPageToPng } from "@/lib/pdf-to-image";

export const Route = createFileRoute("/_authenticated/ocr")({
  component: OcrPage,
});

type Extracted = ExtractedFactura;

const fmt = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.split(",")[1] ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function OcrPage() {
  const navigate = useNavigate();
  const extract = useServerFn(extractFactura);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Extracted | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Seleccioná una imagen primero");
      if (file.size > 8 * 1024 * 1024) throw new Error("La imagen supera los 8 MB");
      let b64: string;
      let mimeType: string;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const rendered = await pdfFirstPageToPng(file, 2);
        b64 = rendered.base64;
        mimeType = rendered.mimeType;
      } else {
        b64 = await readAsBase64(file);
        mimeType = file.type || "image/jpeg";
      }
      return await extract({ data: { imageBase64: b64, mimeType } });
    },
    onSuccess: (d) => {
      setResult(d as Extracted);
      toast.success("Datos extraídos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = async (f: File | null) => {
    setFile(f);
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!f) { setPreview(null); return; }
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      try {
        const { base64 } = await pdfFirstPageToPng(f, 1.5);
        setPreview(`data:image/png;base64,${base64}`);
      } catch {
        setPreview(null);
      }
    } else {
      setPreview(URL.createObjectURL(f));
    }
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">OCR de comprobantes</h1>
        <p className="mt-1 text-muted-foreground">
          Subí una foto o captura del comprobante. La IA extrae los datos para que crees la factura más rápido.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label>Imagen del comprobante</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Formatos: JPG, PNG, WEBP o PDF (primera página). Máx. 8 MB.
            </p>
          </div>

          {preview && (
            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              <img src={preview} alt="Comprobante" className="max-h-80 w-full object-contain" />
            </div>
          )}

          <Button
            className="w-full gap-2"
            disabled={!file || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</>
            ) : (
              <><ScanLine className="h-4 w-4" /> Extraer datos</>
            )}
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Datos extraídos</h2>
            {result?.confianza != null && (
              <span className="text-xs text-muted-foreground">
                Confianza: {(result.confianza * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {!result ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <Upload className="mx-auto mb-2 h-6 w-6" />
              Subí una imagen y presioná “Extraer datos”.
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo" value={result.tipo ?? "—"} />
                <Field label="Comprobante" value={
                  result.punto_venta != null && result.numero != null
                    ? `${String(result.punto_venta).padStart(4, "0")}-${String(result.numero).padStart(8, "0")}`
                    : "—"
                } />
                <Field label="Fecha emisión" value={result.fecha_emision ?? "—"} />
                <Field label="Vencimiento" value={result.fecha_vencimiento ?? "—"} />
                <Field label="Razón social" value={result.razon_social ?? "—"} />
                <Field label="CUIT" value={result.cuit ?? "—"} />
                <Field label="Cond. IVA" value={result.condicion_iva?.replace(/_/g, " ") ?? "—"} />
                <Field label="Concepto" value={result.concepto ?? "—"} />
              </div>

              {result.iva_lineas && result.iva_lineas.length > 0 && (
                <div>
                  <h4 className="mb-1 font-semibold">IVA detectado</h4>
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="py-1">Alícuota</th><th className="py-1 text-right">Base</th><th className="py-1 text-right">Importe</th></tr>
                    </thead>
                    <tbody>
                      {result.iva_lineas.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1">{l.alicuota}%</td>
                          <td className="py-1 text-right">{fmt(l.base_imponible)}</td>
                          <td className="py-1 text-right">{fmt(l.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-lg bg-muted/40 p-3">
                <div className="grid grid-cols-2 gap-y-1">
                  <span className="text-muted-foreground">Neto</span><span className="text-right">{fmt(result.neto)}</span>
                  <span className="text-muted-foreground">IVA</span><span className="text-right">{fmt(result.iva_total)}</span>
                  <span className="text-muted-foreground">Percepciones</span><span className="text-right">{fmt(result.percepciones_total)}</span>
                  <span className="text-muted-foreground">Retenciones</span><span className="text-right">-{fmt(result.retenciones_total)}</span>
                  <span className="border-t border-border pt-1 font-semibold">Total</span>
                  <span className="border-t border-border pt-1 text-right font-semibold">{fmt(result.total)}</span>
                </div>
              </div>

              <div className="flex gap-2 border-t border-border pt-4">
                <Button className="gap-2" onClick={() => navigate({ to: "/facturas" })}>
                  <CheckCircle2 className="h-4 w-4" /> Ir a Facturas
                </Button>
                <Button variant="outline" onClick={() => { setResult(null); onPick(null); }}>
                  Procesar otro
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Revisá los valores y cargá la factura desde el módulo Facturas usando estos datos como referencia.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium capitalize">{value}</div>
    </div>
  );
}