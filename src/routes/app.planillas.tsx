import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatNumero, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ImagePlus, X, Printer } from "lucide-react";
import { imprimirPlanilla } from "@/lib/planilla-print";

export const Route = createFileRoute("/app/planillas")({ component: Page });

const BUCKET = "planillas-img";
const CANT_BOLSAS = 7;
const MAX_VIAJES = 30;

/** Reduce la foto de la planilla a un tamaño que el lector pueda procesar (máx ~2200px, JPEG). */
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

const texto = (x: unknown) => (x != null && String(x).trim() ? String(x).trim() : "");
const numero = (x: unknown) => {
  const n = Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

type Planilla = {
  id: string; fecha: string; bolsero_empleado_id: string | null; bolsero_nombre: string | null;
  cliente_id: string | null; cliente_nombre: string | null; establecimiento: string | null; lote: string | null;
  zona: string | null; cultivo: string | null; imagen_path: string | null; observaciones: string | null;
  bolsas: number[] | null; total_viajes: number; total_metros: number; anio: number | null; mes: number | null;
};
type PlanillaEquipo = {
  id: string; planilla_id: string; equipo_id: string | null; activo_id: string | null; equipo_nombre: string;
  chofer: string | null; dominio: string | null; es_tercero: boolean;
  viajes: number; metros_bolsa: number; observaciones: string | null; orden: number;
};
type Activo = {
  id: string; nombre: string; tipo: string | null; marca: string | null; modelo: string | null;
  responsable: string | null; responsable_empleado_id: string | null; numero_serie: string | null;
};
type EquipoTercero = { id: string; nombre: string; transportista: string | null; interno: string | null; tenencia: string | null };
type FilaEquipo = {
  ref: string;            // id del activo propio, o "" para terceros
  equipo_id: string | null;
  equipo_nombre: string;
  chofer: string; dominio: string; viajes: number; metros: string; es_tercero: boolean;
};

const filaVacia = (es_tercero: boolean): FilaEquipo => ({
  ref: "", equipo_id: null, equipo_nombre: "", chofer: "", dominio: "", viajes: 0, metros: "", es_tercero,
});

/* ---------- Conteo visual de viajes: 30 casillas, igual que el papel ---------- */
function ConteoViajes({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {Array.from({ length: 6 }, (_, g) => (
        <div key={g} className="flex gap-[2px]">
          {Array.from({ length: 5 }, (_, i) => {
            const n = g * 5 + i + 1;
            const marcado = n <= valor;
            return (
              <button
                key={n}
                type="button"
                title={`${n} viaje${n > 1 ? "s" : ""}`}
                onClick={() => onChange(valor === n ? n - 1 : n)}
                className={`h-6 w-6 rounded-[3px] border text-[10px] font-bold transition-colors ${
                  marcado ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                }`}
              >
                {marcado ? "X" : ""}
              </button>
            );
          })}
        </div>
      ))}
      <Input
        type="number" min={0} max={MAX_VIAJES} value={valor || ""}
        onChange={(e) => onChange(Math.max(0, Math.min(MAX_VIAJES, Number(e.target.value) || 0)))}
        className="ml-1 h-8 w-16 text-center font-semibold"
        placeholder="0"
      />
    </div>
  );
}

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
  const activosQ = useQuery({
    queryKey: ["fema_activos_planilla"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_activos")
        .select("id,nombre,tipo,marca,modelo,responsable,responsable_empleado_id,numero_serie")
        .order("nombre");
      if (error) throw error; return data as Activo[];
    },
  });
  const equiposQ = useQuery({
    queryKey: ["fema_equipos_planilla"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_equipos").select("id,nombre,transportista,interno,tenencia").order("nombre");
      if (error) throw error; return data as EquipoTercero[];
    },
  });
  const clientesQ = useQuery({
    queryKey: ["fema_clientes_planilla"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_clientes").select("id,nombre").order("nombre");
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
      [p.bolsero_nombre, p.zona, p.cultivo, p.cliente_nombre, p.establecimiento, p.lote]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [planillas, busqueda]);

  const idsFiltrados = useMemo(() => new Set(filtradas.map((p) => p.id)), [filtradas]);

  const totViajes = filtradas.reduce((a, p) => a + Number(p.total_viajes || 0), 0);
  const totMetros = filtradas.reduce((a, p) => a + Number(p.total_metros || 0), 0);

  /* ---------- Reporte de viajes por equipo ---------- */
  type ResumenEquipo = { clave: string; nombre: string; detalle: string; viajes: number; metros: number; jornadas: number; choferes: Set<string> };
  const resumen = useMemo(() => {
    const propios = new Map<string, ResumenEquipo>();
    const terceros = new Map<string, ResumenEquipo>();
    const activos = activosQ.data ?? [];
    for (const e of equiposPlanilla) {
      if (!idsFiltrados.has(e.planilla_id)) continue;
      const esT = e.es_tercero;
      const mapa = esT ? terceros : propios;
      const clave = (esT ? e.equipo_id : e.activo_id) ?? e.equipo_nombre.trim().toUpperCase();
      const act = !esT && e.activo_id ? activos.find((a) => a.id === e.activo_id) : null;
      const item = mapa.get(clave) ?? {
        clave, nombre: e.equipo_nombre,
        detalle: act ? [act.tipo, act.marca, act.modelo].filter(Boolean).join(" · ") : "",
        viajes: 0, metros: 0, jornadas: 0, choferes: new Set<string>(),
      };
      item.viajes += Number(e.viajes || 0);
      item.metros += Number(e.metros_bolsa || 0);
      item.jornadas += 1;
      if (e.chofer) item.choferes.add(e.chofer);
      mapa.set(clave, item);
    }
    const ord = (m: Map<string, ResumenEquipo>) => [...m.values()].sort((a, b) => b.viajes - a.viajes);
    return { propios: ord(propios), terceros: ord(terceros) };
  }, [equiposPlanilla, idsFiltrados, activosQ.data]);

  const eliminar = async (p: Planilla) => {
    if (!confirm("¿Eliminar esta planilla?")) return;
    if (p.imagen_path) await supabase.storage.from(BUCKET).remove([p.imagen_path]);
    const { error } = await (supabase as any).from("fema_planillas_bolsero").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Planilla eliminada");
    qc.invalidateQueries({ queryKey: ["fema_planillas"] });
    qc.invalidateQueries({ queryKey: ["fema_planilla_equipos"] });
  };

  const imprimirConEquipos = (p: Planilla) =>
    imprimirPlanilla({ ...p, equipos: (porPlanilla[p.id] ?? []).map((e) => ({ ...e })) });

  const tablaResumen = (titulo: string, filas: ResumenEquipo[], vacio: string) => (
    <Card><CardContent className="p-0 overflow-x-auto">
      <div className="border-b px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Equipo / Vehículo</TableHead>
            <TableHead>Choferes</TableHead>
            <TableHead className="text-right">Jornadas</TableHead>
            <TableHead className="text-right">Viajes</TableHead>
            <TableHead className="text-right">Metros de bolsa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.length === 0 && (
            <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{vacio}</TableCell></TableRow>
          )}
          {filas.map((f) => (
            <TableRow key={f.clave}>
              <TableCell>
                <div className="font-medium">{f.nombre}</div>
                {f.detalle && <div className="text-xs text-muted-foreground">{f.detalle}</div>}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{[...f.choferes].join(", ") || "—"}</TableCell>
              <TableCell className="text-right">{formatNumero(f.jornadas, 0)}</TableCell>
              <TableCell className="text-right font-semibold">{formatNumero(f.viajes, 0)}</TableCell>
              <TableCell className="text-right">{formatNumero(f.metros, 0)}</TableCell>
            </TableRow>
          ))}
          {filas.length > 0 && (
            <TableRow className="bg-muted/50">
              <TableCell colSpan={3} className="text-right font-semibold">Totales</TableCell>
              <TableCell className="text-right font-semibold">{formatNumero(filas.reduce((a, f) => a + f.viajes, 0), 0)}</TableCell>
              <TableCell className="text-right font-semibold">{formatNumero(filas.reduce((a, f) => a + f.metros, 0), 0)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por bolsero, cliente, establecimiento, zona o cultivo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => { if (!imprimirPlanilla(null)) toast.error("Permití las ventanas emergentes para imprimir"); }}
          >
            <Printer className="mr-2 h-4 w-4" /> Imprimir planilla en blanco
          </Button>
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

      <Tabs defaultValue="planillas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="planillas">Planillas cargadas</TabsTrigger>
          <TabsTrigger value="reporte">Reporte de viajes</TabsTrigger>
        </TabsList>

        <TabsContent value="planillas">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Establecimiento / Lote</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Cultivo</TableHead>
                  <TableHead>Bolsero</TableHead>
                  <TableHead>Equipos</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Metros día</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    Sin planillas cargadas para {year}.
                  </TableCell></TableRow>
                )}
                {filtradas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatFecha(p.fecha)}</TableCell>
                    <TableCell>{p.cliente_nombre || "—"}</TableCell>
                    <TableCell>{[p.establecimiento, p.lote].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell>{p.zona || "—"}</TableCell>
                    <TableCell>{p.cultivo || "—"}</TableCell>
                    <TableCell className="font-medium">{p.bolsero_nombre || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(porPlanilla[p.id] ?? []).map((e) => (
                          <Badge key={e.id} variant={e.es_tercero ? "outline" : "secondary"} className="font-normal">
                            {e.equipo_nombre}: {formatNumero(e.viajes, 0)} viajes
                          </Badge>
                        ))}
                        {(porPlanilla[p.id] ?? []).length === 0 && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumero(p.total_viajes, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumero(p.total_metros, 0)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Imprimir" onClick={() => imprimirConEquipos(p)}>
                          <Printer className="h-4 w-4" />
                        </Button>
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
        </TabsContent>

        <TabsContent value="reporte" className="space-y-4">
          {tablaResumen("Equipos propios de la empresa", resumen.propios, "Todavía no hay viajes registrados con maquinaria propia.")}
          {tablaResumen("Contratistas / Terceros", resumen.terceros, "Todavía no hay viajes registrados de terceros.")}
        </TabsContent>
      </Tabs>

      <PlanillaDialog
        open={open}
        onOpenChange={setOpen}
        planilla={edit}
        equiposIniciales={edit ? (porPlanilla[edit.id] ?? []) : []}
        empleados={empleadosQ.data ?? []}
        activos={activosQ.data ?? []}
        terceros={equiposQ.data ?? []}
        clientes={clientesQ.data ?? []}
      />
    </div>
  );
}

function PlanillaDialog({ open, onOpenChange, planilla, equiposIniciales, empleados, activos, terceros: tercerosBase, clientes }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planilla: Planilla | null;
  equiposIniciales: PlanillaEquipo[];
  empleados: { id: string; nombre: string; activo: boolean | null }[];
  activos: Activo[];
  terceros: EquipoTercero[];
  clientes: { id: string; nombre: string }[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState("");
  const [clienteId, setClienteId] = useState("libre");
  const [clienteNombre, setClienteNombre] = useState("");
  const [establecimiento, setEstablecimiento] = useState("");
  const [lote, setLote] = useState("");
  const [empleadoId, setEmpleadoId] = useState("libre");
  const [nombre, setNombre] = useState("");
  const [zona, setZona] = useState("");
  const [cultivo, setCultivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [bolsas, setBolsas] = useState<string[]>(Array(CANT_BOLSAS).fill(""));
  const [propios, setPropios] = useState<FilaEquipo[]>([]);
  const [terceros, setTerceros] = useState<FilaEquipo[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagenPath, setImagenPath] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const empMap = useMemo(() => new Map(empleados.map((e) => [e.id, e.nombre])), [empleados]);
  const responsableDe = (a: Activo) =>
    (a.responsable_empleado_id ? empMap.get(a.responsable_empleado_id) : null) ?? a.responsable ?? "";

  const filasPropiasBase = useMemo<FilaEquipo[]>(
    () => activos.map((a) => ({
      ref: a.id, equipo_id: null, equipo_nombre: a.nombre,
      chofer: responsableDe(a), dominio: a.numero_serie ?? "", viajes: 0, metros: "", es_tercero: false,
    })),
    [activos, empMap],
  );

  useEffect(() => {
    if (!open) return;
    setArchivo(null);
    setGuardando(false);
    if (planilla) {
      setFecha(planilla.fecha);
      setClienteId(planilla.cliente_id ?? "libre");
      setClienteNombre(planilla.cliente_nombre ?? "");
      setEstablecimiento(planilla.establecimiento ?? "");
      setLote(planilla.lote ?? "");
      setEmpleadoId(planilla.bolsero_empleado_id ?? "libre");
      setNombre(planilla.bolsero_nombre ?? "");
      setZona(planilla.zona ?? "");
      setCultivo(planilla.cultivo ?? "");
      setObservaciones(planilla.observaciones ?? "");
      setImagenPath(planilla.imagen_path);
      const b = Array(CANT_BOLSAS).fill("");
      (planilla.bolsas ?? []).forEach((v, i) => { if (i < CANT_BOLSAS) b[i] = v ? String(v) : ""; });
      setBolsas(b);

      const guardadosPropios = equiposIniciales.filter((e) => !e.es_tercero);
      const base = filasPropiasBase.map((f) => {
        const g = guardadosPropios.find((e) => e.activo_id === f.ref || e.equipo_nombre.toLowerCase() === f.equipo_nombre.toLowerCase());
        return g ? { ...f, chofer: g.chofer ?? f.chofer, dominio: g.dominio ?? f.dominio, viajes: Number(g.viajes || 0), metros: g.metros_bolsa ? String(g.metros_bolsa) : "" } : f;
      });
      const sueltos = guardadosPropios
        .filter((g) => !base.some((f) => f.ref === g.activo_id || f.equipo_nombre.toLowerCase() === g.equipo_nombre.toLowerCase()))
        .map((g) => ({
          ref: "", equipo_id: null, equipo_nombre: g.equipo_nombre, chofer: g.chofer ?? "", dominio: g.dominio ?? "",
          viajes: Number(g.viajes || 0), metros: g.metros_bolsa ? String(g.metros_bolsa) : "", es_tercero: false,
        }));
      setPropios([...base, ...sueltos]);

      setTerceros(equiposIniciales.filter((e) => e.es_tercero).map((g) => ({
        ref: "", equipo_id: g.equipo_id, equipo_nombre: g.equipo_nombre, chofer: g.chofer ?? "", dominio: g.dominio ?? "",
        viajes: Number(g.viajes || 0), metros: g.metros_bolsa ? String(g.metros_bolsa) : "", es_tercero: true,
      })));
    } else {
      setFecha(new Date().toISOString().slice(0, 10));
      setClienteId("libre"); setClienteNombre("");
      setEstablecimiento(""); setLote("");
      setEmpleadoId("libre"); setNombre("");
      setZona(""); setCultivo(""); setObservaciones("");
      setImagenPath(null);
      setBolsas(Array(CANT_BOLSAS).fill(""));
      setPropios(filasPropiasBase);
      setTerceros([filaVacia(true), filaVacia(true)]);
    }
  }, [open, planilla, equiposIniciales, filasPropiasBase]);

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

  const setFila = (
    lista: FilaEquipo[], set: (v: FilaEquipo[]) => void, i: number, campo: keyof FilaEquipo, valor: string | number,
  ) => set(lista.map((f, idx) => (idx === i ? { ...f, [campo]: valor } as FilaEquipo : f)));

  const totalMetros = bolsas.reduce((a, v) => a + (Number(v) || 0), 0);
  const totalViajes = [...propios, ...terceros].reduce((a, f) => a + (Number(f.viajes) || 0), 0);

  /** Busca el tercero por nombre; si no existe lo da de alta en la base compartida (módulo Combustible). */
  const resolverTercero = async (f: FilaEquipo): Promise<string | null> => {
    const nom = f.equipo_nombre.trim();
    if (!nom) return null;
    const existente = tercerosBase.find((t) => t.nombre.trim().toLowerCase() === nom.toLowerCase());
    if (existente) return existente.id;
    const { data, error } = await (supabase as any).from("fema_equipos").insert({
      user_id: user!.id, nombre: nom, tipo: "Camión", tenencia: "Tercero",
      transportista: nom, interno: f.dominio.trim() || null, estado: "Activo",
      observaciones: "Alta automática desde Planilla Bolsero",
    }).select("id").single();
    if (error) throw error;
    toast.success(`Transportista "${nom}" agregado también al módulo Combustible`);
    return data.id as string;
  };

  /** Lee la foto de la planilla de papel y completa los campos del formulario. */
  const leerFoto = async (file: File) => {
    setLeyendo(true);
    const t = toast.loading("Leyendo la planilla...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión vencida, volvé a ingresar");
      const { base64, mimeType } = await comprimirParaOcr(file);
      if (!base64) throw new Error("No se pudo procesar la imagen");
      const res = await fetch("/api/public/ocr-planilla", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.error ?? "No se pudo leer la planilla");
      const d = (out?.data ?? {}) as any;

      if (texto(d.fecha) && /^\d{4}-\d{2}-\d{2}$/.test(texto(d.fecha))) setFecha(texto(d.fecha));
      if (texto(d.cliente)) {
        const c = clientes.find((x) => x.nombre.trim().toLowerCase() === texto(d.cliente).toLowerCase());
        if (c) { setClienteId(c.id); setClienteNombre(c.nombre); }
        else { setClienteId("libre"); setClienteNombre(texto(d.cliente)); }
      }
      if (texto(d.establecimiento)) setEstablecimiento(texto(d.establecimiento));
      if (texto(d.lote)) setLote(texto(d.lote));
      if (texto(d.zona)) setZona(texto(d.zona));
      if (texto(d.cultivo)) setCultivo(texto(d.cultivo));
      if (texto(d.bolsero)) {
        const e = empleados.find((x) => x.nombre.trim().toLowerCase() === texto(d.bolsero).toLowerCase());
        if (e) { setEmpleadoId(e.id); setNombre(e.nombre); }
        else { setEmpleadoId("libre"); setNombre(texto(d.bolsero)); }
      }
      if (texto(d.observaciones)) setObservaciones(texto(d.observaciones));

      if (Array.isArray(d.bolsas)) {
        setBolsas(Array.from({ length: CANT_BOLSAS }, (_, i) => {
          const n = numero(d.bolsas[i]);
          return n > 0 ? String(n) : "";
        }));
      }

      const leidos: any[] = Array.isArray(d.equipos) ? d.equipos : [];
      const igual = (a: string, b: string) =>
        a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
      const usados = new Set<number>();
      setPropios((lista) => lista.map((f) => {
        const idx = leidos.findIndex((e, i) =>
          !usados.has(i) && texto(e.equipo) &&
          (igual(texto(e.equipo), f.equipo_nombre) ||
            f.equipo_nombre.toLowerCase().includes(texto(e.equipo).toLowerCase()) ||
            texto(e.equipo).toLowerCase().includes(f.equipo_nombre.toLowerCase())));
        if (idx < 0) return f;
        usados.add(idx);
        const e = leidos[idx];
        return {
          ...f,
          chofer: texto(e.chofer) || f.chofer,
          dominio: texto(e.dominio) || f.dominio,
          viajes: Math.min(MAX_VIAJES, numero(e.viajes)) || f.viajes,
          metros: numero(e.metros) > 0 ? String(numero(e.metros)) : f.metros,
        };
      }));
      const restantes = leidos
        .filter((e, i) => !usados.has(i) && texto(e.equipo))
        .map((e) => ({
          ref: "", equipo_id: null, equipo_nombre: texto(e.equipo),
          chofer: texto(e.chofer), dominio: texto(e.dominio),
          viajes: Math.min(MAX_VIAJES, numero(e.viajes)), metros: numero(e.metros) > 0 ? String(numero(e.metros)) : "",
          es_tercero: true,
        }));
      if (restantes.length) setTerceros(restantes);

      toast.success("Planilla leída: revisá los datos antes de guardar", { id: t });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo leer la planilla", { id: t });
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    if (!user) return;
    if (!fecha) { toast.error("Indicá la fecha de trabajo"); return; }
    const nombreFinal = empleadoId !== "libre"
      ? (empleados.find((e) => e.id === empleadoId)?.nombre ?? nombre)
      : nombre.trim();
    if (!nombreFinal) { toast.error("Indicá el bolsero interviniente"); return; }
    const clienteFinal = clienteId !== "libre"
      ? (clientes.find((c) => c.id === clienteId)?.nombre ?? clienteNombre)
      : clienteNombre.trim();

    const filasPropias = propios.filter((f) => f.equipo_nombre.trim() && (f.viajes > 0 || Number(f.metros) > 0));
    const filasTerceros = terceros.filter((f) => f.equipo_nombre.trim());

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
        cliente_id: clienteId !== "libre" ? clienteId : null,
        cliente_nombre: clienteFinal || null,
        establecimiento: establecimiento.trim() || null,
        lote: lote.trim() || null,
        bolsero_empleado_id: empleadoId !== "libre" ? empleadoId : null,
        bolsero_nombre: nombreFinal,
        zona: zona.trim() || null,
        cultivo: cultivo.trim() || null,
        observaciones: observaciones.trim() || null,
        imagen_path: path,
        bolsas: bolsas.map((v) => Number(v) || 0),
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

      const rows: any[] = [];
      filasPropias.forEach((f, i) => rows.push({
        user_id: user.id, planilla_id: planillaId,
        activo_id: f.ref || null, equipo_id: null,
        equipo_nombre: f.equipo_nombre.trim(),
        chofer: f.chofer.trim() || null, dominio: f.dominio.trim() || null,
        es_tercero: false, viajes: Number(f.viajes) || 0, metros_bolsa: Number(f.metros) || 0, orden: i,
      }));
      for (let i = 0; i < filasTerceros.length; i++) {
        const f = filasTerceros[i];
        const equipoId = await resolverTercero(f);
        rows.push({
          user_id: user.id, planilla_id: planillaId,
          activo_id: null, equipo_id: equipoId,
          equipo_nombre: f.equipo_nombre.trim(),
          chofer: f.chofer.trim() || null, dominio: f.dominio.trim() || null,
          es_tercero: true, viajes: Number(f.viajes) || 0, metros_bolsa: Number(f.metros) || 0,
          orden: filasPropias.length + i,
        });
      }
      if (rows.length) {
        const { error } = await (supabase as any).from("fema_planilla_equipos").insert(rows);
        if (error) throw error;
      }

      toast.success(planilla ? "Planilla actualizada" : "Planilla guardada");
      qc.invalidateQueries({ queryKey: ["fema_planillas"] });
      qc.invalidateQueries({ queryKey: ["fema_planilla_equipos"] });
      qc.invalidateQueries({ queryKey: ["fema_equipos_planilla"] });
      qc.invalidateQueries({ queryKey: ["fema_equipos"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar la planilla");
    } finally {
      setGuardando(false);
    }
  };

  const campo = (etiqueta: string, control: React.ReactNode) => (
    <div className="flex flex-1 items-center gap-2">
      <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide">{etiqueta}</span>
      <div className="flex-1">{control}</div>
    </div>
  );
  const inputPlanilla = "h-8 border-0 border-b border-dotted border-foreground/40 rounded-none bg-transparent px-1 focus-visible:ring-0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-lg font-extrabold uppercase tracking-tight">FEMA Agronegocios S.A.S.</DialogTitle>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Planilla diaria de picado y embolsado
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Encabezado */}
          <div className="rounded-md border-2 p-3">
            <div className="mb-2 flex justify-end">
              {campo("Fecha trabajo", <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 w-44" />)}
            </div>
            <div className="grid gap-x-6 gap-y-2 md:grid-cols-3">
              {campo("Cliente",
                clienteId === "libre"
                  ? <div className="flex gap-1">
                      <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} className={inputPlanilla} placeholder="Nombre del cliente" />
                      <Select value={clienteId} onValueChange={setClienteId}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="libre">Escribir</SelectItem>
                          {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  : <Select value={clienteId} onValueChange={setClienteId}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="libre">Otro (escribir)</SelectItem>
                        {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>,
              )}
              {campo("Establecimiento", <Input value={establecimiento} onChange={(e) => setEstablecimiento(e.target.value)} className={inputPlanilla} />)}
              {campo("Bolsero interv.",
                empleadoId === "libre"
                  ? <div className="flex gap-1">
                      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputPlanilla} placeholder="Apellido y nombre" />
                      <Select value={empleadoId} onValueChange={setEmpleadoId}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="libre">Escribir</SelectItem>
                          {empleados.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  : <Select value={empleadoId} onValueChange={setEmpleadoId}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="libre">Otro (escribir)</SelectItem>
                        {empleados.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>,
              )}
              {campo("Lote", <Input value={lote} onChange={(e) => setLote(e.target.value)} className={inputPlanilla} />)}
              {campo("Zona / Loc.", <Input value={zona} onChange={(e) => setZona(e.target.value)} className={inputPlanilla} />)}
              {campo("Cultivo", <Input value={cultivo} onChange={(e) => setCultivo(e.target.value)} className={inputPlanilla} placeholder="Ej: Maíz" />)}
            </div>
          </div>

          {/* 1. Bolsas */}
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
              <span>1. Registro de bolsas realizadas en el día (mts. por bolsa)</span>
              <span>Total metros día: {formatNumero(totalMetros, 0)} m</span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7">
              {bolsas.map((v, i) => (
                <div key={i} className="rounded border p-2 text-center">
                  <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Bolsa {i + 1}</div>
                  <Input
                    type="number" inputMode="decimal" value={v}
                    onChange={(e) => setBolsas(bolsas.map((b, idx) => (idx === i ? e.target.value : b)))}
                    className="h-9 text-center font-semibold" placeholder="m"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 2. Viajes */}
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
              <span>2. Registro de viajes por carro / transportista</span>
              <span>Total viajes: {formatNumero(totalViajes, 0)}</span>
            </div>

            <div className="bg-muted px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
              Equipos propios de la empresa <span className="font-normal normal-case text-muted-foreground">(desde Inventario)</span>
            </div>
            <div className="divide-y">
              {propios.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">No hay maquinaria cargada en Inventario.</div>
              )}
              {propios.map((f, i) => (
                <div key={`p${i}`} className="grid items-center gap-2 p-2 lg:grid-cols-[190px_220px_1fr_90px]">
                  <div className="text-sm font-bold uppercase">{f.equipo_nombre}</div>
                  <div className="space-y-1">
                    <Input value={f.chofer} onChange={(e) => setFila(propios, setPropios, i, "chofer", e.target.value)} className="h-8" placeholder="Chofer" />
                    <Input value={f.dominio} onChange={(e) => setFila(propios, setPropios, i, "dominio", e.target.value)} className="h-7 text-xs" placeholder="Dominio" />
                  </div>
                  <ConteoViajes valor={f.viajes} onChange={(v) => setFila(propios, setPropios, i, "viajes", v)} />
                  <Input
                    type="number" inputMode="decimal" value={f.metros}
                    onChange={(e) => setFila(propios, setPropios, i, "metros", e.target.value)}
                    className="h-8" placeholder="Mts"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between bg-muted px-3 py-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide">
                Contratistas / Terceros <span className="font-normal normal-case text-muted-foreground">(se guardan también en Combustible)</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setTerceros([...terceros, filaVacia(true)])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
              </Button>
            </div>
            <div className="divide-y">
              {terceros.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sin contratistas cargados.</div>}
              {terceros.map((f, i) => (
                <div key={`t${i}`} className="grid items-center gap-2 p-2 lg:grid-cols-[190px_220px_1fr_90px_36px]">
                  <Input
                    list="terceros-planilla" value={f.equipo_nombre}
                    onChange={(e) => setFila(terceros, setTerceros, i, "equipo_nombre", e.target.value)}
                    className="h-8" placeholder={`${i + 1}. Transportista / equipo`}
                  />
                  <div className="space-y-1">
                    <Input value={f.chofer} onChange={(e) => setFila(terceros, setTerceros, i, "chofer", e.target.value)} className="h-8" placeholder="Chofer" />
                    <Input value={f.dominio} onChange={(e) => setFila(terceros, setTerceros, i, "dominio", e.target.value)} className="h-7 text-xs" placeholder="Dominio" />
                  </div>
                  <ConteoViajes valor={f.viajes} onChange={(v) => setFila(terceros, setTerceros, i, "viajes", v)} />
                  <Input
                    type="number" inputMode="decimal" value={f.metros}
                    onChange={(e) => setFila(terceros, setTerceros, i, "metros", e.target.value)}
                    className="h-8" placeholder="Mts"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setTerceros(terceros.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <datalist id="terceros-planilla">
              {tercerosBase.map((t) => <option key={t.id} value={t.nombre} />)}
            </datalist>
          </div>

          {/* Foto y observaciones */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide">Foto de la planilla en papel</div>
              <input
                ref={fileRef} type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setArchivo(f); e.target.value = ""; }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="mr-2 h-4 w-4" /> {previewUrl ? "Cambiar imagen" : "Subir foto"}
                </Button>
                {previewUrl && (
                  <Button type="button" variant="ghost" onClick={() => { setArchivo(null); setImagenPath(null); }}>Quitar</Button>
                )}
              </div>
              {previewUrl && <img src={previewUrl} alt="Planilla de trabajo" className="mt-3 max-h-60 w-full rounded-md object-contain" />}
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide">Observaciones</div>
              <Textarea rows={5} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => imprimirPlanilla({
              fecha, cliente_nombre: clienteNombre, establecimiento, lote, zona, cultivo,
              bolsero_nombre: nombre, observaciones, bolsas, total_viajes: totalViajes, total_metros: totalMetros,
              equipos: [...propios, ...terceros].filter((f) => f.equipo_nombre.trim()).map((f) => ({
                equipo_nombre: f.equipo_nombre, chofer: f.chofer, dominio: f.dominio,
                viajes: f.viajes, metros_bolsa: f.metros, es_tercero: f.es_tercero,
              })),
            })}
          >
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar planilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
