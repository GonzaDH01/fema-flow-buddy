import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatNumero, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Plus, Download, Pencil, Trash2, Fuel } from "lucide-react";

export const Route = createFileRoute("/app/combustible")({ component: Page });

type Equipo = {
  id: string; nombre: string; tipo: string; interno: string | null;
  tenencia: string; transportista: string | null; estado: string; observaciones: string | null;
};
type Activo = {
  id: string; nombre: string; tipo: string; marca: string | null; modelo: string | null;
  responsable: string | null; responsable_empleado_id: string | null; estado: string;
};
type Carga = {
  id: string; fecha: string; litros: number; producto: string; precio_litro: number;
  itc: number; co2: number; total: number; mes: number;
  equipo_id: string | null; activo_id: string | null; trabajo: string | null;
  kilometros: number | null; horas: number | null; observaciones: string | null;
};
type TanqueMov = {
  id: string; fecha: string; tipo: string; litros: number; precio_litro: number;
  proveedor: string | null; observaciones: string | null;
};
type Producto = { id: string; nombre: string; codigo: string | null; stock: number; precio_compra: number | null; unidad_medida: string };

/** Receptor unificado: máquina propia del inventario o equipo de tercero. */
type Receptor = { key: string; id: string; propio: boolean; nombre: string; detalle: string; transportista: string | null };

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [tab, setTab] = useState("cargas");
  const [openCarga, setOpenCarga] = useState(false);
  const [editCarga, setEditCarga] = useState<Carga | null>(null);
  const [openEquipo, setOpenEquipo] = useState(false);
  const [editEquipo, setEditEquipo] = useState<Equipo | null>(null);
  const [openTanque, setOpenTanque] = useState(false);
  const [filtroEquipo, setFiltroEquipo] = useState<string>("all");
  const [busqueda, setBusqueda] = useState("");

  const equiposQ = useQuery({
    queryKey: ["fema_equipos"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_equipos").select("*").order("nombre");
      if (error) throw error; return data as Equipo[];
    },
  });
  const activosQ = useQuery({
    queryKey: ["fema_activos_combustible"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fema_activos")
        .select("id,nombre,tipo,marca,modelo,responsable,responsable_empleado_id,estado")
        .order("nombre");
      if (error) throw error; return data as Activo[];
    },
  });
  const empleadosQ = useQuery({
    queryKey: ["fema_empleados_min"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_empleados").select("id,nombre").order("nombre");
      if (error) throw error; return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const productoQ = useQuery({
    queryKey: ["producto_gasoil"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_productos")
        .select("id,nombre,codigo,stock,precio_compra,unidad_medida")
        .eq("categoria", "Combustible")
        .order("codigo")
        .limit(1)
        .maybeSingle();
      if (error) throw error; return (data ?? null) as Producto | null;
    },
  });
  const cargasQ = useQuery({
    queryKey: ["fema_combustible", year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_combustible").select("*").eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as unknown as Carga[];
    },
  });
  const tanqueQ = useQuery({
    queryKey: ["fema_tanque", year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_tanque_mov").select("*").eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as TanqueMov[];
    },
  });

  const equipos = equiposQ.data ?? [];
  const activos = activosQ.data ?? [];
  const empleados = empleadosQ.data ?? [];
  const cargas = cargasQ.data ?? [];
  const tanqueMovs = tanqueQ.data ?? [];
  const gasoil = productoQ.data ?? null;

  const empMap = useMemo(() => new Map(empleados.map((e) => [e.id, e.nombre])), [empleados]);

  const receptores = useMemo<Receptor[]>(() => {
    const propios = activos.map((a) => ({
      key: `a:${a.id}`, id: a.id, propio: true, nombre: a.nombre,
      detalle: [a.tipo, a.marca, a.modelo].filter(Boolean).join(" · "),
      transportista: null as string | null,
    }));
    const terceros = equipos.map((e) => ({
      key: `t:${e.id}`, id: e.id, propio: false, nombre: e.nombre,
      detalle: [e.tipo, e.interno].filter(Boolean).join(" · "),
      transportista: e.transportista,
    }));
    return [...propios, ...terceros];
  }, [activos, equipos]);

  const receptorDeCarga = (c: Carga): Receptor | null =>
    receptores.find((r) => (c.activo_id ? r.propio && r.id === c.activo_id : !r.propio && r.id === c.equipo_id)) ?? null;

  const responsableDe = (a: Activo) =>
    (a.responsable_empleado_id ? empMap.get(a.responsable_empleado_id) : null) ?? a.responsable ?? "—";

  // KPIs — stock real del producto Gasoil del catálogo
  const stockTanque = Number(gasoil?.stock ?? 0);
  const precioRef = Number(gasoil?.precio_compra ?? 0);
  const tanqueIn = tanqueMovs.filter((t) => t.tipo === "IN").reduce((a, x) => a + Number(x.litros), 0);
  const tanqueOut = tanqueMovs.filter((t) => t.tipo === "OUT").reduce((a, x) => a + Number(x.litros), 0);
  const totalLitros = cargas.reduce((a, x) => a + Number(x.litros), 0);
  const totalCosto = cargas.reduce((a, x) => a + Number(x.total), 0);
  const promedioLitro = totalLitros > 0 ? totalCosto / totalLitros : 0;
  const cargasTerceros = cargas.filter((c) => !c.activo_id && c.equipo_id);
  const litrosCedidos = cargasTerceros.reduce((a, x) => a + Number(x.litros), 0);
  const importeDescontar = cargasTerceros.reduce((a, x) => a + Number(x.total), 0);

  const cargasFiltradas = cargas.filter((c) => {
    if (filtroEquipo !== "all") {
      const r = receptorDeCarga(c);
      if (!r || r.key !== filtroEquipo) return false;
    }
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const r = receptorDeCarga(c);
      if (!`${c.trabajo ?? ""} ${r?.nombre ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Reportes
  const consumoPorEquipo = useMemo(() => {
    const map = new Map<string, { nombre: string; propio: boolean; transportista: string | null; cargas: number; litros: number; total: number; km: number; hs: number }>();
    cargas.forEach((c) => {
      const r = receptorDeCarga(c);
      const key = r?.key ?? "_";
      const cur = map.get(key) ?? { nombre: r?.nombre ?? "Sin equipo", propio: r?.propio ?? true, transportista: r?.transportista ?? null, cargas: 0, litros: 0, total: 0, km: 0, hs: 0 };
      cur.cargas++; cur.litros += Number(c.litros); cur.total += Number(c.total);
      cur.km += Number(c.kilometros ?? 0); cur.hs += Number(c.horas ?? 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.litros - a.litros);
  }, [cargas, receptores]);

  const consumoPorTrabajo = useMemo(() => {
    const map = new Map<string, { trabajo: string; cargas: number; litros: number; total: number }>();
    cargas.forEach((c) => {
      const key = c.trabajo || "Sin asignar";
      const cur = map.get(key) ?? { trabajo: key, cargas: 0, litros: 0, total: 0 };
      cur.cargas++; cur.litros += Number(c.litros); cur.total += Number(c.total);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [cargas]);

  const cedidoPorTransportista = useMemo(() => {
    const map = new Map<string, { transportista: string; equipos: string[]; cargas: number; litros: number; total: number }>();
    cargasTerceros.forEach((c) => {
      const eq = equipos.find((e) => e.id === c.equipo_id);
      const key = eq?.transportista || eq?.nombre || "Sin transportista";
      const cur = map.get(key) ?? { transportista: key, equipos: [], cargas: 0, litros: 0, total: 0 };
      if (eq && !cur.equipos.includes(eq.nombre)) cur.equipos.push(eq.nombre);
      cur.cargas++; cur.litros += Number(c.litros); cur.total += Number(c.total);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.litros - a.litros);
  }, [cargasTerceros, equipos]);

  const deleteCarga = async (c: Carga) => {
    const { error } = await supabase.from("fema_combustible").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Carga eliminada");
    qc.invalidateQueries({ queryKey: ["fema_combustible"] });
  };
  const deleteEquipo = async (id: string) => {
    const { error } = await (supabase as any).from("fema_equipos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_equipos"] });
  };
  const deleteTanque = async (id: string) => {
    const { error } = await (supabase as any).from("fema_tanque_mov").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_tanque"] });
  };

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const cargasRows = cargas.map((c) => {
      const r = receptorDeCarga(c);
      return {
        Fecha: c.fecha, Equipo: r?.nombre ?? "", Tenencia: r?.propio ? "Propio" : "Tercero",
        Transportista: r?.transportista ?? "", Trabajo: c.trabajo ?? "",
        Litros: c.litros, "Precio/L": c.precio_litro, Total: c.total,
        Kilometros: c.kilometros ?? "", Horas: c.horas ?? "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargasRows), "Cargas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(consumoPorEquipo), "Consumo por equipo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tanqueMovs), "Tanque");
    XLSX.writeFile(wb, `Combustible_${year}.xlsx`);
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 pt-6">
        <h1 className="text-2xl font-semibold">Combustible</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel}><Download className="h-4 w-4 mr-1" />Exportar Excel</Button>
          <Button onClick={() => { setEditCarga(null); setOpenCarga(true); }}><Fuel className="h-4 w-4 mr-1" />Nueva carga</Button>
        </div>
      </div>

      <div className="px-6 pt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="cargas">Distribución de gasoil</TabsTrigger>
            <TabsTrigger value="tanque">Tanque y compras</TabsTrigger>
            <TabsTrigger value="equipos">Equipos y maquinarias</TabsTrigger>
            <TabsTrigger value="reporte">Reporte de consumo</TabsTrigger>
          </TabsList>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Stock tanque (Gasoil)" value={`${formatNumero(stockTanque)} lt`} sub={precioRef ? `${formatPesos(precioRef)} /lt de referencia` : gasoil ? "Sin precio de referencia" : "Sin producto Gasoil"} color="text-blue-400" />
            <Kpi label={`Cargas en ${year}`} value={String(cargas.length)} sub={`${formatNumero(totalLitros)} lt despachados`} color="text-amber-400" />
            <Kpi label="Costo de lo despachado" value={formatPesos(totalCosto)} sub={`${formatPesos(promedioLitro)} /lt promedio`} color="text-emerald-400" />
            <Kpi label="Cedido a terceros" value={`${formatNumero(litrosCedidos)} lt`} sub={`${formatPesos(importeDescontar)} a descontar`} color="text-rose-400" />
          </div>

          <TabsContent value="cargas" className="mt-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="font-medium">Cargas despachadas del tanque</div>
                <div className="flex gap-2">
                  <Select value={filtroEquipo} onValueChange={setFiltroEquipo}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Todos los equipos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los equipos</SelectItem>
                      {receptores.map((r) => <SelectItem key={r.key} value={r.key}>{r.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Buscar trabajo / equipo..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-56" />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead><TableHead>Equipo / máquina</TableHead><TableHead>Trabajo / lote</TableHead>
                    <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">$/L</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead>Km / Hs</TableHead><TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargasFiltradas.map((c) => {
                    const r = receptorDeCarga(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{formatFecha(c.fecha)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{r?.nombre ?? "—"}</span>
                            {r && !r.propio && <Badge variant="outline" className="text-amber-500 border-amber-500/40">Tercero</Badge>}
                          </div>
                          {r?.transportista && <div className="text-xs text-muted-foreground">{r.transportista}</div>}
                        </TableCell>
                        <TableCell>{c.trabajo ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatNumero(c.litros)} lt</TableCell>
                        <TableCell className="text-right">{formatPesos(c.precio_litro)}</TableCell>
                        <TableCell className={`text-right font-medium ${r && !r.propio ? "text-rose-400" : "text-emerald-400"}`}>{formatPesos(c.total)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.kilometros ? `${formatNumero(c.kilometros)} km` : c.horas ? `${formatNumero(c.horas)} hs` : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditCarga(c); setOpenCarga(true); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteCarga(c)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {cargasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin cargas registradas</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="tanque" className="mt-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div>
                  <div className="font-medium">Movimientos del tanque propio</div>
                  <div className="text-xs text-muted-foreground">
                    Ingresos {formatNumero(tanqueIn)} lt · Salidas {formatNumero(tanqueOut)} lt · Stock actual {formatNumero(stockTanque)} lt
                  </div>
                </div>
                <Button size="sm" onClick={() => setOpenTanque(true)}><Plus className="h-3 w-3 mr-1" />Nuevo movimiento</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Proveedor / detalle</TableHead>
                  <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">$/L</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead className="w-16" />
                </TableRow></TableHeader>
                <TableBody>
                  {tanqueMovs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatFecha(t.fecha)}</TableCell>
                      <TableCell>
                        <Badge variant={t.tipo === "IN" ? "default" : "outline"} className={t.tipo === "IN" ? "bg-emerald-500/20 text-emerald-400" : "text-rose-400 border-rose-500/40"}>
                          {t.tipo === "IN" ? "Ingreso al tanque" : "Salida"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.proveedor ?? "—"}
                        {t.observaciones && <div className="text-xs text-muted-foreground">{t.observaciones}</div>}
                      </TableCell>
                      <TableCell className="text-right">{formatNumero(t.litros)} lt</TableCell>
                      <TableCell className="text-right">{formatPesos(t.precio_litro)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPesos(Number(t.litros) * Number(t.precio_litro))}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => deleteTanque(t.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {tanqueMovs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin movimientos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="equipos" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b p-3">
                <div className="font-medium">Maquinarias y rodados propios</div>
                <div className="text-xs text-muted-foreground">Se toman del módulo Inventario</div>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nombre</TableHead><TableHead>Tipo</TableHead><TableHead>Marca / modelo</TableHead>
                  <TableHead>Responsable</TableHead><TableHead>Estado</TableHead>
                  <TableHead className="text-right">Litros {year}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {activos.map((a) => {
                    const lt = cargas.filter((c) => c.activo_id === a.id).reduce((s, c) => s + Number(c.litros), 0);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.nombre}</TableCell>
                        <TableCell>{a.tipo}</TableCell>
                        <TableCell className="text-muted-foreground">{[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell>{responsableDe(a)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-emerald-400 border-emerald-500/40">● {a.estado}</Badge></TableCell>
                        <TableCell className="text-right">{formatNumero(lt)} lt</TableCell>
                      </TableRow>
                    );
                  })}
                  {activos.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargá la maquinaria en Inventario</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div>
                  <div className="font-medium">Equipos de terceros y transportistas</div>
                  <div className="text-xs text-muted-foreground">Camiones o máquinas contratadas que cargan del tanque</div>
                </div>
                <Button size="sm" onClick={() => { setEditEquipo(null); setOpenEquipo(true); }}><Plus className="h-3 w-3 mr-1" />Nuevo equipo de tercero</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nombre</TableHead><TableHead>Transportista</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Interno / patente</TableHead><TableHead className="text-right">Litros {year}</TableHead><TableHead className="w-24" />
                </TableRow></TableHeader>
                <TableBody>
                  {equipos.map((e) => {
                    const lt = cargas.filter((c) => c.equipo_id === e.id && !c.activo_id).reduce((s, c) => s + Number(c.litros), 0);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.nombre}</TableCell>
                        <TableCell className="text-muted-foreground">{e.transportista ?? "—"}</TableCell>
                        <TableCell>{e.tipo}</TableCell>
                        <TableCell>{e.interno ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatNumero(lt)} lt</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditEquipo(e); setOpenEquipo(true); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteEquipo(e.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {equipos.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin equipos de terceros</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="reporte" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b p-3 font-medium">Consumo por equipo / máquina</div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Equipo</TableHead><TableHead>Tenencia</TableHead>
                  <TableHead className="text-right">Cargas</TableHead><TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Rendimiento</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {consumoPorEquipo.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.nombre}{r.transportista && <div className="text-xs text-muted-foreground">{r.transportista}</div>}</TableCell>
                      <TableCell><Badge variant="outline" className={r.propio ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40"}>{r.propio ? "Propio" : "Tercero"}</Badge></TableCell>
                      <TableCell className="text-right">{r.cargas}</TableCell>
                      <TableCell className="text-right">{formatNumero(r.litros)} lt</TableCell>
                      <TableCell className="text-right font-medium">{formatPesos(r.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.hs > 0 ? `${formatNumero(r.litros / r.hs)} lt/hora` : r.km > 0 ? `${formatNumero((r.litros / r.km) * 100)} lt/100 km` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {consumoPorEquipo.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b p-3 font-medium">Consumo por trabajo / cliente</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Trabajo</TableHead><TableHead className="text-right">Cargas</TableHead>
                    <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">Costo</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {consumoPorTrabajo.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.trabajo}</TableCell>
                        <TableCell className="text-right">{r.cargas}</TableCell>
                        <TableCell className="text-right">{formatNumero(r.litros)} lt</TableCell>
                        <TableCell className="text-right font-medium">{formatPesos(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    {consumoPorTrabajo.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b p-3">
                  <div className="font-medium">Combustible cedido a terceros</div>
                  <div className="text-xs text-muted-foreground">Total a descontar del pago al transportista</div>
                </div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Transportista</TableHead><TableHead>Equipos</TableHead>
                    <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">A descontar</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {cedidoPorTransportista.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.transportista}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.equipos.join(", ")}</TableCell>
                        <TableCell className="text-right">{formatNumero(r.litros)} lt</TableCell>
                        <TableCell className="text-right font-medium text-rose-400">{formatPesos(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    {cedidoPorTransportista.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin cargas a terceros</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CargaDialog
        open={openCarga} setOpen={setOpenCarga} initial={editCarga} userId={user?.id ?? ""}
        receptores={receptores} activos={activos} responsableDe={responsableDe}
        gasoil={gasoil} stockTanque={stockTanque} precioRef={precioRef} qc={qc}
      />
      <EquipoDialog open={openEquipo} setOpen={setOpenEquipo} initial={editEquipo} userId={user?.id ?? ""} qc={qc} />
      <TanqueDialog open={openTanque} setOpen={setOpenTanque} userId={user?.id ?? ""} gasoil={gasoil} qc={qc} />
    </>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${color ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Actualiza stock del producto Gasoil y deja el movimiento correspondiente. */
async function moverStockGasoil(opts: {
  userId: string; gasoil: Producto; litros: number; fecha: string;
  tipo: "entrada" | "salida"; motivo: string; costo: number | null;
}) {
  const delta = opts.tipo === "salida" ? -opts.litros : opts.litros;
  const nuevo = Number(opts.gasoil.stock ?? 0) + delta;
  await supabase.from("fema_stock_mov").insert({
    user_id: opts.userId, producto_id: opts.gasoil.id, fecha: opts.fecha,
    tipo: opts.tipo, cantidad: opts.litros, costo_unitario: opts.costo,
    motivo: opts.motivo, stock_resultante: nuevo,
  });
  await supabase.from("fema_productos").update({ stock: nuevo }).eq("id", opts.gasoil.id);
}

function CargaDialog({ open, setOpen, initial, userId, receptores, activos, responsableDe, gasoil, stockTanque, precioRef, qc }: {
  open: boolean; setOpen: (v: boolean) => void; initial: Carga | null; userId: string;
  receptores: Receptor[]; activos: Activo[]; responsableDe: (a: Activo) => string;
  gasoil: Producto | null; stockTanque: number; precioRef: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [receptorKey, setReceptorKey] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [litros, setLitros] = useState("");
  const [precio, setPrecio] = useState("");
  const [kilometros, setKilometros] = useState("");
  const [horas, setHoras] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFecha(initial?.fecha ?? new Date().toISOString().slice(0, 10));
    setReceptorKey(initial ? (initial.activo_id ? `a:${initial.activo_id}` : initial.equipo_id ? `t:${initial.equipo_id}` : "") : "");
    setTrabajo(initial?.trabajo ?? "");
    setLitros(initial ? String(initial.litros) : "");
    setPrecio(initial ? String(initial.precio_litro) : precioRef ? String(precioRef) : "");
    setKilometros(initial?.kilometros ? String(initial.kilometros) : "");
    setHoras(initial?.horas ? String(initial.horas) : "");
    setObservaciones(initial?.observaciones ?? "");
  }, [open, initial, precioRef]);

  const propios = receptores.filter((r) => r.propio);
  const terceros = receptores.filter((r) => !r.propio);
  const receptor = receptores.find((r) => r.key === receptorKey) ?? null;
  const activoSel = receptor?.propio ? activos.find((a) => a.id === receptor.id) ?? null : null;
  const total = (Number(litros) || 0) * (Number(precio) || 0);

  const submit = async () => {
    if (!litros || Number(litros) <= 0) { toast.error("Indicá los litros despachados"); return; }
    if (!receptor) { toast.error("Elegí el equipo que recibe el combustible"); return; }
    setGuardando(true);
    const payload: any = {
      user_id: userId, fecha, litros: Number(litros), producto: "Gasoil",
      precio_litro: Number(precio) || 0, itc: 0, co2: 0, total,
      activo_id: receptor.propio ? receptor.id : null,
      equipo_id: receptor.propio ? null : receptor.id,
      trabajo: trabajo || null,
      kilometros: kilometros ? Number(kilometros) : null,
      horas: horas ? Number(horas) : null,
      observaciones: observaciones || null,
    };
    const { error } = initial
      ? await supabase.from("fema_combustible").update(payload).eq("id", initial.id)
      : await supabase.from("fema_combustible").insert(payload);
    if (error) { setGuardando(false); toast.error(error.message); return; }

    if (!initial && gasoil) {
      await moverStockGasoil({
        userId, gasoil, litros: Number(litros), fecha, tipo: "salida",
        motivo: `Carga ${receptor.nombre}`, costo: Number(precio) || null,
      });
      await (supabase as any).from("fema_tanque_mov").insert({
        user_id: userId, fecha, tipo: "OUT", litros: Number(litros),
        precio_litro: Number(precio) || 0, proveedor: null,
        observaciones: `Carga ${receptor.nombre}${trabajo ? ` — ${trabajo}` : ""}`,
      });
    }

    toast.success(initial ? "Carga actualizada" : "Carga registrada y descontada del tanque");
    qc.invalidateQueries({ queryKey: ["fema_combustible"] });
    qc.invalidateQueries({ queryKey: ["fema_tanque"] });
    qc.invalidateQueries({ queryKey: ["producto_gasoil"] });
    setGuardando(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{initial ? "Editar carga" : "Nueva carga de combustible"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm flex justify-between">
            <span>Stock en el tanque</span>
            <span className="font-semibold">{formatNumero(stockTanque)} lt</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha" required><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></FormField>
            <FormField label="Equipo que recibe" required>
              <Select value={receptorKey} onValueChange={setReceptorKey}>
                <SelectTrigger><SelectValue placeholder="— Elegir equipo —" /></SelectTrigger>
                <SelectContent>
                  {propios.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Maquinarias y rodados propios</SelectLabel>
                      {propios.map((r) => <SelectItem key={r.key} value={r.key}>{r.nombre}</SelectItem>)}
                    </SelectGroup>
                  )}
                  {terceros.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Terceros / transportistas</SelectLabel>
                      {terceros.map((r) => <SelectItem key={r.key} value={r.key}>{r.nombre}</SelectItem>)}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          {activoSel && (
            <div className="text-xs text-muted-foreground">Responsable habitual: <span className="text-foreground">{responsableDe(activoSel)}</span></div>
          )}
          {receptor && !receptor.propio && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              Combustible cedido a {receptor.transportista || receptor.nombre}: queda para descontar de su pago.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Litros despachados" required><Input type="number" step="1" className="min-w-[110px]" value={litros} onChange={(e) => setLitros(e.target.value)} /></FormField>
            <FormField label="Precio por litro ($)"><Input type="number" step="0.01" className="min-w-[110px]" value={precio} onChange={(e) => setPrecio(e.target.value)} /></FormField>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex justify-between text-sm">
            <span>Costo de la carga</span><span className="font-semibold">{formatPesos(total)}</span>
          </div>
          <FormField label="Trabajo / lote / cliente"><Input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} placeholder="Ej: Embolsado La Esperanza — Lote 4" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Horómetro (hs)"><Input type="number" step="0.1" className="min-w-[110px]" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="opcional" /></FormField>
            <FormField label="Odómetro (km)"><Input type="number" step="1" className="min-w-[110px]" value={kilometros} onChange={(e) => setKilometros(e.target.value)} placeholder="opcional" /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={guardando}>{guardando ? "Guardando..." : "Guardar carga"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipoDialog({ open, setOpen, initial, userId, qc }: {
  open: boolean; setOpen: (v: boolean) => void; initial: Equipo | null;
  userId: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Camión");
  const [interno, setInterno] = useState("");
  const [transportista, setTransportista] = useState("");
  const [estado, setEstado] = useState("Activo");
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    if (!open) return;
    setNombre(initial?.nombre ?? ""); setTipo(initial?.tipo ?? "Camión");
    setInterno(initial?.interno ?? ""); setTransportista(initial?.transportista ?? "");
    setEstado(initial?.estado ?? "Activo"); setObservaciones(initial?.observaciones ?? "");
  }, [open, initial]);

  const submit = async () => {
    if (!nombre.trim()) { toast.error("Poné el nombre del equipo"); return; }
    const payload: any = {
      user_id: userId, nombre, tipo, interno: interno || null,
      tenencia: "Transportista", transportista: transportista || null,
      estado, observaciones: observaciones || null,
    };
    const { error } = initial
      ? await (supabase as any).from("fema_equipos").update(payload).eq("id", initial.id)
      : await (supabase as any).from("fema_equipos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Actualizado" : "Equipo de tercero creado");
    qc.invalidateQueries({ queryKey: ["fema_equipos"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} equipo de tercero</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Nombre del equipo" required><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Scania R450" /></FormField>
          <FormField label="Transportista / contratista"><Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="Razón social" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tipo">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Camión", "Tractor", "Cosechadora", "Pulverizadora", "Sembradora", "Otro"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Interno / patente"><Input value={interno} onChange={(e) => setInterno(e.target.value)} /></FormField>
          </div>
          <FormField label="Estado">
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Observaciones"><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TanqueDialog({ open, setOpen, userId, gasoil, qc }: {
  open: boolean; setOpen: (v: boolean) => void; userId: string;
  gasoil: Producto | null; qc: ReturnType<typeof useQueryClient>;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("IN");
  const [litros, setLitros] = useState("");
  const [precio, setPrecio] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const submit = async () => {
    if (!litros || Number(litros) <= 0) { toast.error("Indicá los litros"); return; }
    const payload: any = {
      user_id: userId, fecha, tipo, litros: Number(litros),
      precio_litro: Number(precio) || 0, proveedor: proveedor || null, observaciones: observaciones || null,
    };
    const { error } = await (supabase as any).from("fema_tanque_mov").insert(payload);
    if (error) { toast.error(error.message); return; }
    if (gasoil) {
      await moverStockGasoil({
        userId, gasoil, litros: Number(litros), fecha,
        tipo: tipo === "IN" ? "entrada" : "salida",
        motivo: `Tanque ${tipo === "IN" ? "ingreso" : "salida"} ${fecha}${proveedor ? ` — ${proveedor}` : ""}`,
        costo: Number(precio) || null,
      });
    }
    toast.success("Movimiento registrado");
    qc.invalidateQueries({ queryKey: ["fema_tanque"] });
    qc.invalidateQueries({ queryKey: ["producto_gasoil"] });
    setOpen(false);
    setLitros(""); setPrecio(""); setProveedor(""); setObservaciones("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Movimiento de tanque propio</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha" required><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></FormField>
            <FormField label="Tipo">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Ingreso al tanque (compra)</SelectItem>
                  <SelectItem value="OUT">Salida / ajuste</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Litros" required><Input type="number" step="1" className="min-w-[110px]" value={litros} onChange={(e) => setLitros(e.target.value)} /></FormField>
            <FormField label="Precio por litro"><Input type="number" step="0.01" className="min-w-[110px]" value={precio} onChange={(e) => setPrecio(e.target.value)} /></FormField>
          </div>
          <FormField label="Proveedor"><Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="YPF, Shell, etc." /></FormField>
          <FormField label="Observaciones"><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
