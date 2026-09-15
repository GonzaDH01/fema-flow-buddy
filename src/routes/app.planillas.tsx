import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { FormField } from "@/lib/form-helpers";
import { formatNumero, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/app/planillas")({ component: Page });

const BUCKET = "planillas-img";

type Planilla = {
  id: string; fecha: string; bolsero_empleado_id: string | null; bolsero_nombre: string | null;
  zona: string | null; cultivo: string | null; imagen_path: string | null; observaciones: string | null;
  total_viajes: number; total_metros: number; anio: number | null; mes: number | null;
};
type PlanillaEquipo = {
  id: string; planilla_id: string; equipo_id: string | null; equipo_nombre: string;
  viajes: number; metros_bolsa: number; observaciones: string | null; orden: number;
};
type FilaEquipo = { equipo_nombre: string; viajes: string; metros_bolsa: string; observaciones: string };

const FILA_VACIA: FilaEquipo = { equipo_nombre: "", viajes: "", metros_bolsa: "", observaciones: "" };

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Planilla | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const planillasQ = useQuery({
    queryKey: ["fema_planillas", year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_planillas_bolsero").select("*").eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as Planilla[];
    },
  });
  const equiposPlanillaQ = useQuery({
    queryKey: ["fema_planilla_equipos", year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_planilla_equipos").select("*").order("orden");
      if (error) throw error; return data as PlanillaEquipo[];
    },
  });
  const empleadosQ = useQuery({
    queryKey: ["fema_empleados_planilla"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_empleados").select("id,nombre,activo").order("nombre");
      if (error) throw error; return data as { id: string; nombre: string; activo: boolean | null }[];
    },
  });
  const equiposQ = useQuery({
    queryKey: ["fema_equipos_planilla"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_equipos").select("id,nombre").order("nombre");
      if (error) throw error; return data as { id: string; nombre: string }[];
    },
  });

  const planillas = planillasQ.data ?? [];
  const equiposPlanilla = equiposPlanillaQ.data ?? [];

  const porPlanilla = useMemo(() => {
    const m: Record<string, PlanillaEquipo[]> = {};
    for (const e of equiposPlanilla) (m[e.planilla_id] ||= []).push(e);
    return m;
  }, [equiposPlanilla]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return planillas;
    return planillas.filter((p) =>
      [p.bolsero_nombre, p.zona, p.cultivo].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [planillas, busqueda]);

  const totViajes = filtradas.reduce((a, p) => a + Number(p.total_viajes || 0), 0);
  const totMetros = filtradas.reduce((a, p) => a + Number(p.total_metros || 0), 0);

  const eliminar = async (p: Planilla) => {
    if (!confirm("¿Eliminar esta planilla?")) return;
    if (p.imagen_path) await supabase.storage.from(BUCKET).remove([p.imagen_path]);
    const { error } = await (supabase as any).from("fema_planillas_bolsero").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Planilla eliminada");
    qc.invalidateQueries({ queryKey: ["fema_planillas"] });
    qc.invalidateQueries({ queryKey: ["fema_planilla_equipos"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por bolsero, zona o cultivo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto">
          <Button onClick={() => { setEdit(null); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nueva planilla
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Planillas</div>
          <div className="text-2xl font-semibold">{filtradas.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Viajes totales</div>
          <div className="text-2xl font-semibold">{formatNumero(totViajes, 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Metros de bolsa</div>
          <div className="text-2xl font-semibold">{formatNumero(totMetros, 0)}</div>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Bolsero</TableHead>
              <TableHead>Zona / Localidad</TableHead>
              <TableHead>Cultivo</TableHead>
              <TableHead>Equipos</TableHead>
              <TableHead className="text-right">Viajes</TableHead>
              <TableHead className="text-right">Metros</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                Sin planillas cargadas para {year}.
              </TableCell></TableRow>
            )}
            {filtradas.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatFecha(p.fecha)}</TableCell>
                <TableCell className="font-medium">{p.bolsero_nombre || "—"}</TableCell>
                <TableCell>{p.zona || "—"}</TableCell>
                <TableCell>{p.cultivo || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(porPlanilla[p.id] ?? []).map((e) => (
                      <Badge key={e.id} variant="secondary" className="font-normal">
                        {e.equipo_nombre}: {formatNumero(e.viajes, 0)} v / {formatNumero(e.metros_bolsa, 0)} m
                      </Badge>
                    ))}
                    {(porPlanilla[p.id] ?? []).length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatNumero(p.total_viajes, 0)}</TableCell>
                <TableCell className="text-right">{formatNumero(p.total_metros, 0)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEdit(p); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => eliminar(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <PlanillaDialog
        open={open}
        onOpenChange={setOpen}
        planilla={edit}
        equiposIniciales={edit ? (porPlanilla[edit.id] ?? []) : []}
        empleados={empleadosQ.data ?? []}
        equipos={equiposQ.data ?? []}
      />
    </div>
  );
}

function PlanillaDialog({ open, onOpenChange, planilla, equiposIniciales, empleados, equipos }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planilla: Planilla | null;
  equiposIniciales: PlanillaEquipo[];
  empleados: { id: string; nombre: string; activo: boolean | null }[];
  equipos: { id: string; nombre: string }[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState("");
  const [empleadoId, setEmpleadoId] = useState("libre");
  const [nombre, setNombre] = useState("");
  const [zona, setZona] = useState("");
  const [cultivo, setCultivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [filas, setFilas] = useState<FilaEquipo[]>([{ ...FILA_VACIA }]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagenPath, setImagenPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setArchivo(null);
    setGuardando(false);
    if (planilla) {
      setFecha(planilla.fecha);
      setEmpleadoId(planilla.bolsero_empleado_id ?? "libre");
      setNombre(planilla.bolsero_nombre ?? "");
      setZona(planilla.zona ?? "");
      setCultivo(planilla.cultivo ?? "");
      setObservaciones(planilla.observaciones ?? "");
      setImagenPath(planilla.imagen_path);
      setFilas(
        equiposIniciales.length
          ? equiposIniciales.map((e) => ({
              equipo_nombre: e.equipo_nombre,
              viajes: String(e.viajes ?? ""),
              metros_bolsa: String(e.metros_bolsa ?? ""),
              observaciones: e.observaciones ?? "",
            }))
          : [{ ...FILA_VACIA }],
      );
    } else {
      setFecha(new Date().toISOString().slice(0, 10));
      setEmpleadoId("libre");
      setNombre(""); setZona(""); setCultivo(""); setObservaciones("");
      setImagenPath(null);
      setFilas([{ ...FILA_VACIA }]);
    }
  }, [open, planilla, equiposIniciales]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (archivo) { setPreviewUrl(URL.createObjectURL(archivo)); return; }
      if (imagenPath) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(imagenPath, 3600);
        if (!cancelado) setPreviewUrl(data?.signedUrl ?? null);
        return;
      }
      setPreviewUrl(null);
    })();
    return () => { cancelado = true; };
  }, [archivo, imagenPath]);

  const setFila = (i: number, campo: keyof FilaEquipo, valor: string) =>
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));

  const totalViajes = filas.reduce((a, f) => a + (Number(f.viajes) || 0), 0);
  const totalMetros = filas.reduce((a, f) => a + (Number(f.metros_bolsa) || 0), 0);

  const guardar = async () => {
    if (!user) return;
    if (!fecha) { toast.error("Indicá la fecha"); return; }
    const nombreFinal = empleadoId !== "libre"
      ? (empleados.find((e) => e.id === empleadoId)?.nombre ?? nombre)
      : nombre.trim();
    if (!nombreFinal) { toast.error("Indicá el bolsero"); return; }
    const filasValidas = filas.filter((f) => f.equipo_nombre.trim());
    setGuardando(true);
    try {
      let path = imagenPath;
      if (archivo) {
        const ext = archivo.name.split(".").pop() || "jpg";
        const nuevo = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(nuevo, archivo, { upsert: false });
        if (upErr) throw upErr;
        if (imagenPath) await supabase.storage.from(BUCKET).remove([imagenPath]);
        path = nuevo;
      }
      const d = new Date(fecha + "T00:00:00");
      const payload = {
        user_id: user.id,
        fecha,
        bolsero_empleado_id: empleadoId !== "libre" ? empleadoId : null,
        bolsero_nombre: nombreFinal,
        zona: zona.trim() || null,
        cultivo: cultivo.trim() || null,
        observaciones: observaciones.trim() || null,
        imagen_path: path,
        total_viajes: totalViajes,
        total_metros: totalMetros,
        anio: d.getFullYear(),
        mes: d.getMonth() + 1,
      };

      let planillaId = planilla?.id ?? null;
      if (planillaId) {
        const { error } = await (supabase as any).from("fema_planillas_bolsero").update(payload).eq("id", planillaId);
        if (error) throw error;
        const { error: delErr } = await (supabase as any)
          .from("fema_planilla_equipos").delete().eq("planilla_id", planillaId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await (supabase as any)
          .from("fema_planillas_bolsero").insert(payload).select("id").single();
        if (error) throw error;
        planillaId = data.id as string;
      }

      if (filasValidas.length) {
        const rows = filasValidas.map((f, i) => ({
          user_id: user.id,
          planilla_id: planillaId,
          equipo_id: equipos.find((e) => e.nombre === f.equipo_nombre.trim())?.id ?? null,
          equipo_nombre: f.equipo_nombre.trim(),
          viajes: Number(f.viajes) || 0,
          metros_bolsa: Number(f.metros_bolsa) || 0,
          observaciones: f.observaciones.trim() || null,
          orden: i,
        }));
        const { error } = await (supabase as any).from("fema_planilla_equipos").insert(rows);
        if (error) throw error;
      }

      toast.success(planilla ? "Planilla actualizada" : "Planilla guardada");
      qc.invalidateQueries({ queryKey: ["fema_planillas"] });
      qc.invalidateQueries({ queryKey: ["fema_planilla_equipos"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar la planilla");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{planilla ? "Editar planilla" : "Nueva planilla de bolsero"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Fecha" required>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </FormField>
            <FormField label="Bolsero">
              <Select value={empleadoId} onValueChange={setEmpleadoId}>
                <SelectTrigger><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="libre">Otro (escribir nombre)</SelectItem>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {empleadoId === "libre" && (
              <FormField label="Apellido y nombre" required>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pérez, Juan" />
              </FormField>
            )}
            <FormField label="Zona / Localidad">
              <Input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Ej: Rufino" />
            </FormField>
            <FormField label="Cultivo">
              <Input value={cultivo} onChange={(e) => setCultivo(e.target.value)} placeholder="Ej: Maíz" />
            </FormField>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Equipos que trabajaron</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setFilas((p) => [...p, { ...FILA_VACIA }])}>
                <Plus className="mr-1 h-4 w-4" /> Agregar equipo
              </Button>
            </div>
            <div className="space-y-2">
              {filas.map((f, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_0.8fr_0.9fr_auto]">
                  <Input
                    list="equipos-planilla"
                    value={f.equipo_nombre}
                    onChange={(e) => setFila(i, "equipo_nombre", e.target.value)}
                    placeholder="Equipo (Ford, Chevrolet, Zanello...)"
                  />
                  <Input
                    type="number" inputMode="decimal" value={f.viajes}
                    onChange={(e) => setFila(i, "viajes", e.target.value)} placeholder="Viajes"
                  />
                  <Input
                    type="number" inputMode="decimal" value={f.metros_bolsa}
                    onChange={(e) => setFila(i, "metros_bolsa", e.target.value)} placeholder="Metros de bolsa"
                  />
                  <Button
                    type="button" variant="ghost" size="icon"
                    onClick={() => setFilas((p) => (p.length === 1 ? [{ ...FILA_VACIA }] : p.filter((_, idx) => idx !== i)))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <datalist id="equipos-planilla">
                {equipos.map((e) => <option key={e.id} value={e.nombre} />)}
              </datalist>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Total: {formatNumero(totalViajes, 0)} viajes · {formatNumero(totalMetros, 0)} metros de bolsa
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-medium">Imagen de la planilla</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setArchivo(f); e.target.value = ""; }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="mr-2 h-4 w-4" /> {previewUrl ? "Cambiar imagen" : "Subir foto"}
              </Button>
              {previewUrl && (
                <Button type="button" variant="ghost" onClick={() => { setArchivo(null); setImagenPath(null); }}>
                  Quitar
                </Button>
              )}
            </div>
            {previewUrl && (
              <img src={previewUrl} alt="Planilla de trabajo" className="mt-3 max-h-72 w-full rounded-md object-contain" />
            )}
          </div>

          <FormField label="Observaciones">
            <Textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
