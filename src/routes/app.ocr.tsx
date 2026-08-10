import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ScanLine, UploadCloud, Loader2, FileImage, Save, ShoppingCart, Receipt, Camera, Paperclip, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/ocr")({ component: Page });

type OCRResult = {
  tipo?: string; letra?: string | null; numero?: string | null;
  fecha?: string | null; emisor?: string | null; receptor?: string | null;
  cuit_emisor?: string | null; cuit_receptor?: string | null;
  emisor_domicilio?: string | null; emisor_localidad?: string | null;
  emisor_telefono?: string | null; emisor_email?: string | null;
  emisor_condicion_iva?: string | null; emisor_iibb?: string | null;
  receptor_domicilio?: string | null; receptor_localidad?: string | null;
  receptor_telefono?: string | null; receptor_email?: string | null;
  receptor_condicion_iva?: string | null; receptor_iibb?: string | null;
  descripcion?: string | null; categoria_sugerida?: string;
  es_combustible?: boolean; neto?: number; iva_21?: number; iva_105?: number;
  itc_combustible?: number; co2_combustible?: number; otros_impuestos?: number;
  itc_nafta?: number; itc_gasoil?: number; co2_nafta?: number; co2_gasoil?: number;
  percepciones?: number; total?: number; litros?: number | null;
  producto_combustible?: string | null; moneda?: string;
};

type DocKind = "compra" | "venta";
type Modo = "nuevo" | "adjuntar";

