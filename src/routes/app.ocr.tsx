import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ScanLine, UploadCloud, Loader2, FileImage, Save, ShoppingCart, Receipt, Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/app/ocr")({ component: Page });

type OCRResult = {
  tipo?: string; letra?: string | null; numero?: string | null;
  fecha?: string | null; emisor?: string | null; receptor?: string | null;
  cuit_emisor?: string | null; cuit_receptor?: string | null;
  descripcion?: string | null; categoria_sugerida?: string;
  es_combustible?: boolean; neto?: number; iva_21?: number; iva_105?: number;
  itc_combustible?: number; co2_combustible?: number; otros_impuestos?: number;
  percepciones?: number; total?: number; litros?: number | null;
  producto_combustible?: string | null; moneda?: string;
};

type DocKind = "compra" | "venta";

function Page() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [preview, setPreview] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [kind, setKind] = useState<DocKind>("compra");
  const [saving, setSaving] = useState(false);

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

  const onCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onDrop([file]);
    e.target.value = "";
  };

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Sesión expirada. Iniciá sesión nuevamente.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/public/ocr-factura", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  const guardar = async () => {
    if (!result || !user) return toast.error("Sin datos o sesión");
    setSaving(true);
    try {
      const letra = (result.letra ?? "B").toUpperCase();
      const tipo = (["A", "B", "C", "M", "E"].includes(letra) ? letra : "B") as "A"|"B"|"C"|"M"|"E";
      // Nombre del tercero: en compras es el emisor; en ventas el receptor (fallback emisor)
      const terceroNombre = (kind === "compra" ? result.emisor : (result.receptor ?? result.emisor))?.trim() || null;
      const terceroCuitRaw = (kind === "compra" ? result.cuit_emisor : (result.cuit_receptor ?? result.cuit_emisor)) ?? null;
      const terceroCuit = terceroCuitRaw ? String(terceroCuitRaw).replace(/[^0-9]/g, "") : null;

      // Buscar o crear proveedor/cliente
      let terceroId: string | null = null;
      if (terceroNombre || terceroCuit) {
        const tabla = kind === "compra" ? "fema_proveedores" : "fema_clientes";
        let existente: { id: string } | null = null;
        if (terceroCuit) {
          const { data } = await supabase
            .from(tabla)
            .select("id")
            .eq("cuit", terceroCuit)
            .maybeSingle();
          existente = data ?? null;
        }
        if (!existente && terceroNombre) {
          const { data } = await supabase
            .from(tabla)
            .select("id, cuit")
            .ilike("nombre", terceroNombre)
            .maybeSingle();
          if (data) {
            existente = { id: data.id };
            // si no tenía CUIT y ahora lo tenemos, lo completamos
            if (terceroCuit && !data.cuit) {
              await supabase.from(tabla).update({ cuit: terceroCuit }).eq("id", data.id);
            }
          }
        }
        if (existente?.id) {
          terceroId = existente.id;
        } else {
          const nuevo: any = { user_id: user.id, nombre: terceroNombre ?? `CUIT ${terceroCuit}`, cuit: terceroCuit };
          if (kind === "compra") nuevo.categoria = (result.categoria_sugerida as any) ?? "Otro";
          const { data: creado, error: errC } = await supabase
            .from(tabla)
            .insert(nuevo)
            .select("id")
            .single();
          if (errC) throw errC;
          terceroId = creado?.id ?? null;
          toast.message(`${kind === "compra" ? "Proveedor" : "Cliente"} "${nuevo.nombre}" creado${terceroCuit ? ` (CUIT ${terceroCuit})` : ""}`);
        }
      }

      const base = {
        user_id: user.id,
        fecha: result.fecha ?? new Date().toISOString().slice(0, 10),
        numero: result.numero ?? null,
        tipo,
        neto: result.neto ?? 0,
        iva_21: result.iva_21 ?? 0,
        iva_105: result.iva_105 ?? 0,
        percepciones: result.percepciones ?? 0,
        total: result.total ?? 0,
        tipo_comprobante: result.tipo ?? "Factura",
        observaciones: `OCR: ${result.emisor ?? ""}${result.descripcion ? " - " + result.descripcion : ""}`.trim(),
      };
      if (kind === "compra") {
        const { error } = await supabase.from("fema_facturas_compra").insert({
          ...base,
          proveedor_id: terceroId,
          categoria: (result.categoria_sugerida as any) ?? "Otro",
          descripcion: result.descripcion ?? result.emisor ?? null,
          otros_impuestos: result.otros_impuestos ?? 0,
          impuestos_internos: (result.itc_combustible ?? 0) + (result.co2_combustible ?? 0),
          litros: result.litros ?? 0,
          producto: result.producto_combustible ?? null,
        });
        if (error) throw error;
        toast.success("Factura de compra guardada");
      } else {
        const { error } = await supabase.from("fema_facturas_venta").insert({
          ...base,
          cliente_id: terceroId,
          trabajo: result.descripcion ?? null,
        });
        if (error) throw error;
        toast.success("Factura de venta guardada");
      }
      setResult(null);
      setPreview(null);
      setB64(null);
      setMime(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">OCR de Facturas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Subí una imagen o PDF para extraer datos automáticamente con IA.</p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Label className="text-sm font-medium">Tipo de comprobante:</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={kind === "compra" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("compra")}
          >
            <ShoppingCart className="mr-1.5 h-4 w-4" /> Factura de compra
          </Button>
          <Button
            type="button"
            variant={kind === "venta" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("venta")}
          >
            <Receipt className="mr-1.5 h-4 w-4" /> Factura de venta / servicio
          </Button>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {kind === "compra" ? "Se cargará en Compras" : "Se cargará en Facturas (ventas)"}
        </p>
      </div>

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

          {isMobile && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-muted/30">
              <Camera className="h-5 w-5" />
              Tomar foto con la cámara
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onCameraCapture}
              />
            </label>
          )}

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
                ["CUIT Emisor", result.cuit_emisor ?? "—"], ["CUIT Receptor", result.cuit_receptor ?? "—"],
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
          {result && (
            <div className="mt-4 flex justify-end">
              <Button onClick={guardar} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Guardar como {kind === "compra" ? "compra" : "venta"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}