import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ScanLine, UploadCloud, Loader2, FileImage } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/ocr")({ component: Page });

type OCRResult = {
  tipo?: string; letra?: string | null; numero?: string | null;
  fecha?: string | null; emisor?: string | null; receptor?: string | null;
  descripcion?: string | null; categoria_sugerida?: string;
  es_combustible?: boolean; neto?: number; iva_21?: number; iva_105?: number;
  itc_combustible?: number; co2_combustible?: number; otros_impuestos?: number;
  percepciones?: number; total?: number; litros?: number | null;
  producto_combustible?: string | null; moneda?: string;
};

function Page() {
  const [preview, setPreview] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Archivo máximo 5 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setMime(file.type);
      setB64(dataUrl.split(",")[1]);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"], "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  const analizar = async () => {
    if (!b64 || !mime) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/public/ocr-factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mimeType: mime }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al procesar");
      setResult(json.data ?? json);
      toast.success("Factura analizada");
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  const confianzaOk = result && (result.total ?? 0) > 0 && !!result.fecha;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">OCR de Facturas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Subí una imagen o PDF para extraer datos automáticamente con IA.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
              isDragActive ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30"
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {isDragActive ? "Soltá el archivo aquí" : "Arrastrá o hacé clic para subir (máx 5 MB)"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP, PDF</p>
          </div>

          {preview && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileImage className="h-4 w-4" /> Previsualización
                </span>
                <Button size="sm" onClick={analizar} disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1.5 h-4 w-4" />}
                  Analizar factura
                </Button>
              </div>
              {mime?.startsWith("image/")
                ? <img src={preview} alt="preview" className="mt-3 max-h-80 w-full rounded object-contain" />
                : <div className="mt-3 grid h-40 place-items-center rounded bg-muted text-xs text-muted-foreground">PDF cargado</div>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Resultado extraído</h3>
            {result && (
              <Badge className={confianzaOk ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"}>
                {confianzaOk ? "Datos completos" : "Revisar datos"}
              </Badge>
            )}
          </div>
          {!result ? (
            <p className="grid h-64 place-items-center text-sm text-muted-foreground">
              Subí una factura y presioná Analizar.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Tipo", result.tipo], ["Letra", result.letra ?? "—"],
                ["Número", result.numero ?? "—"], ["Fecha", result.fecha ?? "—"],
                ["Emisor", result.emisor ?? "—"], ["Receptor", result.receptor ?? "—"],
                ["Categoría sugerida", result.categoria_sugerida ?? "—"],
                ["Es combustible", result.es_combustible ? "Sí" : "No"],
                ["Neto", result.neto ?? 0], ["IVA 21%", result.iva_21 ?? 0],
                ["IVA 10.5%", result.iva_105 ?? 0], ["Percepciones", result.percepciones ?? 0],
                ["Total", result.total ?? 0], ["Moneda", result.moneda ?? "ARS"],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <Label className="text-xs text-muted-foreground">{k}</Label>
                  <Input value={String(v ?? "")} readOnly className="mt-1 h-8 text-sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}