async function listAllPaths(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabase.storage.from("facturas-img").list(prefix, { limit: 1000 });
  if (error) return out;
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    if ((entry as any).id === null || (entry as any).metadata == null) {
      out.push(...(await listAllPaths(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

type PendienteRow = {
  id: string;
  fecha: string;
  numero: string | null;
  total: number | null;
  tercero: string | null;
};

const CATS_COMPRA = [
  "Gasoil_Combustible", "Repuestos_JD", "Repuestos", "Mecanicos", "Gomeria",
  "Inoculante", "Transportistas", "Seguros", "Servicios", "Herramientas",
  "Mano_de_Obra", "Honorarios", "Maquinaria_Rodados", "Pago_Creditos",
  "Inversiones", "Franco_Particular", "Otro",
] as const;
const CATS_VENTA = [
  "Picado", "Embolsado", "Servicios", "Mano_de_Obra", "Honorarios", "Franco_Particular", "Otro",
] as const;
const labelCat = (c: string) => {
  if (c === "Gasoil_Combustible") return "Gasoil / Combustible";
  if (c === "Mano_de_Obra") return "Mano de Obra";
  if (c === "Franco_Particular") return "Franco";
  if (c === "Maquinaria_Rodados") return "Maquinaria / Rodados";
  if (c === "Pago_Creditos") return "Pago de créditos";
  return c.replace(/_/g, " ");
};

const onlyDigits = (value: string | null | undefined) => value ? String(value).replace(/[^0-9]/g, "") : "";
const cleanName = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(SA|S\.A\.|SRL|S\.R\.L\.|CUIT|IVA|RESPONSABLE|MONOTRIBUTO)\b/gi, "")
  .replace(/[^a-z0-9]+/gi, " ")
  .trim()
  .toLowerCase();
const compatibleName = (a: string | null | undefined, b: string | null | undefined) => {
  const left = cleanName(a);
  const right = cleanName(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
};

// La empresa propia nunca puede ser proveedor (en compras) ni cliente (en ventas).
const EMPRESA_PROPIA = /fema\s*agro/i;
const esEmpresaPropia = (nombre?: string | null) => EMPRESA_PROPIA.test((nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

/** Si el modelo confundió emisor y receptor (típico: pone a FEMA como emisor en una
 *  factura de compra), invierte los bloques para que el tercero sea el correcto. */
function corregirPartes(r: OCRResult, kind: DocKind): OCRResult {
  const debeInvertir = kind === "compra"
    ? esEmpresaPropia(r.emisor) && !esEmpresaPropia(r.receptor) && !!(r.receptor ?? r.cuit_receptor)
    : esEmpresaPropia(r.receptor) && !esEmpresaPropia(r.emisor) && !!(r.emisor ?? r.cuit_emisor);
  if (!debeInvertir) return r;
  return {
    ...r,
    emisor: r.receptor ?? null, receptor: r.emisor ?? null,
    cuit_emisor: r.cuit_receptor ?? null, cuit_receptor: r.cuit_emisor ?? null,
    emisor_domicilio: r.receptor_domicilio ?? null, receptor_domicilio: r.emisor_domicilio ?? null,
    emisor_localidad: r.receptor_localidad ?? null, receptor_localidad: r.emisor_localidad ?? null,
    emisor_telefono: r.receptor_telefono ?? null, receptor_telefono: r.emisor_telefono ?? null,
    emisor_email: r.receptor_email ?? null, receptor_email: r.emisor_email ?? null,
    emisor_condicion_iva: r.receptor_condicion_iva ?? null, receptor_condicion_iva: r.emisor_condicion_iva ?? null,
    emisor_iibb: r.receptor_iibb ?? null, receptor_iibb: r.emisor_iibb ?? null,
  };
}

const TIPOS_COMPROBANTE = [
  "Factura", "Nota de crédito", "Nota de débito", "Recibo", "Ticket",
  "Comprobante provisorio", "Remito", "Otro",
] as const;

type Aviso = { campo: string; nivel: "error" | "warn"; msg: string };

/** Revisión previa campo por campo: marca lo que falta o no cierra antes de guardar. */
function revisarOCR(r: OCRResult, kind: DocKind): Aviso[] {
  const avisos: Aviso[] = [];
  const tercero = kind === "compra" ? r.emisor : r.receptor;
  const cuitTercero = kind === "compra" ? r.cuit_emisor : r.cuit_receptor;

  if (!r.fecha) avisos.push({ campo: "Fecha", nivel: "error", msg: "No se pudo leer la fecha del comprobante." });
  if (!(r.total ?? 0)) avisos.push({ campo: "Total", nivel: "error", msg: "El total quedó en cero: cargalo a mano." });
  if (!tercero) avisos.push({ campo: kind === "compra" ? "Proveedor" : "Cliente", nivel: "error", msg: "Falta el nombre del tercero." });
  if (esEmpresaPropia(tercero)) avisos.push({ campo: kind === "compra" ? "Proveedor" : "Cliente", nivel: "error", msg: "Figura la empresa propia como tercero: corregilo." });
  if (!r.numero) avisos.push({ campo: "Número", nivel: "warn", msg: "Sin número no se puede detectar duplicados." });

  const cuit = onlyDigits(cuitTercero);
  if (!cuit) avisos.push({ campo: "CUIT", nivel: "warn", msg: "Sin CUIT no se puede vincular con la ficha existente." });
  else if (cuit.length !== 11) avisos.push({ campo: "CUIT", nivel: "warn", msg: "El CUIT no tiene 11 dígitos." });

  const suma =
    (r.neto ?? 0) + (r.iva_21 ?? 0) + (r.iva_105 ?? 0) + (r.percepciones ?? 0) +
    (r.otros_impuestos ?? 0) + (r.itc_combustible ?? 0) + (r.co2_combustible ?? 0);
  if ((r.total ?? 0) > 0 && suma > 0 && Math.abs(suma - (r.total ?? 0)) > Math.max(1, (r.total ?? 0) * 0.01)) {
    avisos.push({ campo: "Importes", nivel: "warn", msg: "Neto + IVA + percepciones + otros impuestos no coincide con el total leído. Revisá el pie del comprobante." });
  }
  if ((r.total ?? 0) > 0 && !(r.neto ?? 0)) {
    avisos.push({ campo: "Neto", nivel: "warn", msg: "No se leyó el neto gravado (queda fuera del libro IVA)." });
  }
  return avisos;
}

const normalizarTipoComprobante = (t?: string | null) => {
  const v = (t ?? "").toLowerCase();
  if (v.includes("credito") || v.includes("crédito")) return "Nota de crédito";
  if (v.includes("debito") || v.includes("débito")) return "Nota de débito";
  if (v.includes("recibo")) return "Recibo";
  if (v.includes("ticket")) return "Ticket";
  if (v.includes("remito")) return "Remito";
  if (v.includes("provisor")) return "Comprobante provisorio";
  if (v.includes("factura")) return "Factura";
  return "Otro";
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [preview, setPreview] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [kind, setKind] = useState<DocKind>("compra");
  const [saving, setSaving] = useState(false);
  const [modo, setModo] = useState<Modo>("nuevo");
  const [busqueda, setBusqueda] = useState("");
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [dupe, setDupe] = useState<{ id: string; numero: string | null; total: number | null; fecha: string | null; tercero: string | null; tieneImagen: boolean } | null>(null);

  const tablaKind = kind === "compra" ? "fema_facturas_compra" : "fema_facturas_venta";

  // Verifica si un archivo sigue existiendo en el bucket (puede haber sido eliminado)
  const existeArchivo = async (path?: string | null) => {
    if (!path) return false;
    const idx = path.lastIndexOf("/");
    const folder = idx > 0 ? path.slice(0, idx) : "";
    const name = idx > 0 ? path.slice(idx + 1) : path;
    const { data } = await supabase.storage.from("facturas-img").list(folder, { limit: 100, search: name });
    return (data ?? []).some((f) => f.name === name);
  };

  // Busca un comprobante ya cargado con el mismo número (y total aproximado)
  const buscarDuplicado = async (r: OCRResult) => {
    if (!r?.numero) return null;
    const rel = kind === "compra" ? "fema_proveedores(nombre)" : "fema_clientes(nombre)";
    const { data } = await supabase
      .from(tablaKind)
      .select(`id, numero, total, fecha, imagen_path, ${rel}`)
      .eq("numero", r.numero)
      .limit(5);
    const match = (data ?? []).find((d: any) => Math.abs((d.total ?? 0) - (r.total ?? 0)) < 1) as any;
    if (!match) return null;
    const tieneImagen = await existeArchivo(match.imagen_path);
    // Si la referencia quedó rota (imagen eliminada), la limpiamos para poder re-adjuntar
    if (match.imagen_path && !tieneImagen) {
      await supabase.from(tablaKind).update({ imagen_path: null }).eq("id", match.id);
    }
    return {
      id: match.id as string,
      numero: match.numero ?? null,
      total: match.total ?? null,
      fecha: match.fecha ?? null,
      tercero: kind === "compra" ? (match.fema_proveedores?.nombre ?? null) : (match.fema_clientes?.nombre ?? null),
      tieneImagen,
    };
  };

  const { data: pendientes, isLoading: loadingPend } = useQuery({
    queryKey: ["ocr_sin_imagen", kind],
    enabled: modo === "adjuntar",
    queryFn: async (): Promise<PendienteRow[]> => {
      const rel = kind === "compra" ? "fema_proveedores(nombre)" : "fema_clientes(nombre)";
      const { data, error } = await supabase
        .from(tablaKind)
        .select(`id, fecha, numero, total, imagen_path, ${rel}`)
        .order("fecha", { ascending: false })
        .limit(300);
      if (error) throw error;
      // Archivos realmente existentes en el bucket
      const existentes = new Set(await listAllPaths(""));
      const rotos = (data ?? []).filter((r: any) => r.imagen_path && !existentes.has(r.imagen_path));
      if (rotos.length) {
        await supabase
          .from(tablaKind)
          .update({ imagen_path: null })
          .in("id", rotos.map((r: any) => r.id));
      }
      const sinImagen = (data ?? []).filter((r: any) => !r.imagen_path || !existentes.has(r.imagen_path));
      return sinImagen.map((r: any) => ({
        id: r.id,
        fecha: r.fecha,
        numero: r.numero,
        total: r.total,
        tercero: kind === "compra" ? (r.fema_proveedores?.nombre ?? null) : (r.fema_clientes?.nombre ?? null),
      }));
    },
    staleTime: 0,
  });

  const filtrados = (pendientes ?? []).filter((r) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return [r.numero, r.tercero, r.fecha, String(r.total ?? "")]
      .some((v) => (v ?? "").toString().toLowerCase().includes(q));
  });

  const subirImagen = async () => {
    if (!b64 || !mime || !user) return null;
    const ext = mime.includes("pdf") ? "pdf" : (mime.split("/")[1] ?? "jpg");
    const path = `${kind}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from("facturas-img")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
    return path;
  };

  const limpiar = () => {
    setResult(null);
    setPreview(null);
    setB64(null);
    setMime(null);
    setDestinoId(null);
  };

  const adjuntar = async (idForzado?: string) => {
    const id = idForzado ?? destinoId;
    if (!id) return toast.error("Elegí el comprobante ya cargado");
    if (!b64 || !mime) return toast.error("Subí primero la imagen");
    setSaving(true);
    try {
      const path = await subirImagen();
      const { error } = await supabase.from(tablaKind).update({ imagen_path: path }).eq("id", id);
      if (error) throw error;
      toast.success("Imagen adjuntada al comprobante existente (sin duplicar)");
      limpiar();
      setDupe(null);
      qc.invalidateQueries({ queryKey: ["ocr_sin_imagen", kind] });
      qc.invalidateQueries({ queryKey: ["imagenes", kind] });
      qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
      qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error al adjuntar");
    } finally {
      setSaving(false);
    }
  };

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
      const crudo = (json.data ?? json) as OCRResult;
      const parsed = { ...corregirPartes(crudo, kind), tipo: normalizarTipoComprobante(crudo.tipo) };
      setResult(parsed);
      if (parsed.emisor !== crudo.emisor) {
        toast.warning("Detecté a FEMA Agronegocios como emisor: invertí emisor y receptor. Revisá los datos.");
      }
      toast.success("Comprobante analizado");
      const existente = await buscarDuplicado(parsed);
      if (existente) setDupe(existente);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  const avisos = result ? revisarOCR(result, kind) : [];
  const errores = avisos.filter((a) => a.nivel === "error");
  const num = (v: string) => {
    const n = Number(String(v).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const guardar = async () => {
    if (!result || !user) return toast.error("Sin datos o sesión");
    setSaving(true);
    try {
      // Control de duplicados: mismo número + total ya cargado
      if (result.numero) {
        const { data: dup } = await supabase
          .from(tablaKind)
          .select("id, numero, total, imagen_path")
          .eq("numero", result.numero)
          .limit(5);
        const match = (dup ?? []).find((d: any) => Math.abs((d.total ?? 0) - (result.total ?? 0)) < 1);
        if (match) {
          setSaving(false);
          setModo("adjuntar");
          setDestinoId(match.id);
          setBusqueda(result.numero);
          toast.warning("Ese comprobante ya está cargado. Cambié a modo \"Adjuntar imagen\" para no duplicarlo.");
          return;
        }
      }
      const letra = (result.letra ?? "B").toUpperCase();
      const tipo = (["A", "B", "C", "M", "E"].includes(letra) ? letra : "B") as "A"|"B"|"C"|"M"|"E";
      // Nombre del tercero: en compras es el emisor; en ventas el receptor (fallback emisor)
      const terceroNombre = (kind === "compra" ? result.emisor : (result.receptor ?? result.emisor))?.trim() || null;
      if (esEmpresaPropia(terceroNombre)) {
        setSaving(false);
        toast.error(`"${terceroNombre}" es la empresa propia: no puede ser ${kind === "compra" ? "proveedor" : "cliente"}. Corregí el campo ${kind === "compra" ? "Emisor / proveedor" : "Receptor / cliente"} antes de guardar.`);
        return;
      }
      const terceroCuitRaw = (kind === "compra" ? result.cuit_emisor : (result.cuit_receptor ?? result.cuit_emisor)) ?? null;
      const terceroCuit = onlyDigits(terceroCuitRaw) || null;

      // Datos de contacto del tercero leídos del comprobante
      const clean = (v?: string | null) => {
        const t = (v ?? "").trim();
        return t && t !== "-" && t.toLowerCase() !== "null" ? t : null;
      };
      const contacto: Record<string, string | null> = kind === "compra"
        ? {
            domicilio: clean(result.emisor_domicilio),
            localidad: clean(result.emisor_localidad),
            telefono: clean(result.emisor_telefono),
            email: clean(result.emisor_email),
            condicion_iva: clean(result.emisor_condicion_iva),
            iibb: clean(result.emisor_iibb),
          }
        : {
            domicilio: clean(result.receptor_domicilio),
            localidad: clean(result.receptor_localidad),
            telefono: clean(result.receptor_telefono),
            email: clean(result.receptor_email),
            condicion_iva: clean(result.receptor_condicion_iva),
            iibb: clean(result.receptor_iibb),
          };
      const contactoNoVacio = Object.fromEntries(
        Object.entries(contacto).filter(([, v]) => v !== null),
      );

      // Buscar o crear proveedor/cliente
      let terceroId: string | null = null;
      if (terceroNombre || terceroCuit) {
        const tabla = kind === "compra" ? "fema_proveedores" : "fema_clientes";
        let existente: { id: string; nombre?: string | null; cuit?: string | null } | null = null;
        let cuitDisponible = terceroCuit;
        if (terceroCuit) {
          const { data } = await supabase
            .from(tabla)
            .select("id,nombre,cuit")
            .eq("cuit", terceroCuit)
            .maybeSingle();
          if (data && compatibleName(terceroNombre, data.nombre)) {
            existente = data;
          } else if (data) {
            cuitDisponible = null;
            toast.warning(`El CUIT leído ya pertenece a "${data.nombre}". Se guardará usando el nombre del comprobante para evitar vincularlo mal.`);
          }
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
            if (cuitDisponible && !data.cuit) {
              await supabase.from(tabla).update({ cuit: cuitDisponible }).eq("id", data.id);
            }
          }
        }
        if (existente?.id) {
          terceroId = existente.id;
          // Completar solo los campos que estén vacíos en el registro existente
          if (Object.keys(contactoNoVacio).length) {
            const { data: actual } = await supabase
              .from(tabla)
              .select("domicilio,localidad,telefono,email,condicion_iva,iibb")
              .eq("id", existente.id)
              .maybeSingle();
            const faltantes = Object.fromEntries(
              Object.entries(contactoNoVacio).filter(([k]) => !(actual as any)?.[k]),
            );
            if (Object.keys(faltantes).length) {
              await supabase.from(tabla).update(faltantes as any).eq("id", existente.id);
            }
          }
        } else {
          const nuevo: any = { user_id: user.id, nombre: terceroNombre ?? `CUIT ${terceroCuit}`, cuit: cuitDisponible, ...contactoNoVacio };
          if (kind === "compra") nuevo.categoria = (result.es_combustible ? "Gasoil_Combustible" : (result.categoria_sugerida as any)) ?? "Otro";
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
        tipo_comprobante: normalizarTipoComprobante(result.tipo),
        observaciones: `OCR: ${result.emisor ?? ""}${result.descripcion ? " - " + result.descripcion : ""}`.trim(),
      };
      // Subir imagen al bucket privado
      let imagen_path: string | null = null;
      if (b64 && mime) {
        try {
          const ext = mime.includes("pdf") ? "pdf" : (mime.split("/")[1] ?? "jpg");
          const path = `${kind}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const { error: upErr } = await supabase.storage
            .from("facturas-img")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (!upErr) imagen_path = path;
        } catch { /* no bloquear guardado si falla la subida */ }
      }
      if (kind === "compra") {
        const { error } = await supabase.from("fema_facturas_compra").insert({
          ...base,
          proveedor_id: terceroId,
          categoria: (result.categoria_sugerida as any) ?? (result.es_combustible ? "Gasoil_Combustible" : "Otro"),
          descripcion: result.descripcion ?? result.emisor ?? null,
          // ITC (nafta + gasoil) va a impuestos_internos.
          // CO2 (nafta + gasoil) + otros tributos van a otros_impuestos.
          impuestos_internos:
            (result.itc_nafta ?? 0) + (result.itc_gasoil ?? 0) +
            ((result.itc_nafta == null && result.itc_gasoil == null) ? (result.itc_combustible ?? 0) : 0),
          otros_impuestos:
            (result.otros_impuestos ?? 0) +
            (result.co2_nafta ?? 0) + (result.co2_gasoil ?? 0) +
            ((result.co2_nafta == null && result.co2_gasoil == null) ? (result.co2_combustible ?? 0) : 0),
          litros: result.litros ?? 0,
          producto: result.producto_combustible ?? null,
          imagen_path,
        });
        if (error) throw error;
        toast.success("Factura de compra guardada");
      } else {
        const { error } = await supabase.from("fema_facturas_venta").insert({
          ...base,
          cliente_id: terceroId,
          trabajo: result.descripcion ?? null,
          categoria: (result.categoria_sugerida as any) ?? "Otro",
          imagen_path,
        });
        if (error) throw error;
        toast.success("Factura de venta guardada");
      }
      setResult(null);
      setPreview(null);
      setB64(null);
      setMime(null);
      qc.invalidateQueries({ queryKey: ["fema_proveedores_min"] });
      qc.invalidateQueries({ queryKey: ["fema_proveedores"] });
      qc.invalidateQueries({ queryKey: ["fema_clientes"] });
      qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
      qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
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

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Label className="text-sm font-medium">¿Qué querés hacer?</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={modo === "nuevo" ? "default" : "outline"} onClick={() => { setModo("nuevo"); setDestinoId(null); }}>
            <Save className="mr-1.5 h-4 w-4" /> Cargar comprobante nuevo
          </Button>
          <Button type="button" size="sm" variant={modo === "adjuntar" ? "default" : "outline"} onClick={() => setModo("adjuntar")}>
            <Paperclip className="mr-1.5 h-4 w-4" /> Adjuntar imagen a uno ya cargado
          </Button>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {modo === "adjuntar"
            ? "No se crea ningún registro: solo se guarda la imagen en el comprobante elegido."
            : "Si el número y el total ya existen, el sistema te avisa y pasa a modo adjuntar."}
        </p>
      </div>

      {modo === "adjuntar" && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {kind === "compra" ? "Compras" : "Ventas"} sin imagen adjunta
            </h3>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por proveedor, número, fecha o total"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">{kind === "compra" ? "Proveedor" : "Cliente"}</th>
                  <th className="px-3 py-2">Número</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loadingPend ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No hay comprobantes sin imagen</td></tr>
                ) : filtrados.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDestinoId(r.id)}
                    className={`cursor-pointer border-t border-border ${destinoId === r.id ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <td className="px-3 py-2">
                      <input type="radio" readOnly checked={destinoId === r.id} />
                    </td>
                    <td className="px-3 py-2">{r.fecha}</td>
                    <td className="px-3 py-2">{r.tercero ?? "—"}</td>
                    <td className="px-3 py-2">{r.numero ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {r.total != null ? r.total.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
              <Button onClick={() => adjuntar()} disabled={saving || !destinoId || !b64}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
              Adjuntar imagen al comprobante
            </Button>
          </div>
        </div>
      )}

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
              <Badge className={errores.length ? "bg-destructive/15 text-destructive" : avisos.length ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}>
                {errores.length ? `${errores.length} dato(s) a corregir` : avisos.length ? `${avisos.length} advertencia(s)` : "Datos completos"}
              </Badge>
            )}
          </div>
          {!result ? (
            <p className="grid h-64 place-items-center text-sm text-muted-foreground">
              Subí una factura y presioná Analizar.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Categoría (editable)</Label>
                <select
                  value={result.categoria_sugerida ?? "Otro"}
                  onChange={(e) => setResult({ ...result, categoria_sugerida: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {(kind === "compra" ? CATS_COMPRA : CATS_VENTA).map((c) => (
                    <option key={c} value={c}>{labelCat(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tipo de comprobante (editable)</Label>
                <select
                  value={normalizarTipoComprobante(result.tipo)}
                  onChange={(e) => setResult({ ...result, tipo: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TIPOS_COMPROBANTE.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Letra</Label>
                <Input value={result.letra ?? "—"} readOnly className="mt-1 h-8 text-sm" />
              </div>
              <EditableOCRField label="Emisor / proveedor" value={result.emisor ?? ""} onChange={(value) => setResult({ ...result, emisor: value })} />
              <EditableOCRField label="CUIT emisor" value={result.cuit_emisor ?? ""} onChange={(value) => setResult({ ...result, cuit_emisor: onlyDigits(value) })} />
              <EditableOCRField label="Receptor / cliente" value={result.receptor ?? ""} onChange={(value) => setResult({ ...result, receptor: value })} />
              <EditableOCRField label="CUIT receptor" value={result.cuit_receptor ?? ""} onChange={(value) => setResult({ ...result, cuit_receptor: onlyDigits(value) })} />
              <EditableOCRField label="Número" value={result.numero ?? ""} onChange={(v) => setResult({ ...result, numero: v })} />
              <div>
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input type="date" value={result.fecha ?? ""} onChange={(e) => setResult({ ...result, fecha: e.target.value })} className="mt-1 h-8 text-sm" />
              </div>
              <EditableOCRField label="Neto" value={String(result.neto ?? 0)} onChange={(v) => setResult({ ...result, neto: num(v) })} />
              <EditableOCRField label="IVA 21%" value={String(result.iva_21 ?? 0)} onChange={(v) => setResult({ ...result, iva_21: num(v) })} />
              <EditableOCRField label="IVA 10.5%" value={String(result.iva_105 ?? 0)} onChange={(v) => setResult({ ...result, iva_105: num(v) })} />
              <EditableOCRField label="Percepciones" value={String(result.percepciones ?? 0)} onChange={(v) => setResult({ ...result, percepciones: num(v) })} />
              <EditableOCRField label="Total" value={String(result.total ?? 0)} onChange={(v) => setResult({ ...result, total: num(v) })} />
              <div>
                <Label className="text-xs text-muted-foreground">Moneda</Label>
                <Input value={result.moneda ?? "ARS"} readOnly className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Es combustible</Label>
                <Input value={result.es_combustible ? "Sí" : "No"} readOnly className="mt-1 h-8 text-sm" />
              </div>

              {avisos.length > 0 && (
                <div className="col-span-2 space-y-1 rounded-md border border-border bg-muted/40 p-2">
                  <p className="text-xs font-medium">Revisión previa</p>
                  {avisos.map((a, i) => (
                    <p key={i} className={`text-xs ${a.nivel === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      {a.nivel === "error" ? "✕" : "!"} <b>{a.campo}:</b> {a.msg}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {result && (
            <div className="mt-4 flex items-center justify-end gap-3">
              {errores.length > 0 && modo !== "adjuntar" && (
                <span className="text-xs text-destructive">Corregí los datos marcados para poder guardar.</span>
              )}
              <Button onClick={guardar} disabled={saving || modo === "adjuntar" || errores.length > 0}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Guardar como {kind === "compra" ? "compra" : "venta"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!dupe} onOpenChange={(v) => { if (!v) setDupe(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ese comprobante ya está cargado</DialogTitle>
             <DialogDescription>
               Encontré un comprobante con el mismo número y total en {kind === "compra" ? "Compras" : "Ventas"}. Para evitar duplicados solo se puede guardar la imagen en ese registro.
             </DialogDescription>
          </DialogHeader>
          {dupe && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{dupe.tercero ?? "Sin tercero"}</div>
              <div className="text-muted-foreground">
                N° {dupe.numero ?? "—"} · {dupe.fecha ?? "—"} · $ {Number(dupe.total ?? 0).toLocaleString("es-AR")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {dupe.tieneImagen ? "Ya tiene una imagen adjunta (se reemplazará por la nueva)." : "Todavía no tiene imagen adjunta."}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDupe(null)}>Cancelar</Button>
            <Button
              disabled={saving || !b64}
              onClick={async () => { const id = dupe!.id; setModo("adjuntar"); setDestinoId(id); setDupe(null); await adjuntar(id); }}
            >
              <Paperclip className="mr-1.5 h-4 w-4" /> Guardar solo la imagen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditableOCRField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 text-sm" />
    </div>
  );
}