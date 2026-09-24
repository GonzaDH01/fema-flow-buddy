import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Upload, ScanLine, Loader2, FileText, ChevronDown, ChevronRight,
  CheckCircle2, Banknote, Paperclip, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPesos, formatFecha, formatNumero } from "@/lib/format";
import { cotizacionOficial } from "@/lib/cotizacion";

export const Route = createFileRoute("/app/documentos")({ component: Page });

const BUCKET = "documentos-compras";
const n = (v: unknown) => Number(v ?? 0) || 0;
const hoyISO = () => new Date().toISOString().slice(0, 10);

const TIPOS_DOC = ["Pagaré", "Boleto de compraventa", "Convenio de pago", "Mutuo", "Prenda", "Otro"];
const FORMAS_PAGO = ["Transferencia", "Cheque propio", "E-cheq", "Efectivo", "Canje cereal", "Otro"];
const MONEDAS = ["ARS", "USD"];

const money = (monto: number, moneda: string) =>
  moneda === "USD" ? `US$ ${formatNumero(monto)}` : formatPesos(monto);

type Cuota = {
  id: string;
  doc_id: string;
  numero_cuota: number;
  numero_pagare: string | null;
  fecha_vencimiento: string;
  monto: number;
  moneda: string;
  estado: string;
  fecha_pago: string | null;
  forma_pago: string | null;
  cuenta_id: string | null;
  observaciones: string | null;
};

type Doc = {
  id: string;
  fecha: string;
  tipo_documento: string;
  numero: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  bien_descripcion: string;
  activo_id: string | null;
  moneda: string;
  cotizacion_usd: number | null;
  monto_total: number;
  entrega: number;
  cantidad_cuotas: number;
  forma_pago: string | null;
  estado: string;
  factura_compra_id: string | null;
  observaciones: string | null;
};

const db = supabase as any;

function addMeses(fecha: string, k: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, ultimo));
  return t.toISOString().slice(0, 10);
}
function addDias(fecha: string, k: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}
function diasHasta(f: string | null) {
  if (!f) return null;
  const a = new Date(`${f}T00:00:00`).getTime();
  const b = new Date(new Date().toDateString()).getTime();
  return Math.round((a - b) / 86400000);
}

async function comprimirParaOcr(
  file: File,
): Promise<{ base64: string; mimeType: "image/jpeg" | "application/pdf" }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
  const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (esPdf) {
    if (file.size > 3_500_000) throw new Error("El PDF es muy pesado (máx. 3,5 MB).");
    return { base64: dataUrl.split(",")[1] ?? "", mimeType: "application/pdf" };
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () =>
      reject(new Error("Formato no soportado. Usá JPG, PNG, WEBP o PDF (las fotos HEIC del iPhone convertilas a JPG)."));
    el.src = dataUrl;
  });
  const MAX = 2200;
  const escala = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let calidad = 0.85;
  let base64 = canvas.toDataURL("image/jpeg", calidad).split(",")[1] ?? "";
  while (base64.length > 3_800_000 && calidad > 0.35) {
    calidad -= 0.15;
    base64 = canvas.toDataURL("image/jpeg", calidad).split(",")[1] ?? "";
  }
  return { base64, mimeType: "image/jpeg" };
}

/* ------------------------------------------------------------------ */

const DOC_VACIO = {
  fecha: hoyISO(),
  tipo_documento: "Pagaré",
  numero: "",
  proveedor_id: "",
  proveedor_nombre: "",
  bien_descripcion: "",
  activo_id: "",
  moneda: "ARS",
  cotizacion_usd: "",
  monto_total: "",
  entrega: "",
  cantidad_cuotas: "1",
  forma_pago: "Transferencia",
  observaciones: "",
};

type CuotaDraft = {
  numero_cuota: number;
  fecha_vencimiento: string;
  monto: string;
  numero_pagare: string;
  pagada: boolean;
  fecha_pago: string;
  forma_pago: string;
};

