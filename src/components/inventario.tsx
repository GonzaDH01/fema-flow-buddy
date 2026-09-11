import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, ChevronLeft, ChevronRight, ImagePlus, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BUCKET = "inventario-img";
const TIPOS = ["Maquinaria", "Herramienta", "Implemento", "Rodado", "Equipo", "Otro"] as const;
const ESTADOS = ["Operativo", "En reparación", "Fuera de servicio", "Vendido"] as const;

type Activo = {
  id: string;
  nombre: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  numero_serie: string | null;
  estado: string;
  ubicacion: string | null;
  responsable: string | null;
  valor_compra: number | null;
  fecha_compra: string | null;
  mantenimiento: string | null;
  proximo_service: string | null;
  observaciones: string | null;
};
type Imagen = { id: string; activo_id: string; path: string; orden: number; es_principal: boolean };

const money = (n: number | null) =>
  n == null ? "—" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

const estadoVariant = (e: string) =>
  e === "Operativo" ? "default" : e === "En reparación" ? "secondary" : "outline";

function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ["inventario-urls", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d) => {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      });
      return map;
    },
  });
}

export function Inventario() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ open: boolean; row: Activo | null }>({ open: false, row: null });
  const [detalle, setDetalle] = useState<Activo | null>(null);

  const { data: activos, isLoading } = useQuery({
    queryKey: ["fema_activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_activos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Activo[];
    },
  });

  const { data: imagenes } = useQuery({
    queryKey: ["fema_activo_imagenes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_activo_imagenes")
        .select("id,activo_id,path,orden,es_principal")
        .order("orden", { ascending: true });
      if (error) throw error;
      return data as Imagen[];
    },
  });

  const porActivo = useMemo(() => {
    const m: Record<string, Imagen[]> = {};
    (imagenes ?? []).forEach((i) => {
      (m[i.activo_id] ??= []).push(i);
    });
    Object.values(m).forEach((l) => l.sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden));
    return m;
  }, [imagenes]);

  const portadas = useMemo(
    () => Object.values(porActivo).map((l) => l[0]?.path).filter(Boolean) as string[],
    [porActivo],
  );
  const { data: urls } = useSignedUrls(portadas);

  const filtrados = useMemo(() => {
    const rows = activos ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nombre, r.tipo, r.marca, r.modelo, r.numero_serie, r.ubicacion, r.responsable]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [activos, search]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["fema_activos"] });
    qc.invalidateQueries({ queryKey: ["fema_activo_imagenes"] });
  };

  const eliminar = async (row: Activo) => {
    const paths = (porActivo[row.id] ?? []).map((i) => i.path);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("fema_activos").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bien eliminado");
    setDetalle(null);
    refrescar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Inventario de la empresa</h3>
          <p className="text-xs text-muted-foreground">Maquinaria y herramientas con fotos y características</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar bien..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-52 pl-8"
            />
          </div>
          <Button size="sm" onClick={() => setForm({ open: true, row: null })}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo bien
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-lg" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Todavía no cargaste maquinaria ni herramientas.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => {
            const portada = porActivo[a.id]?.[0];
            const src = portada ? urls?.[portada.path] : undefined;
            return (
              <button
                key={a.id}
                onClick={() => setDetalle(a)}
                className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-primary"
              >
                <div className="flex h-40 items-center justify-center overflow-hidden bg-muted">
                  {src ? (
                    <img src={src} alt={a.nombre} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <Wrench className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-tight">{a.nombre}</span>
                    <Badge variant={estadoVariant(a.estado) as never}>{a.estado}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[a.tipo, a.marca, a.modelo, a.anio].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(porActivo[a.id]?.length ?? 0)} imagen(es){a.ubicacion ? ` · ${a.ubicacion}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={form.open} onOpenChange={(v) => !v && setForm({ open: false, row: null })}>
        {form.open && (
          <ActivoForm
            key={form.row?.id ?? "nuevo"}
            initial={form.row}
            userId={user!.id}
            onDone={() => {
              setForm({ open: false, row: null });
              refrescar();
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        {detalle && (
          <DetalleActivo
            key={detalle.id}
            activo={detalle}
            imagenes={porActivo[detalle.id] ?? []}
            onEdit={() => {
              const row = detalle;
              setDetalle(null);
              setForm({ open: true, row });
            }}
            onDelete={() => eliminar(detalle)}
          />
        )}
      </Dialog>
    </div>
  );
}

function DetalleActivo({
  activo,
  imagenes,
  onEdit,
  onDelete,
}: {
  activo: Activo;
  imagenes: Imagen[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const paths = useMemo(() => imagenes.map((i) => i.path), [imagenes]);
  const { data: urls } = useSignedUrls(paths);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [activo.id]);

  const actual = imagenes[idx];
  const src = actual ? urls?.[actual.path] : undefined;
  const mover = (d: number) => setIdx((i) => (imagenes.length ? (i + d + imagenes.length) % imagenes.length : 0));

  const datos: [string, string][] = [
    ["Tipo", activo.tipo],
    ["Marca", activo.marca ?? "—"],
    ["Modelo", activo.modelo ?? "—"],
    ["Año", activo.anio ? String(activo.anio) : "—"],
    ["Número de serie", activo.numero_serie ?? "—"],
    ["Estado", activo.estado],
    ["Ubicación", activo.ubicacion ?? "—"],
    ["Responsable", activo.responsable ?? "—"],
    ["Valor de compra", money(activo.valor_compra)],
    ["Fecha de compra", activo.fecha_compra ?? "—"],
    ["Próximo servicio", activo.proximo_service ?? "—"],
  ];

  return (
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{activo.nombre}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {src ? (
              <img src={src} alt={activo.nombre} className="h-full w-full object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">Sin imágenes cargadas</span>
            )}
            {imagenes.length > 1 && (
              <>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => mover(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => mover(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs">
                  {idx + 1} / {imagenes.length}
                </span>
              </>
            )}
          </div>
          {imagenes.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imagenes.map((im, i) => (
                <button
                  key={im.id}
                  onClick={() => setIdx(i)}
                  className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border ${
                    i === idx ? "border-primary ring-2 ring-ring" : "border-border"
                  }`}
                >
                  {urls?.[im.path] ? (
                    <img src={urls[im.path]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {datos.map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="font-medium">{v}</p>
              </div>
            ))}
          </div>
          {activo.mantenimiento && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">Mantenimiento</p>
              <p className="whitespace-pre-line">{activo.mantenimiento}</p>
            </div>
          )}
          {activo.observaciones && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">Observaciones</p>
              <p className="whitespace-pre-line">{activo.observaciones}</p>
            </div>
          )}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar
        </Button>
        <Button size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-4 w-4" /> Editar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ActivoForm({
  initial,
  userId,
  onDone,
}: {
  initial: Activo | null;
  userId: string;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    nombre: initial?.nombre ?? "",
    tipo: initial?.tipo ?? "Maquinaria",
    marca: initial?.marca ?? "",
    modelo: initial?.modelo ?? "",
    anio: initial?.anio ? String(initial.anio) : "",
    numero_serie: initial?.numero_serie ?? "",
    estado: initial?.estado ?? "Operativo",
    ubicacion: initial?.ubicacion ?? "",
    responsable: initial?.responsable ?? "",
    valor_compra: initial?.valor_compra != null ? String(initial.valor_compra) : "",
    fecha_compra: initial?.fecha_compra ?? "",
    proximo_service: initial?.proximo_service ?? "",
    mantenimiento: initial?.mantenimiento ?? "",
    observaciones: initial?.observaciones ?? "",
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const [nuevas, setNuevas] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: existentes, refetch } = useQuery({
    queryKey: ["fema_activo_imagenes", initial?.id],
    enabled: !!initial?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_activo_imagenes")
        .select("id,activo_id,path,orden,es_principal")
        .eq("activo_id", initial!.id)
        .order("orden");
      if (error) throw error;
      return data as Imagen[];
    },
  });
  const { data: urls } = useSignedUrls((existentes ?? []).map((i) => i.path));

  const borrarImagen = async (im: Imagen) => {
    await supabase.storage.from(BUCKET).remove([im.path]);
    const { error } = await supabase.from("fema_activo_imagenes").delete().eq("id", im.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Imagen eliminada");
    refetch();
  };

  const guardar = async () => {
    if (v.nombre.trim().length < 2) {
      toast.error("Ingresá el nombre del bien");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      nombre: v.nombre.trim(),
      tipo: v.tipo,
      marca: v.marca || null,
      modelo: v.modelo || null,
      anio: v.anio ? Number(v.anio) : null,
      numero_serie: v.numero_serie || null,
      estado: v.estado,
      ubicacion: v.ubicacion || null,
      responsable: v.responsable || null,
      valor_compra: v.valor_compra ? Number(v.valor_compra) : null,
      fecha_compra: v.fecha_compra || null,
      proximo_service: v.proximo_service || null,
      mantenimiento: v.mantenimiento || null,
      observaciones: v.observaciones || null,
    };

    let activoId = initial?.id;
    if (activoId) {
      const { error } = await supabase.from("fema_activos").update(payload).eq("id", activoId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from("fema_activos").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false);
        toast.error(error?.message ?? "No se pudo guardar");
        return;
      }
      activoId = data.id;
    }

    const base = (existentes?.length ?? 0);
    for (let i = 0; i < nuevas.length; i++) {
      const file = nuevas[i];
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${activoId}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) {
        toast.error(`No se pudo subir ${file.name}: ${upErr.message}`);
        continue;
      }
      await supabase.from("fema_activo_imagenes").insert({
        user_id: userId,
        activo_id: activoId,
        path,
        orden: base + i,
        es_principal: base + i === 0,
      });
    }

    setSaving(false);
    toast.success(initial ? "Bien actualizado" : "Bien cargado");
    onDone();
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar" : "Nuevo"} bien del inventario</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre" required>
            <Input value={v.nombre} onChange={set("nombre")} placeholder="Tractor John Deere 6145" />
          </FormField>
          <FormField label="Tipo">
            <Select value={v.tipo} onValueChange={(x) => setV((s) => ({ ...s, tipo: x }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField label="Marca">
            <Input value={v.marca} onChange={set("marca")} />
          </FormField>
          <FormField label="Modelo">
            <Input value={v.modelo} onChange={set("modelo")} />
          </FormField>
          <FormField label="Año">
            <Input type="number" value={v.anio} onChange={set("anio")} />
          </FormField>
          <FormField label="Número de serie">
            <Input value={v.numero_serie} onChange={set("numero_serie")} />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Estado">
            <Select value={v.estado} onValueChange={(x) => setV((s) => ({ ...s, estado: x }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Ubicación">
            <Input value={v.ubicacion} onChange={set("ubicacion")} placeholder="Galpón, campo, taller…" />
          </FormField>
          <FormField label="Responsable">
            <Input value={v.responsable} onChange={set("responsable")} />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Valor de compra">
            <Input type="number" step="0.01" value={v.valor_compra} onChange={set("valor_compra")} />
          </FormField>
          <FormField label="Fecha de compra">
            <Input type="date" value={v.fecha_compra} onChange={set("fecha_compra")} />
          </FormField>
          <FormField label="Próximo servicio">
            <Input type="date" value={v.proximo_service} onChange={set("proximo_service")} />
          </FormField>
        </div>
        <FormField label="Mantenimiento">
          <Textarea rows={2} value={v.mantenimiento} onChange={set("mantenimiento")} />
        </FormField>
        <FormField label="Observaciones">
          <Textarea rows={2} value={v.observaciones} onChange={set("observaciones")} />
        </FormField>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Imágenes</p>
          {!!existentes?.length && (
            <div className="flex flex-wrap gap-2">
              {existentes.map((im) => (
                <div key={im.id} className="relative h-20 w-24 overflow-hidden rounded-md border border-border">
                  {urls?.[im.path] ? (
                    <img src={urls[im.path]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute right-1 top-1 h-6 w-6"
                    onClick={() => borrarImagen(im)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setNuevas(Array.from(e.target.files ?? []))}
          />
          {nuevas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <ImagePlus className="mr-1 inline h-3.5 w-3.5" />
              {nuevas.length} imagen(es) se subirán al guardar
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={guardar} disabled={saving}>
          {initial ? "Guardar cambios" : "Crear bien"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
