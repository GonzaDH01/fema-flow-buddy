import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, AlertTriangle, Upload, Camera, ScanLine, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const TIPOS_CARNET = [
  "Licencia de conducir particular",
  "Licencia nacional de transporte interjurisdiccional (LiNTI)",
  "Licencia profesional",
  "Carga general",
  "Carga peligrosa",
  "Curso de cargas peligrosas",
  "Libreta sanitaria",
  "Otro",
];

export const CATEGORIAS_CARNET = ["A", "B1", "B2", "C1", "C2", "C3", "D1", "D2", "D3", "E1", "E2", "F", "G1", "G2", "G3"];

export type Carnet = {
  id: string;
  empleado_id: string;
  tipo: string;
  categorias: string | null;
  numero: string | null;
  autoridad: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string;
  observaciones: string | null;
  imagen_path?: string | null;
};

const BUCKET_EMP = "empleados-doc";

// Reduce la foto del carnet a un tamaño que el lector pueda procesar (máx ~2200px, JPEG)
async function comprimirParaOcr(file: File): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo abrir la imagen"));
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

const hoy = () => new Date(new Date().toDateString());

export function diasParaVencer(fecha: string) {
  const f = new Date(`${fecha}T00:00:00`);
  return Math.round((f.getTime() - hoy().getTime()) / 86400000);
}

export function EstadoCarnet({ fecha }: { fecha: string }) {
  const d = diasParaVencer(fecha);
  if (d < 0) return <Badge variant="destructive">Vencido hace {Math.abs(d)} días</Badge>;
  if (d <= 30) return <Badge variant="destructive">Vence en {d} días</Badge>;
  if (d <= 90) return <Badge variant="secondary">Vence en {d} días</Badge>;
  return <Badge variant="outline">Vigente</Badge>;
}

const vacio = {
  tipo: TIPOS_CARNET[0],
  categorias: "",
  numero: "",
  autoridad: "",
  fecha_emision: "",
  fecha_vencimiento: "",
  observaciones: "",
};

