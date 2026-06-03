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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Pencil, Trash2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/combustible")({ component: Page });

type Equipo = {
  id: string; nombre: string; tipo: string; interno: string | null;
  tenencia: string; transportista: string | null; estado: string; observaciones: string | null;
};
type Carga = {
  id: string; fecha: string; litros: number; producto: string; precio_litro: number;
  itc: number; co2: number; total: number; mes: number;
  equipo_id: string | null; trabajo: string | null; kilometros: number | null; horas: number | null; observaciones: string | null;
};
type TanqueMov = {
  id: string; fecha: string; tipo: string; litros: number; precio_litro: number;
  proveedor: string | null; observaciones: string | null;
};
type Viaje = {
  id: string; fecha: string; transportista: string; equipo_id: string | null;
  ubicacion: string | null; origen: string | null; destino: string | null;
  cantidad_viajes: number; precio_viaje: number; total: number;
  trabajo: string | null; observaciones: string | null;
};

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
  const [openViaje, setOpenViaje] = useState(false);
  const [editViaje, setEditViaje] = useState<Viaje | null>(null);
  const [filtroEquipo, setFiltroEquipo] = useState<string>("all");
  const [busqueda, setBusqueda] = useState("");

  const equiposQ = useQuery({
    queryKey: ["fema_equipos", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_equipos").select("*").eq("user_id", user!.id).order("nombre");
      if (error) throw error; return data as Equipo[];
    },
  });
  const cargasQ = useQuery({
    queryKey: ["fema_combustible", user?.id, year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_combustible").select("*").eq("user_id", user!.id).eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as unknown as Carga[];
    },
  });
  const tanqueQ = useQuery({
    queryKey: ["fema_tanque", user?.id, year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_tanque_mov").select("*").eq("user_id", user!.id).eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as TanqueMov[];
    },
  });
  const viajesQ = useQuery({
    queryKey: ["fema_viajes", user?.id, year], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_viajes_transp").select("*").eq("user_id", user!.id).eq("anio", year).order("fecha", { ascending: false });
      if (error) throw error; return data as Viaje[];
    },
  });

  const equipos = equiposQ.data ?? [];
  const cargas = cargasQ.data ?? [];
  const tanqueMovs = tanqueQ.data ?? [];
  const viajes = viajesQ.data ?? [];
  const equiposMap = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  // KPIs
  const tanqueIn = tanqueMovs.filter((t) => t.tipo === "IN").reduce((a, x) => a + Number(x.litros), 0);
  const tanqueOut = tanqueMovs.filter((t) => t.tipo === "OUT").reduce((a, x) => a + Number(x.litros), 0);
  const stockTanque = tanqueIn - tanqueOut;
  const cargasCount = cargas.length;
  const totalLitros = cargas.reduce((a, x) => a + Number(x.litros), 0);
  const totalCosto = cargas.reduce((a, x) => a + Number(x.total), 0);
  const promedioLitro = totalLitros > 0 ? totalCosto / totalLitros : 0;
  const cargasTransp = cargas.filter((c) => {
    const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
    return eq?.tenencia === "Transportista";
  });
  const litrosCedidos = cargasTransp.reduce((a, x) => a + Number(x.litros), 0);
  const importeDescontar = cargasTransp.reduce((a, x) => a + Number(x.total), 0);

  // Filtros tabla cargas
  const cargasFiltradas = cargas.filter((c) => {
    if (filtroEquipo !== "all" && c.equipo_id !== filtroEquipo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
      const txt = `${c.trabajo ?? ""} ${eq?.nombre ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  // Reportes
  const consumoPorEquipo = useMemo(() => {
    const map = new Map<string, { equipo: Equipo | null; cargas: number; litros: number; total: number }>();
    cargas.forEach((c) => {
      const key = c.equipo_id ?? "_";
      const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
      const cur = map.get(key) ?? { equipo: eq ?? null, cargas: 0, litros: 0, total: 0 };
      cur.cargas++; cur.litros += Number(c.litros); cur.total += Number(c.total);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [cargas, equiposMap]);

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
    cargasTransp.forEach((c) => {
      const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
      const key = eq?.transportista || "Sin transportista";
      const cur = map.get(key) ?? { transportista: key, equipos: [], cargas: 0, litros: 0, total: 0 };
      if (eq && !cur.equipos.includes(eq.nombre)) cur.equipos.push(eq.nombre);
      cur.cargas++; cur.litros += Number(c.litros); cur.total += Number(c.total);
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [cargasTransp, equiposMap]);

  const deleteCarga = async (id: string) => {
    const { error } = await supabase.from("fema_combustible").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
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
  const deleteViaje = async (id: string) => {
    const { error } = await (supabase as any).from("fema_viajes_transp").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_viajes"] });
  };

  // Resumen viajes por transportista
  const viajesPorTransp = useMemo(() => {
    const map = new Map<string, { transportista: string; cantidad: number; total: number; ubicaciones: Set<string> }>();
    viajes.forEach((v) => {
      const cur = map.get(v.transportista) ?? { transportista: v.transportista, cantidad: 0, total: 0, ubicaciones: new Set<string>() };
      cur.cantidad += Number(v.cantidad_viajes);
      cur.total += Number(v.total);
      if (v.ubicacion) cur.ubicaciones.add(v.ubicacion);
      if (v.destino) cur.ubicaciones.add(v.destino);
      map.set(v.transportista, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad);
  }, [viajes]);
  const totalViajes = viajes.reduce((a, x) => a + Number(x.cantidad_viajes), 0);
  const totalImporteViajes = viajes.reduce((a, x) => a + Number(x.total), 0);

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const cargasRows = cargas.map((c) => {
      const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
      return {
        Fecha: c.fecha, Equipo: eq?.nombre ?? "", Interno: eq?.interno ?? "",
        Tenencia: eq?.tenencia ?? "", Transportista: eq?.transportista ?? "",
        Trabajo: c.trabajo ?? "", Litros: c.litros, "Precio/L": c.precio_litro,
        Total: c.total, Kilometros: c.kilometros ?? "", Horas: c.horas ?? "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargasRows), "Cargas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(equipos), "Equipos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tanqueMovs), "Tanque");
    XLSX.writeFile(wb, `Combustible_${year}.xlsx`);
  };

  const cargarEjemplos = async () => {
    if (!user) return;
    // Crear algunos equipos de ejemplo si no existen
    if (equipos.length === 0) {
      const ejs = [
        { nombre: "John Deere 6155J", tipo: "Tractor", interno: "T-01", tenencia: "Propio", observaciones: "Tractor principal" },
        { nombre: "New Holland TD5.110", tipo: "Tractor", interno: "T-02", tenencia: "Propio" },
        { nombre: "Cosechadora Case 2399", tipo: "Cosechadora", interno: "C-01", tenencia: "Propio" },
        { nombre: "Camión Iveco Tector", tipo: "Camión", interno: "CA-01", tenencia: "Propio" },
        { nombre: "Scania R450 (Transp. González)", tipo: "Camión", interno: "TR-01", tenencia: "Transportista", transportista: "Transportes González SRL" },
        { nombre: "Volvo FH (Transp. Pereyra)", tipo: "Camión", interno: "TR-02", tenencia: "Transportista", transportista: "Pereyra Hnos." },
      ];
      await (supabase as any).from("fema_equipos").insert(ejs.map((e) => ({ ...e, user_id: user.id })));
      toast.success("Equipos de ejemplo cargados");
      qc.invalidateQueries({ queryKey: ["fema_equipos"] });
    } else {
      toast.info("Ya hay equipos cargados");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 pt-6">
        <h1 className="text-2xl font-semibold">Combustible</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel}><Download className="h-4 w-4 mr-1" />Exportar Excel</Button>
          <Button onClick={() => { setEditCarga(null); setOpenCarga(true); }}><Plus className="h-4 w-4 mr-1" />Nueva carga</Button>
        </div>
      </div>

      <div className="px-6 pt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList>
              <TabsTrigger value="cargas">Cargas de gasoil</TabsTrigger>
              <TabsTrigger value="tanque">Tanque propio</TabsTrigger>
              <TabsTrigger value="equipos">Equipos / Máquinas</TabsTrigger>
              <TabsTrigger value="viajes">Viajes transportistas</TabsTrigger>
              <TabsTrigger value="reporte">Reporte de consumo</TabsTrigger>
            </TabsList>
            <Button size="sm" variant="ghost" onClick={cargarEjemplos}><Sparkles className="h-3 w-3 mr-1 text-amber-500" />Cargar ejemplos</Button>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Stock tanque propio" value={`${formatNumero(stockTanque)} lt`} sub={`${formatNumero(tanqueIn)} in · ${formatNumero(tanqueOut)} out`} color="text-blue-400" />
            <Kpi label={`Cargas en ${year}`} value={String(cargasCount)} sub={`${formatNumero(totalLitros)} lt totales`} color="text-amber-400" />
            <Kpi label="Costo total cargas" value={formatPesos(totalCosto)} sub={`${formatPesos(promedioLitro)} /lt prom.`} color="text-emerald-400" />
            <Kpi label="Cedido a transportistas" value={`${formatNumero(litrosCedidos)} lt`} sub={`${formatPesos(importeDescontar)} a descontar`} color="text-rose-400" />
          </div>

          <TabsContent value="cargas" className="mt-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="font-medium">Cargas de gasoil</div>
                <div className="flex gap-2">
                  <Select value={filtroEquipo} onValueChange={setFiltroEquipo}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Todos los equipos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los equipos</SelectItem>
                      {equipos.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Buscar trabajo / cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-56" />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead><TableHead>Equipo</TableHead><TableHead>Trabajo / Cliente</TableHead>
                    <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">$/L</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead>Km / Hs</TableHead><TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargasFiltradas.map((c) => {
                    const eq = c.equipo_id ? equiposMap.get(c.equipo_id) : null;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{formatFecha(c.fecha)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{eq?.nombre ?? "—"}</span>
                            {eq?.tenencia === "Transportista" && <Badge variant="outline" className="text-amber-500 border-amber-500/40">Transp.</Badge>}
                          </div>
                          {eq?.transportista && <div className="text-xs text-muted-foreground">{eq.transportista}</div>}
                        </TableCell>
                        <TableCell>{c.trabajo ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatNumero(c.litros)} lt</TableCell>
                        <TableCell className="text-right">{formatPesos(c.precio_litro)}</TableCell>
                        <TableCell className={`text-right font-medium ${eq?.tenencia === "Transportista" ? "text-rose-400" : "text-emerald-400"}`}>{formatPesos(c.total)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.kilometros ? `${formatNumero(c.kilometros)} km` : c.horas ? `${formatNumero(c.horas)} hs` : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditCarga(c); setOpenCarga(true); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteCarga(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {cargasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin cargas</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="tanque" className="mt-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div className="font-medium">Movimientos de tanque propio</div>
                <Button size="sm" onClick={() => setOpenTanque(true)}><Plus className="h-3 w-3 mr-1" />Nuevo movimiento</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Litros</TableHead><TableHead className="text-right">$/L</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead className="w-16" />
                </TableRow></TableHeader>
                <TableBody>
                  {tanqueMovs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatFecha(t.fecha)}</TableCell>
                      <TableCell>
                        <Badge variant={t.tipo === "IN" ? "default" : "outline"} className={t.tipo === "IN" ? "bg-emerald-500/20 text-emerald-400" : "text-rose-400 border-rose-500/40"}>
                          {t.tipo === "IN" ? "Carga al tanque" : "Salida"}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.proveedor ?? "—"}</TableCell>
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

          <TabsContent value="equipos" className="mt-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div className="font-medium">Equipos / Máquinas</div>
                <Button size="sm" onClick={() => { setEditEquipo(null); setOpenEquipo(true); }}><Plus className="h-3 w-3 mr-1" />Nuevo equipo</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nombre</TableHead><TableHead>Tenencia</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Interno / Patente</TableHead><TableHead>Estado</TableHead><TableHead>Observaciones</TableHead><TableHead className="w-24" />
                </TableRow></TableHeader>
                <TableBody>
                  {equipos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={e.tenencia === "Propio" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}>{e.tenencia}</Badge>
                        {e.transportista && <div className="text-xs text-muted-foreground mt-1">{e.transportista}</div>}
                      </TableCell>
                      <TableCell>{e.tipo}</TableCell>
                      <TableCell>{e.interno ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-emerald-400 border-emerald-500/40">● {e.estado}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.observaciones ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditEquipo(e); setOpenEquipo(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteEquipo(e.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {equipos.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin equipos. Usá "Cargar ejemplos" para empezar.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="viajes" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Viajes registrados" value={String(totalViajes)} sub={`${viajes.length} entradas`} color="text-amber-400" />
              <Kpi label="Transportistas" value={String(viajesPorTransp.length)} color="text-blue-400" />
              <Kpi label="Importe total" value={formatPesos(totalImporteViajes)} color="text-emerald-400" />
            </div>
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div className="font-medium">Viajes de transportistas</div>
                <Button size="sm" onClick={() => { setEditViaje(null); setOpenViaje(true); }}><Plus className="h-3 w-3 mr-1" />Nuevo viaje</Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Transportista</TableHead>
                  <TableHead>Ubicación / destino</TableHead><TableHead>Trabajo</TableHead>
                  <TableHead className="text-right">Cant. viajes</TableHead>
                  <TableHead className="text-right">$ / viaje</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead className="w-24" />
                </TableRow></TableHeader>
                <TableBody>
                  {viajes.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{formatFecha(v.fecha)}</TableCell>
                      <TableCell className="font-medium">{v.transportista}</TableCell>
                      <TableCell>
                        {v.ubicacion ?? v.destino ?? "—"}
                        {v.origen && v.destino && <div className="text-xs text-muted-foreground">{v.origen} → {v.destino}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.trabajo ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatNumero(v.cantidad_viajes, 0)}</TableCell>
                      <TableCell className="text-right">{formatPesos(v.precio_viaje)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-400">{formatPesos(v.total)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditViaje(v); setOpenViaje(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteViaje(v.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {viajes.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin viajes registrados</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b p-3 font-medium">Resumen por transportista</div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Transportista</TableHead><TableHead>Ubicaciones</TableHead>
                  <TableHead className="text-right">Cantidad viajes</TableHead>
                  <TableHead className="text-right">Importe total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {viajesPorTransp.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.transportista}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{Array.from(r.ubicaciones).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatNumero(r.cantidad, 0)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-400">{formatPesos(r.total)}</TableCell>
                    </TableRow>
                  ))}
                  {viajesPorTransp.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="reporte" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b p-3 font-medium">Consumo por equipo</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Equipo</TableHead><TableHead>Tenencia</TableHead>
                    <TableHead className="text-right">Cargas</TableHead><TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Costo total</TableHead><TableHead className="text-right">$/L prom.</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {consumoPorEquipo.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.equipo?.nombre ?? "Sin equipo"}{r.equipo?.interno && <span className="text-muted-foreground"> ({r.equipo.interno})</span>}</TableCell>
                        <TableCell><Badge variant="outline" className={r.equipo?.tenencia === "Transportista" ? "text-amber-400 border-amber-500/40" : "text-emerald-400 border-emerald-500/40"}>{r.equipo?.tenencia ?? "—"}</Badge>{r.equipo?.transportista && <div className="text-xs text-muted-foreground mt-0.5">{r.equipo.transportista}</div>}</TableCell>
                        <TableCell className="text-right">{r.cargas}</TableCell>
                        <TableCell className="text-right">{formatNumero(r.litros)} lt</TableCell>
                        <TableCell className="text-right font-medium">{formatPesos(r.total)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatPesos(r.litros > 0 ? r.total / r.litros : 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b p-3 font-medium">Consumo por trabajo / cliente</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Cliente / trabajo</TableHead>
                    <TableHead className="text-right">Cargas</TableHead><TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Costo total</TableHead>
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
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div className="font-medium">Combustible cedido a transportistas contratados</div>
                <div className="text-xs text-muted-foreground">Total a descontar del pago al transportista</div>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Transportista</TableHead><TableHead>Equipos</TableHead>
                  <TableHead className="text-right">Cargas</TableHead><TableHead className="text-right">Litros cedidos</TableHead>
                  <TableHead className="text-right">Importe a descontar</TableHead><TableHead className="text-right">$/L prom.</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {cedidoPorTransportista.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.transportista}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.equipos.join(", ")}</TableCell>
                      <TableCell className="text-right">{r.cargas}</TableCell>
                      <TableCell className="text-right">{formatNumero(r.litros)} lt</TableCell>
                      <TableCell className="text-right font-medium text-rose-400">{formatPesos(r.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatPesos(r.litros > 0 ? r.total / r.litros : 0)}</TableCell>
                    </TableRow>
                  ))}
                  {cedidoPorTransportista.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin cargas a transportistas</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CargaDialog open={openCarga} setOpen={setOpenCarga} initial={editCarga} userId={user?.id ?? ""} year={year} equipos={equipos} qc={qc} />
      <EquipoDialog open={openEquipo} setOpen={setOpenEquipo} initial={editEquipo} userId={user?.id ?? ""} qc={qc} />
      <TanqueDialog open={openTanque} setOpen={setOpenTanque} userId={user?.id ?? ""} qc={qc} />
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

function CargaDialog({ open, setOpen, initial, userId, year, equipos, qc }: {
  open: boolean; setOpen: (v: boolean) => void; initial: Carga | null;
  userId: string; year: number; equipos: Equipo[]; qc: ReturnType<typeof useQueryClient>;
}) {
  const [fecha, setFecha] = useState(initial?.fecha ?? new Date().toISOString().slice(0, 10));
  const [equipoId, setEquipoId] = useState<string>(initial?.equipo_id ?? "");
  const [trabajo, setTrabajo] = useState(initial?.trabajo ?? "");
  const [litros, setLitros] = useState<string>(String(initial?.litros ?? ""));
  const [precio, setPrecio] = useState<string>(String(initial?.precio_litro ?? ""));
  const [kilometros, setKilometros] = useState<string>(initial?.kilometros ? String(initial.kilometros) : "");
  const [horas, setHoras] = useState<string>(initial?.horas ? String(initial.horas) : "");
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");

  useEffect(() => {
    if (open) {
      setFecha(initial?.fecha ?? new Date().toISOString().slice(0, 10));
      setEquipoId(initial?.equipo_id ?? "");
      setTrabajo(initial?.trabajo ?? "");
      setLitros(String(initial?.litros ?? ""));
      setPrecio(String(initial?.precio_litro ?? ""));
      setKilometros(initial?.kilometros ? String(initial.kilometros) : "");
      setHoras(initial?.horas ? String(initial.horas) : "");
      setObservaciones(initial?.observaciones ?? "");
    }
  }, [open, initial]);

  const total = (Number(litros) || 0) * (Number(precio) || 0);

  const submit = async () => {
    if (!litros || Number(litros) <= 0) { toast.error("Litros requeridos"); return; }
    const payload: any = {
      user_id: userId, fecha, litros: Number(litros), producto: "Gasoil",
      precio_litro: Number(precio) || 0, itc: 0, co2: 0, total,
      equipo_id: equipoId || null, trabajo: trabajo || null,
      kilometros: kilometros ? Number(kilometros) : null,
      horas: horas ? Number(horas) : null, observaciones: observaciones || null,
    };
    const { error } = initial
      ? await supabase.from("fema_combustible").update(payload).eq("id", initial.id)
      : await supabase.from("fema_combustible").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Actualizada" : "Carga registrada");
    qc.invalidateQueries({ queryKey: ["fema_combustible"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar" : "Nueva"} carga de gasoil</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fecha" required><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></FormField>
            <FormField label="Equipo / máquina">
              <Select value={equipoId} onValueChange={setEquipoId}>
                <SelectTrigger><SelectValue placeholder="— Equipo —" /></SelectTrigger>
                <SelectContent>
                  {equipos.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}{e.interno ? ` (${e.interno})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Trabajo / cliente (opcional)"><Input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} placeholder="Cliente o descripción" /></FormField>
            <FormField label="Litros cargados" required><Input type="number" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} /></FormField>
          </div>
          <FormField label="Precio por litro ($)"><Input type="number" step="0.0001" value={precio} onChange={(e) => setPrecio(e.target.value)} /></FormField>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex justify-between text-sm">
            <span>Costo total</span><span className="font-semibold">{formatPesos(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kilómetros"><Input type="number" step="0.01" value={kilometros} onChange={(e) => setKilometros(e.target.value)} placeholder="opcional" /></FormField>
            <FormField label="Horas equipo"><Input type="number" step="0.01" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="opcional" /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas..." rows={2} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar carga</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipoDialog({ open, setOpen, initial, userId, qc }: {
  open: boolean; setOpen: (v: boolean) => void; initial: Equipo | null;
  userId: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [tipo, setTipo] = useState(initial?.tipo ?? "Tractor");
  const [interno, setInterno] = useState(initial?.interno ?? "");
  const [tenencia, setTenencia] = useState(initial?.tenencia ?? "Propio");
  const [transportista, setTransportista] = useState(initial?.transportista ?? "");
  const [estado, setEstado] = useState(initial?.estado ?? "Activo");
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");

  useEffect(() => {
    if (open) {
      setNombre(initial?.nombre ?? ""); setTipo(initial?.tipo ?? "Tractor");
      setInterno(initial?.interno ?? ""); setTenencia(initial?.tenencia ?? "Propio");
      setTransportista(initial?.transportista ?? ""); setEstado(initial?.estado ?? "Activo");
      setObservaciones(initial?.observaciones ?? "");
    }
  }, [open, initial]);

  const submit = async () => {
    if (!nombre.trim()) { toast.error("Nombre requerido"); return; }
    const payload: any = {
      user_id: userId, nombre, tipo, interno: interno || null,
      tenencia, transportista: tenencia === "Transportista" ? transportista || null : null,
      estado, observaciones: observaciones || null,
    };
    const { error } = initial
      ? await (supabase as any).from("fema_equipos").update(payload).eq("id", initial.id)
      : await (supabase as any).from("fema_equipos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Actualizado" : "Equipo creado");
    qc.invalidateQueries({ queryKey: ["fema_equipos"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar" : "Nuevo"} equipo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Nombre" required><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Tractor", "Cosechadora", "Camión", "Pulverizadora", "Sembradora", "Otro"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Interno / patente"><Input value={interno} onChange={(e) => setInterno(e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tenencia">
              <Select value={tenencia} onValueChange={setTenencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Propio">Propio</SelectItem>
                  <SelectItem value="Transportista">Transportista contratado</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Estado">
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          {tenencia === "Transportista" && (
            <FormField label="Transportista"><Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="Razón social" /></FormField>
          )}
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

function TanqueDialog({ open, setOpen, userId, qc }: {
  open: boolean; setOpen: (v: boolean) => void; userId: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("IN");
  const [litros, setLitros] = useState("");
  const [precio, setPrecio] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const submit = async () => {
    if (!litros || Number(litros) <= 0) { toast.error("Litros requeridos"); return; }
    const payload: any = {
      user_id: userId, fecha, tipo, litros: Number(litros),
      precio_litro: Number(precio) || 0, proveedor: proveedor || null, observaciones: observaciones || null,
    };
    const { error } = await (supabase as any).from("fema_tanque_mov").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Movimiento registrado");
    qc.invalidateQueries({ queryKey: ["fema_tanque"] });
    setOpen(false);
    setLitros(""); setPrecio(""); setProveedor(""); setObservaciones("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Movimiento de tanque propio</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fecha" required><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></FormField>
            <FormField label="Tipo">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Carga al tanque (compra)</SelectItem>
                  <SelectItem value="OUT">Salida / ajuste</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Litros" required><Input type="number" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} /></FormField>
            <FormField label="Precio por litro"><Input type="number" step="0.0001" value={precio} onChange={(e) => setPrecio(e.target.value)} /></FormField>
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