function FormDoc({
  doc,
  cuotasExistentes,
  proveedores,
  activos,
  dolar,
  onClose,
}: {
  doc: Doc | null;
  cuotasExistentes: Cuota[];
  proveedores: any[];
  activos: any[];
  dolar: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState(
    doc
      ? {
          fecha: doc.fecha,
          tipo_documento: doc.tipo_documento,
          numero: doc.numero ?? "",
          proveedor_id: doc.proveedor_id ?? "",
          proveedor_nombre: doc.proveedor_nombre ?? "",
          bien_descripcion: doc.bien_descripcion,
          activo_id: doc.activo_id ?? "",
          moneda: doc.moneda,
          cotizacion_usd: doc.cotizacion_usd ? String(doc.cotizacion_usd) : "",
          monto_total: String(doc.monto_total ?? ""),
          entrega: String(doc.entrega ?? ""),
          cantidad_cuotas: String(doc.cantidad_cuotas ?? 1),
          forma_pago: doc.forma_pago ?? "Transferencia",
          observaciones: doc.observaciones ?? "",
        }
      : { ...DOC_VACIO, cotizacion_usd: dolar ? String(dolar) : "" },
  );
  const [cuotas, setCuotas] = useState<CuotaDraft[]>(
    cuotasExistentes.length
      ? cuotasExistentes
          .slice()
          .sort((a, b) => a.numero_cuota - b.numero_cuota)
          .map((c) => ({
            numero_cuota: c.numero_cuota,
            fecha_vencimiento: c.fecha_vencimiento,
            monto: String(c.monto),
            numero_pagare: c.numero_pagare ?? "",
            pagada: c.estado === "pagada",
            fecha_pago: c.fecha_pago ?? c.fecha_vencimiento,
            forma_pago: c.forma_pago ?? "Transferencia",
          }))
      : [],
  );
  const [primera, setPrimera] = useState(hoyISO());
  const [intervalo, setIntervalo] = useState("30");
  const [unidad, setUnidad] = useState<"dias" | "meses">("dias");
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const fileOcr = useRef<HTMLInputElement>(null);
  // La foto leída por OCR se guarda como adjunto del documento al confirmar.
  const [fotoOcr, setFotoOcr] = useState<File | null>(null);
  const [buscaBien, setBuscaBien] = useState("");

  const { data: vinculados = [] } = useQuery({
    queryKey: ["fema_doc_compra_activos", doc?.id],
    enabled: !!doc?.id,
    queryFn: async () => {
      const { data, error } = await (db as any).from("fema_doc_compra_activos")
        .select("activo_id").eq("doc_id", doc!.id);
      if (error) throw error;
      return (data ?? []).map((x: any) => x.activo_id as string);
    },
  });
  const [activoIds, setActivoIds] = useState<string[] | null>(null);
  const bienesSel = activoIds ?? (doc ? vinculados : (v.activo_id ? [v.activo_id] : []));
  const toggleBien = (id: string) =>
    setActivoIds(bienesSel.includes(id) ? bienesSel.filter((x: string) => x !== id) : [...bienesSel, id]);
  const bienesFiltrados = useMemo(() => {
    const q = buscaBien.trim().toLowerCase();
    if (!q) return activos;
    return activos.filter((a: any) => String(a.nombre ?? "").toLowerCase().includes(q));
  }, [activos, buscaBien]);

  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  const financiado = Math.max(0, n(v.monto_total) - n(v.entrega));
  const sumaCuotas = cuotas.reduce((s, c) => s + n(c.monto), 0);

  function generarCuotas() {
    const cant = Math.max(1, Math.round(n(v.cantidad_cuotas)));
    const paso = Math.max(1, Math.round(n(intervalo)));
    const base = financiado > 0 ? financiado / cant : 0;
    const filas: CuotaDraft[] = [];
    for (let i = 0; i < cant; i++) {
      const previa = cuotas.find((x) => x.numero_cuota === i + 1);
      const vto = unidad === "meses" ? addMeses(primera, i * paso) : addDias(primera, i * paso);
      filas.push({
        numero_cuota: i + 1,
        fecha_vencimiento: vto,
        monto: base ? String(Math.round(base * 100) / 100) : "",
        numero_pagare: previa?.numero_pagare ?? "",
        pagada: previa?.pagada ?? false,
        fecha_pago: previa?.fecha_pago || vto,
        forma_pago: previa?.forma_pago || v.forma_pago || "Transferencia",
      });
    }
    setCuotas(filas);
  }

  async function leerDocumento(file: File) {
    setLeyendo(true);
    try {
      const { base64, mimeType } = await comprimirParaOcr(file);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sesión vencida, volvé a entrar.");
      const res = await fetch("/api/public/ocr-pagare", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudo leer el documento");
      const d = json.data ?? {};
      setV((p) => ({
        ...p,
        tipo_documento: TIPOS_DOC.includes(d.tipo_documento) ? d.tipo_documento : p.tipo_documento,
        numero: d.numero ?? p.numero,
        moneda: d.moneda === "USD" || d.moneda === "ARS" ? d.moneda : p.moneda,
        monto_total: d.monto ? String(d.monto) : p.monto_total,
        fecha: d.fecha_emision ?? p.fecha,
        proveedor_nombre: d.beneficiario ?? p.proveedor_nombre,
        bien_descripcion: d.bien ?? p.bien_descripcion,
        cantidad_cuotas: d.cantidad_cuotas ? String(d.cantidad_cuotas) : p.cantidad_cuotas,
      }));
      if (d.fecha_vencimiento) setPrimera(d.fecha_vencimiento);
      setFotoOcr(file);
      toast.success("Datos leídos. Revisalos antes de guardar.");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el documento");
    } finally {
      setLeyendo(false);
      if (fileOcr.current) fileOcr.current.value = "";
    }
  }

  async function guardar() {
    if (!v.bien_descripcion.trim()) return toast.error("Indicá qué se compró.");
    if (n(v.monto_total) <= 0) return toast.error("Cargá el importe total.");
    setGuardando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const payload = {
        user_id: uid,
        fecha: v.fecha || hoyISO(),
        tipo_documento: v.tipo_documento,
        numero: v.numero || null,
        proveedor_id: v.proveedor_id || null,
        proveedor_nombre: v.proveedor_nombre || null,
        bien_descripcion: v.bien_descripcion.trim(),
        activo_id: bienesSel[0] ?? null,
        moneda: v.moneda,
        cotizacion_usd: v.cotizacion_usd ? n(v.cotizacion_usd) : null,
        monto_total: n(v.monto_total),
        entrega: n(v.entrega),
        cantidad_cuotas: Math.max(1, Math.round(n(v.cantidad_cuotas))),
        forma_pago: v.forma_pago || null,
        observaciones: v.observaciones || null,
        anio: Number((v.fecha || hoyISO()).slice(0, 4)),
        mes: Number((v.fecha || hoyISO()).slice(5, 7)),
      };

      let docId = doc?.id ?? "";
      if (doc) {
        const { error } = await db.from("fema_doc_compras").update(payload).eq("id", doc.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("fema_doc_compras").insert(payload).select("id").single();
        if (error) throw error;
        docId = data.id;
      }

      // Cronograma: se reemplazan las cuotas que siguen pendientes
      const pagadas = new Set(cuotasExistentes.filter((c) => c.estado === "pagada").map((c) => c.numero_cuota));
      const aBorrar = cuotasExistentes.filter((c) => c.estado !== "pagada").map((c) => c.id);
      if (aBorrar.length) {
        const { error } = await db.from("fema_doc_compra_cuotas").delete().in("id", aBorrar);
        if (error) throw error;
      }
      const nuevas = cuotas
        .filter((c) => !pagadas.has(c.numero_cuota) && c.fecha_vencimiento)
        .map((c) => ({
          user_id: uid,
          doc_id: docId,
          numero_cuota: c.numero_cuota,
          numero_pagare: c.numero_pagare || null,
          fecha_vencimiento: c.fecha_vencimiento,
          monto: n(c.monto),
          moneda: v.moneda,
          // Cuotas históricas: se marcan abonadas sin tocar el saldo del banco
          estado: c.pagada ? "pagada" : "pendiente",
          fecha_pago: c.pagada ? (c.fecha_pago || c.fecha_vencimiento) : null,
          forma_pago: c.pagada ? (c.forma_pago || "Transferencia") : null,
        }));
      if (nuevas.length) {
        const { error } = await db.from("fema_doc_compra_cuotas").insert(nuevas);
        if (error) throw error;
      }

      // Bienes del inventario afectados (pueden ser varios)
      const previos: string[] = doc ? vinculados : [];
      const quitar = previos.filter((a) => !bienesSel.includes(a));
      const agregar = bienesSel.filter((a: string) => !previos.includes(a));
      if (quitar.length) {
        await (db as any).from("fema_doc_compra_activos")
          .delete().eq("doc_id", docId).in("activo_id", quitar);
      }
      if (agregar.length) {
        await (db as any).from("fema_doc_compra_activos")
          .insert(agregar.map((activo_id: string) => ({ user_id: uid, doc_id: docId, activo_id })));
      }

      // Foto del documento leída por OCR: queda adjunta al documento
      if (fotoOcr) {
        const ext = (fotoOcr.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${uid}/${docId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: eUp } = await supabase.storage.from(BUCKET)
          .upload(path, fotoOcr, { contentType: fotoOcr.type || undefined });
        if (!eUp) {
          await (db as any).from("fema_doc_compra_archivos").insert({
            user_id: uid, doc_id: docId, path, nombre_archivo: fotoOcr.name, es_documento: ext === "pdf",
          });
        }
        setFotoOcr(null);
      }

      await qc.invalidateQueries({ queryKey: ["fema_doc_compras"] });
      await qc.invalidateQueries({ queryKey: ["fema_doc_compra_activos"] });
      toast.success(doc ? "Documento actualizado" : "Documento cargado");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{doc ? "Editar documento de compra" : "Nuevo documento de compra"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (!leyendo) fileOcr.current?.click(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileOcr.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); if (!leyendo) setArrastrando(true); }}
          onDragLeave={(e) => { e.preventDefault(); setArrastrando(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (leyendo) return;
            const f = e.dataTransfer.files?.[0];
            if (f) void leerDocumento(f);
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
            arrastrando ? "border-emerald-500 bg-emerald-500/10" : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            {leyendo ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ScanLine className="h-6 w-6 text-muted-foreground" />}
            <p className="text-sm font-medium">
              {leyendo
                ? "Leyendo el documento..."
                : arrastrando
                  ? "Soltá el archivo acá"
                  : "Arrastrá la foto o el PDF acá, o hacé clic para buscarlo"}
            </p>
            <p className="text-xs text-muted-foreground">
              Se completan solos importe, fechas, acreedor y cuotas del pagaré o boleto.
            </p>
            {fotoOcr && !leyendo && (
              <p className="text-xs text-emerald-500">Archivo cargado: {fotoOcr.name}</p>
            )}
          </div>
          <input
            ref={fileOcr}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leerDocumento(f);
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Fecha de firma</Label>
            <Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de documento</Label>
            <Select value={v.tipo_documento} onValueChange={(x) => set("tipo_documento", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input value={v.numero} onChange={(e) => set("numero", e.target.value)} placeholder="Ej. 0001-A" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Bien / implemento comprado</Label>
            <Input
              value={v.bien_descripcion}
              onChange={(e) => set("bien_descripcion", e.target.value)}
              placeholder="Ej. Tractor John Deere 6110"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>
              Maquinarias / rodados del inventario afectados
              {bienesSel.length > 0 && <Badge variant="secondary" className="ml-2">{bienesSel.length}</Badge>}
            </Label>
            <Input
              placeholder="Buscar máquina o rodado…"
              value={buscaBien}
              onChange={(e) => setBuscaBien(e.target.value)}
              className="h-9"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border/40">
              {bienesFiltrados.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">No hay bienes que coincidan.</p>
              )}
              {bienesFiltrados.map((a: any) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                  <Checkbox checked={bienesSel.includes(a.id)} onCheckedChange={() => toggleBien(a.id)} />
                  <span className="flex-1">{a.nombre}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Tildá todos los bienes que cubre este documento.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Vendedor / acreedor</Label>
            <Select value={v.proveedor_id || "none"} onValueChange={(x) => set("proveedor_id", x === "none" ? "" : x)}>
              <SelectTrigger><SelectValue placeholder="Elegir proveedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin proveedor cargado</SelectItem>
                {proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre libre (si no está en Proveedores)</Label>
            <Input value={v.proveedor_nombre} onChange={(e) => set("proveedor_nombre", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsable de pago</Label>
            <Select value={v.forma_pago} onValueChange={(x) => set("forma_pago", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMAS_PAGO.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={v.moneda} onValueChange={(x) => set("moneda", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">$ Pesos</SelectItem>
                <SelectItem value="USD">US$ Dólares</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Importe total</Label>
            <Input
              type="number" step="0.01" className="min-w-[120px]"
              value={v.monto_total} onChange={(e) => set("monto_total", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Entrega / anticipo</Label>
            <Input
              type="number" step="0.01" className="min-w-[120px]"
              value={v.entrega} onChange={(e) => set("entrega", e.target.value)}
            />
          </div>
          {v.moneda === "USD" && (
            <div className="space-y-1.5">
              <Label>Cotización de referencia</Label>
              <Input
                type="number" step="0.01"
                value={v.cotizacion_usd} onChange={(e) => set("cotizacion_usd", e.target.value)}
                placeholder={dolar ? String(dolar) : ""}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cantidad de cuotas</Label>
              <Input
                type="number" step="1" min="1" className="w-28"
                value={v.cantidad_cuotas} onChange={(e) => set("cantidad_cuotas", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Primer vencimiento</Label>
              <Input type="date" className="w-44" value={primera} onChange={(e) => setPrimera(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cada</Label>
              <Input type="number" step="1" min="1" className="w-24" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unidad</Label>
              <Select value={unidad} onValueChange={(x) => setUnidad(x as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dias">Días</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={generarCuotas}>
              <RefreshCw className="mr-2 h-4 w-4" /> Generar cuotas
            </Button>
            <span className="text-xs text-muted-foreground">
              A financiar: {money(financiado, v.moneda)} · Suma cuotas: {money(sumaCuotas, v.moneda)}
            </span>
          </div>

          {cuotas.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Cuota</TableHead>
                  <TableHead className="w-44">Vencimiento</TableHead>
                  <TableHead className="w-40">Importe</TableHead>
                  <TableHead className="w-40">N° pagaré</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuotas.map((c, i) => {
                  const pagada = cuotasExistentes.some((x) => x.numero_cuota === c.numero_cuota && x.estado === "pagada");
                  return (
                    <TableRow key={c.numero_cuota}>
                      <TableCell className="font-medium">
                        {c.numero_cuota}
                        {pagada && <Badge variant="outline" className="ml-2">Pagada</Badge>}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date" disabled={pagada} value={c.fecha_vencimiento}
                          onChange={(e) => setCuotas((p) => p.map((x, j) => j === i ? { ...x, fecha_vencimiento: e.target.value } : x))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01" disabled={pagada} className="min-w-[100px]" value={c.monto}
                          onChange={(e) => setCuotas((p) => p.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          disabled={pagada} value={c.numero_pagare}
                          onChange={(e) => setCuotas((p) => p.map((x, j) => j === i ? { ...x, numero_pagare: e.target.value } : x))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------ */

function PagoDialog({
  cuota,
  doc,
  cuentas,
  dolar,
  onClose,
}: {
  cuota: Cuota;
  doc: Doc;
  cuentas: any[];
  dolar: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(hoyISO());
  const [forma, setForma] = useState(doc.forma_pago ?? "Transferencia");
  const [cuentaId, setCuentaId] = useState<string>(cuentas[0]?.id ?? "");
  const [cot, setCot] = useState(dolar ? String(dolar) : "");
  const [guardando, setGuardando] = useState(false);

  const enPesos = cuota.moneda === "USD" ? n(cuota.monto) * (n(cot) || dolar) : n(cuota.monto);

  async function pagar() {
    if (enPesos <= 0) return toast.error("Revisá el importe o la cotización.");
    setGuardando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const contraparte = doc.proveedor_nombre || doc.bien_descripcion;
      const { data: mov, error: eMov } = await db
        .from("fema_movimientos_pago")
        .insert({
          user_id: uid,
          instrumento: forma,
          direccion: "pago",
          tipo_movimiento: "pago_documento",
          fecha_emision: fecha,
          vencimiento: fecha,
          numero: cuota.numero_pagare || String(cuota.numero_cuota),
          contraparte,
          monto: Math.round(enPesos * 100) / 100,
          estado: "en_cartera",
          observaciones: `Cuota ${cuota.numero_cuota} · ${doc.tipo_documento} · ${doc.bien_descripcion}`,
          anio: Number(fecha.slice(0, 4)),
          mes: Number(fecha.slice(5, 7)),
        })
        .select("id")
        .single();
      if (eMov) throw eMov;

      if (cuentaId) {
        const { error } = await db.rpc("fema_impactar_caja", {
          _mov_id: mov.id, _nuevo_estado: "pagado", _cuenta_id: cuentaId, _es_pago: true,
        });
        if (error) throw error;
      } else {
        const { error } = await db.from("fema_movimientos_pago").update({ estado: "pagado" }).eq("id", mov.id);
        if (error) throw error;
      }

      const { error: eC } = await db
        .from("fema_doc_compra_cuotas")
        .update({
          estado: "pagada", fecha_pago: fecha, forma_pago: forma,
          cuenta_id: cuentaId || null, movimiento_pago_id: mov.id,
        })
        .eq("id", cuota.id);
      if (eC) throw eC;

      await qc.invalidateQueries({ queryKey: ["fema_doc_compras"] });
      await qc.invalidateQueries({ queryKey: ["fema_tesoreria"] });
      await qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
      toast.success("Cuota abonada y registrada en Medios de pago");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar el pago");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Registrar pago — cuota {cuota.numero_cuota}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <div className="font-medium">{doc.bien_descripcion}</div>
          <div className="text-muted-foreground">
            Vence {formatFecha(cuota.fecha_vencimiento)} · {money(n(cuota.monto), cuota.moneda)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Fecha de pago</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMAS_PAGO.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {cuota.moneda === "USD" && (
            <div className="space-y-1.5">
              <Label>Cotización del día</Label>
              <Input type="number" step="0.01" value={cot} onChange={(e) => setCot(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cuenta que paga</Label>
            <Select value={cuentaId || "none"} onValueChange={(x) => setCuentaId(x === "none" ? "" : x)}>
              <SelectTrigger><SelectValue placeholder="Sin descontar de banco" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin descontar de banco</SelectItem>
                {cuentas.map((c) => <SelectItem key={c.id} value={c.id}>{c.alias || c.banco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Se descuenta {formatPesos(enPesos)}.</div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={pagar} disabled={guardando}>
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar pago
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------ */

function Archivos({ docId }: { docId: string }) {
  const qc = useQueryClient();
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const { data: archivos = [] } = useQuery({
    queryKey: ["fema_doc_compras", "archivos", docId],
    queryFn: async () => {
      const { data, error } = await db
        .from("fema_doc_compra_archivos")
        .select("id,path,nombre_archivo,es_documento")
        .eq("doc_id", docId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function subir(files: FileList) {
    setSubiendo(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      for (const f of Array.from(files)) {
        if (f.size > 15 * 1024 * 1024) {
          toast.error(`${f.name}: supera los 15 MB`);
          continue;
        }
        const ext = (f.name.split(".").pop() ?? "bin").toLowerCase();
        const path = `${uid}/${docId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
        const { error: eIns } = await db.from("fema_doc_compra_archivos").insert({
          user_id: uid, doc_id: docId, path, nombre_archivo: f.name, es_documento: ext === "pdf",
        });
        if (eIns) toast.error(eIns.message);
      }
      await qc.invalidateQueries({ queryKey: ["fema_doc_compras", "archivos", docId] });
      toast.success("Archivos cargados");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return toast.error("No se pudo abrir el archivo");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function borrar(id: string, path: string) {
    await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await db.from("fema_doc_compra_archivos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["fema_doc_compras", "archivos", docId] });
    toast.success("Archivo eliminado");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={subiendo} onClick={() => input.current?.click()}>
          {subiendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Subir foto o PDF
        </Button>
        <input
          ref={input} type="file" multiple accept="image/*,application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files; if (f?.length) void subir(f); }}
        />
        <span className="text-xs text-muted-foreground">{archivos.length} archivo(s) adjunto(s)</span>
      </div>
      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {archivos.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
              {a.es_documento ? <FileText className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
              <button className="max-w-[180px] truncate underline-offset-2 hover:underline" onClick={() => abrir(a.path)}>
                {a.nombre_archivo ?? "archivo"}
              </button>
              <button className="text-destructive" onClick={() => borrar(a.id, a.path)} aria-label="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EstadoCuota({ c }: { c: Cuota }) {
  if (c.estado === "pagada") return <Badge variant="outline" className="border-primary/30 text-primary">Abonada</Badge>;
  const d = diasHasta(c.fecha_vencimiento);
  if (d === null) return <Badge variant="secondary">Pendiente</Badge>;
  if (d < 0) return <Badge variant="destructive">Vencida hace {Math.abs(d)} días</Badge>;
  if (d <= 15) return <Badge variant="destructive">Vence en {d} días</Badge>;
  return <Badge variant="secondary">Pendiente</Badge>;
}

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; doc: Doc | null }>({ open: false, doc: null });
  const [pago, setPago] = useState<{ cuota: Cuota; doc: Doc } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_doc_compras", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [docs, cuotas, prov, act, ctas, prods, fcompra] = await Promise.all([
        db.from("fema_doc_compras").select("*").order("fecha", { ascending: false }),
        db.from("fema_doc_compra_cuotas").select("*").order("numero_cuota", { ascending: true }),
        supabase.from("fema_proveedores").select("id,nombre").order("nombre"),
        db.from("fema_activos").select("id,nombre").order("nombre"),
        supabase.from("fema_cuentas_bancarias").select("id,banco,alias,saldo,activa"),
        supabase.from("fema_productos").select("nombre,categoria,precio,precio_venta,precio_compra,moneda"),
        supabase.from("fema_facturas_compra").select("id,numero,fecha,total").order("fecha", { ascending: false }).limit(200),
      ]);
      return {
        docs: (docs.data ?? []) as Doc[],
        cuotas: (cuotas.data ?? []) as Cuota[],
        proveedores: (prov.data ?? []) as any[],
        activos: (act.data ?? []) as any[],
        cuentas: ((ctas.data ?? []) as any[]).filter((c) => c.activa !== false),
        dolar: cotizacionOficial((prods.data ?? []) as any[]),
        facturas: (fcompra.data ?? []) as any[],
      };
    },
  });

  const docs = data?.docs ?? [];
  const cuotas = data?.cuotas ?? [];
  const dolar = data?.dolar ?? 0;

  const cuotasPorDoc = useMemo(() => {
    const m = new Map<string, Cuota[]>();
    for (const c of cuotas) {
      const l = m.get(c.doc_id) ?? [];
      l.push(c);
      m.set(c.doc_id, l);
    }
    return m;
  }, [cuotas]);

  const resumen = useMemo(() => {
    let pendArs = 0, pendUsd = 0, mes = 0, vencidas = 0;
    const hoy = hoyISO();
    const ym = hoy.slice(0, 7);
    for (const c of cuotas) {
      if (c.estado === "pagada") continue;
      if (c.moneda === "USD") pendUsd += n(c.monto); else pendArs += n(c.monto);
      const enPesos = c.moneda === "USD" ? n(c.monto) * dolar : n(c.monto);
      if (c.fecha_vencimiento.slice(0, 7) === ym) mes += enPesos;
      if (c.fecha_vencimiento < hoy) vencidas += 1;
    }
    return { pendArs, pendUsd, mes, vencidas };
  }, [cuotas, dolar]);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar el documento y todas sus cuotas?")) return;
    const { error } = await db.from("fema_doc_compras").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["fema_doc_compras"] });
    toast.success("Documento eliminado");
  }

  async function asociarFactura(docId: string, facturaId: string) {
    const { error } = await db.from("fema_doc_compras").update({ factura_compra_id: facturaId || null }).eq("id", docId);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["fema_doc_compras"] });
    toast.success("Factura asociada");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" /> Documentos de compra a plazo
          </h2>
          <p className="text-sm text-muted-foreground">
            Pagarés, boletos y convenios firmados por maquinaria e implementos, con sus cuotas y pagos.
          </p>
        </div>
        <Button onClick={() => setForm({ open: true, doc: null })}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo documento
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Pendiente en pesos</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{formatPesos(resumen.pendArs)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Pendiente en dólares</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">US$ {formatNumero(resumen.pendUsd)}</div>
            {dolar > 0 && <div className="text-xs text-muted-foreground">≈ {formatPesos(resumen.pendUsd * dolar)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Vence este mes</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{formatPesos(resumen.mes)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Cuotas vencidas</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold">{resumen.vencidas}</div></CardContent>
        </Card>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {!isLoading && docs.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todavía no hay documentos cargados. Empezá con “Nuevo documento”.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {docs.map((d) => {
          const lista = (cuotasPorDoc.get(d.id) ?? []).slice().sort((a, b) => a.numero_cuota - b.numero_cuota);
          const pend = lista.filter((c) => c.estado !== "pagada");
          const saldo = pend.reduce((s, c) => s + n(c.monto), 0);
          const open = abierto === d.id;
          return (
            <Card key={d.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button className="flex items-start gap-2 text-left" onClick={() => setAbierto(open ? null : d.id)}>
                    {open ? <ChevronDown className="mt-1 h-4 w-4" /> : <ChevronRight className="mt-1 h-4 w-4" />}
                    <div>
                      <CardTitle className="text-base">{d.bien_descripcion}</CardTitle>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {d.tipo_documento}{d.numero ? ` N° ${d.numero}` : ""} · {formatFecha(d.fecha)} ·{" "}
                        {d.proveedor_nombre || data?.proveedores.find((p) => p.id === d.proveedor_id)?.nombre || "sin acreedor"}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-semibold">{money(n(d.monto_total), d.moneda)}</div>
                      <div className="text-xs text-muted-foreground">
                        Saldo {money(saldo, d.moneda)} · {pend.length}/{lista.length} cuotas
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setForm({ open: true, doc: d })} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => eliminar(d.id)} aria-label="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {open && (
                <CardContent className="space-y-4">
                  <Archivos docId={d.id} />

                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs">Factura de compra asociada</Label>
                    <Select
                      value={d.factura_compra_id ?? "none"}
                      onValueChange={(x) => asociarFactura(d.id, x === "none" ? "" : x)}
                    >
                      <SelectTrigger className="h-8 w-72 text-xs"><SelectValue placeholder="Sin factura" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin factura</SelectItem>
                        {(data?.facturas ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.numero ?? "s/n"} · {formatFecha(f.fecha)} · {formatPesos(n(f.total))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Cuota</TableHead>
                        <TableHead className="w-32">Vencimiento</TableHead>
                        <TableHead className="w-36">Importe</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="w-36" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lista.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.numero_cuota}
                            {c.numero_pagare && <div className="text-[11px] text-muted-foreground">N° {c.numero_pagare}</div>}
                          </TableCell>
                          <TableCell>{formatFecha(c.fecha_vencimiento)}</TableCell>
                          <TableCell className="tabular-nums">{money(n(c.monto), c.moneda)}</TableCell>
                          <TableCell><EstadoCuota c={c} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.estado === "pagada" ? `${formatFecha(c.fecha_pago)} · ${c.forma_pago ?? ""}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.estado !== "pagada" && (
                              <Button size="sm" variant="outline" onClick={() => setPago({ cuota: c, doc: d })}>
                                <Banknote className="mr-2 h-4 w-4" /> Pagar
                              </Button>
                            )}
                            {c.estado === "pagada" && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                          </TableCell>
                        </TableRow>
                      ))}
                      {lista.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          Sin cuotas cargadas. Editá el documento y generá el cronograma.
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>

                  {d.observaciones && <p className="text-xs text-muted-foreground">{d.observaciones}</p>}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={form.open} onOpenChange={(o) => !o && setForm({ open: false, doc: null })}>
        {form.open && (
          <FormDoc
            doc={form.doc}
            cuotasExistentes={form.doc ? (cuotasPorDoc.get(form.doc.id) ?? []) : []}
            proveedores={data?.proveedores ?? []}
            activos={data?.activos ?? []}
            dolar={dolar}
            onClose={() => setForm({ open: false, doc: null })}
          />
        )}
      </Dialog>

      <Dialog open={!!pago} onOpenChange={(o) => !o && setPago(null)}>
        {pago && (
          <PagoDialog
            cuota={pago.cuota}
            doc={pago.doc}
            cuentas={data?.cuentas ?? []}
            dolar={dolar}
            onClose={() => setPago(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