function FormCarnet({
  empleadoId,
  carnet,
  onClose,
}: {
  empleadoId: string;
  carnet: Carnet | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState(
    carnet
      ? {
          tipo: carnet.tipo,
          categorias: carnet.categorias ?? "",
          numero: carnet.numero ?? "",
          autoridad: carnet.autoridad ?? "",
          fecha_emision: carnet.fecha_emision ?? "",
          fecha_vencimiento: carnet.fecha_vencimiento,
          observaciones: carnet.observaciones ?? "",
        }
      : vacio,
  );
  const [guardando, setGuardando] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (foto) {
      const u = URL.createObjectURL(foto);
      setFotoUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    if (carnet?.imagen_path) {
      let cancelado = false;
      supabase.storage
        .from(BUCKET_EMP)
        .createSignedUrl(carnet.imagen_path, 3600)
        .then(({ data }) => {
          if (!cancelado) setFotoUrl(data?.signedUrl ?? null);
        });
      return () => {
        cancelado = true;
      };
    }
    setFotoUrl(null);
  }, [foto, carnet?.imagen_path]);

  const leerCarnet = async () => {
    if (!foto) {
      toast.error("Subí primero la foto del carnet");
      return;
    }
    setLeyendo(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión vencida, volvé a ingresar");
      const { base64, mimeType } = await comprimirParaOcr(foto);
      if (!base64) throw new Error("No se pudo procesar la imagen");
      const res = await fetch("/api/public/ocr-carnet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.error ?? "No se pudo leer la imagen");
      const d = (out?.data ?? {}) as Record<string, string | null>;
      const limpio = (x: string | null | undefined) => (x != null && String(x).trim() ? String(x).trim() : "");
      const tipoLeido = limpio(d.tipo);
      setV((s) => ({
        ...s,
        tipo: TIPOS_CARNET.includes(tipoLeido) ? tipoLeido : s.tipo,
        categorias: limpio(d.categorias) || s.categorias,
        numero: limpio(d.numero) || s.numero,
        autoridad: limpio(d.autoridad) || s.autoridad,
        fecha_emision: limpio(d.fecha_emision) || s.fecha_emision,
        fecha_vencimiento: limpio(d.fecha_vencimiento) || s.fecha_vencimiento,
      }));
      const algo = Object.values(d).some((x) => limpio(x));
      if (algo) toast.success("Datos del carnet cargados. Revisalos antes de guardar.");
      else toast.error("No se pudieron leer datos del carnet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al leer el carnet");
    } finally {
      setLeyendo(false);
    }
  };

  const cats = v.categorias ? v.categorias.split(",").map((c) => c.trim()).filter(Boolean) : [];
  const toggleCat = (c: string) => {
    const nuevas = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
    set("categorias", nuevas.join(", "));
  };

  const guardar = async () => {
    if (!v.fecha_vencimiento) {
      toast.error("Indicá la fecha de vencimiento");
      return;
    }
    setGuardando(true);
    let imagenPath = carnet?.imagen_path ?? null;
    if (foto) {
      const ext = (foto.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${empleadoId}/carnets/${crypto.randomUUID()}.${ext}`;
      const { error: errUp } = await supabase.storage.from(BUCKET_EMP).upload(path, foto, { upsert: false });
      if (errUp) {
        setGuardando(false);
        toast.error(errUp.message);
        return;
      }
      imagenPath = path;
    }
    const payload = {
      empleado_id: empleadoId,
      tipo: v.tipo,
      categorias: v.categorias || null,
      numero: v.numero || null,
      autoridad: v.autoridad || null,
      fecha_emision: v.fecha_emision || null,
      fecha_vencimiento: v.fecha_vencimiento,
      observaciones: v.observaciones || null,
      imagen_path: imagenPath,
    };
    const { error } = carnet
      ? await supabase.from("fema_empleado_carnets").update(payload).eq("id", carnet.id)
      : await supabase.from("fema_empleado_carnets").insert(payload);
    setGuardando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(carnet ? "Carnet actualizado" : "Carnet agregado");
    qc.invalidateQueries({ queryKey: ["fema_empleado_carnets"] });
    onClose();
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{carnet ? "Editar carnet" : "Nuevo carnet"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Foto del carnet</p>
              <p className="text-xs text-muted-foreground">Subí la foto y leé los datos automáticamente</p>
            </div>
            <Button type="button" size="sm" onClick={leerCarnet} disabled={!foto || leyendo}>
              {leyendo ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ScanLine className="mr-1.5 size-3.5" />}
              Leer carnet
            </Button>
          </div>
          {fotoUrl ? (
            <img src={fotoUrl} alt="Carnet" className="h-40 w-full rounded-md bg-muted/30 object-contain" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
              <Upload className="size-6 opacity-40" />
              <span>Sin imagen</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-9 flex-1" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 size-3.5" /> Subir
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-9 flex-1" onClick={() => camRef.current?.click()}>
              <Camera className="mr-1.5 size-3.5" /> Cámara
            </Button>
            {foto && (
              <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => setFoto(null)}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFoto(f);
              e.target.value = "";
            }}
          />
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFoto(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de carnet</Label>
          <Select value={v.tipo} onValueChange={(val) => set("tipo", val)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_CARNET.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categorías habilitadas</Label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS_CARNET.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={cats.includes(c) ? "default" : "outline"}
                className="h-7 px-2.5"
                onClick={() => toggleCat(c)}
              >
                {c}
              </Button>
            ))}
          </div>
          <Input value={v.categorias} onChange={(e) => set("categorias", e.target.value)} placeholder="Ej: B1, C2, E1" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input value={v.numero} onChange={(e) => set("numero", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Emitido por</Label>
            <Input value={v.autoridad} onChange={(e) => set("autoridad", e.target.value)} placeholder="Municipalidad / CNRT" />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de emisión</Label>
            <Input type="date" value={v.fecha_emision} onChange={(e) => set("fecha_emision", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de vencimiento</Label>
            <Input
              type="date"
              value={v.fecha_vencimiento}
              onChange={(e) => set("fecha_vencimiento", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observaciones</Label>
          <Textarea value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          {carnet ? "Guardar cambios" : "Agregar carnet"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CarnetsEmpleado({ empleadoId }: { empleadoId: string }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Carnet | null>(null);

  const { data: carnets } = useQuery({
    queryKey: ["fema_empleado_carnets", empleadoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_empleado_carnets")
        .select("*")
        .eq("empleado_id", empleadoId)
        .order("fecha_vencimiento");
      if (error) throw error;
      return data as Carnet[];
    },
  });

  const borrar = async (id: string) => {
    const { error } = await supabase.from("fema_empleado_carnets").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Carnet eliminado");
    qc.invalidateQueries({ queryKey: ["fema_empleado_carnets"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Carnets habilitados y control de vencimientos</p>
        <Button
          size="sm"
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <Plus className="mr-1 size-3.5" /> Nuevo carnet
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Categorías</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(carnets ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                Sin carnets cargados
              </TableCell>
            </TableRow>
          )}
          {(carnets ?? []).map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.tipo}</TableCell>
              <TableCell>{c.categorias ?? "—"}</TableCell>
              <TableCell>{c.numero ?? "—"}</TableCell>
              <TableCell>{new Date(`${c.fecha_vencimiento}T00:00:00`).toLocaleDateString("es-AR")}</TableCell>
              <TableCell>
                <EstadoCarnet fecha={c.fecha_vencimiento} />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => {
                      setEditando(c);
                      setAbierto(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => borrar(c.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {abierto && <FormCarnet empleadoId={empleadoId} carnet={editando} onClose={() => setAbierto(false)} />}
      </Dialog>
    </div>
  );
}

type CarnetConEmpleado = Carnet & { fema_empleados: { nombre: string } | null };

export function CarnetsVencimientosTab() {
  const { data } = useQuery({
    queryKey: ["fema_empleado_carnets", "todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_empleado_carnets")
        .select("*, fema_empleados(nombre)")
        .order("fecha_vencimiento");
      if (error) throw error;
      return data as CarnetConEmpleado[];
    },
  });

  const lista = data ?? [];
  const vencidos = lista.filter((c) => diasParaVencer(c.fecha_vencimiento) < 0);
  const porVencer = lista.filter((c) => {
    const d = diasParaVencer(c.fecha_vencimiento);
    return d >= 0 && d <= 90;
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Carnets registrados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{lista.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vencidos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-destructive">{vencidos.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vencen en 90 días</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{porVencer.length}</CardContent>
        </Card>
      </div>

      {(vencidos.length > 0 || porVencer.length > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          <span>
            Hay {vencidos.length} carnet(s) vencido(s) y {porVencer.length} próximo(s) a vencer. Gestioná la renovación.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vencimientos de carnets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categorías</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Todavía no cargaste carnets. Abrí la ficha de un empleado y agregalos.
                  </TableCell>
                </TableRow>
              )}
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.fema_empleados?.nombre ?? "—"}</TableCell>
                  <TableCell>{c.tipo}</TableCell>
                  <TableCell>{c.categorias ?? "—"}</TableCell>
                  <TableCell>{new Date(`${c.fecha_vencimiento}T00:00:00`).toLocaleDateString("es-AR")}</TableCell>
                  <TableCell>
                    <EstadoCarnet fecha={c.fecha_vencimiento} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
