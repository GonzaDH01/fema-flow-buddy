import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES_LARGOS, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/app/empleados")({ component: Page });

const FUNCIONES = ["Operador de máquina", "Transportista", "Mecánico", "Administrativo", "Capataz", "Peón", "Otro"];
const CONTRATACIONES = ["Mensualizado", "Jornal", "Por hora", "Contratado"];

type Empleado = {
  id: string; nombre: string; dni: string | null; cuil: string | null;
  funcion: string | null; tipo_contratacion: string | null;
  telefono: string | null; email: string | null; domicilio: string | null;
  fecha_ingreso: string | null; sueldo_bruto: number; valor_hora: number;
  activo: boolean; contacto_emergencia: string | null; obra_social: string | null;
  observaciones: string | null; cargo: string | null;
};
type Sueldo = {
  id: string; empleado_id: string | null; periodo: string; rol: string | null;
  mes: number | null; anio: number | null;
  basico: number; adicional: number; total: number; estado: string;
};
type Hora = {
  id: string; empleado_id: string | null; fecha: string; horas: number;
  referencia: string | null; tarea: string | null; observaciones: string | null;
  mes: number | null; anio: number | null;
};

function Page() {
  const [tab, setTab] = useState("liquidaciones");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empleados / Sueldos</h1>
          <p className="text-sm text-muted-foreground">Personal, liquidaciones, horas trabajadas y reportes</p>
        </div>
        <HeaderActions tab={tab} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="liquidaciones">Liquidaciones</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="horas">Horas trabajadas</TabsTrigger>
          <TabsTrigger value="reporte">Reporte</TabsTrigger>
        </TabsList>
        <TabsContent value="liquidaciones"><LiquidacionesTab /></TabsContent>
        <TabsContent value="personal"><PersonalTab /></TabsContent>
        <TabsContent value="horas"><HorasTab /></TabsContent>
        <TabsContent value="reporte"><ReporteTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function HeaderActions({ tab }: { tab: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportEmpleados()}>
        <FileDown className="size-4 mr-1" /> Exportar Excel
      </Button>
      {tab === "liquidaciones" && <NuevaLiquidacionDialog />}
      {tab === "personal" && <NuevoEmpleadoDialog />}
      {tab === "horas" && <NuevaHoraDialog />}
    </div>
  );
}

async function exportEmpleados() {
  const [emp, sue, hor] = await Promise.all([
    supabase.from("fema_empleados").select("*"),
    supabase.from("fema_sueldos").select("*"),
    supabase.from("fema_horas_trabajadas").select("*"),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emp.data ?? []), "Personal");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sue.data ?? []), "Liquidaciones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hor.data ?? []), "Horas");
  XLSX.writeFile(wb, `FEMA_Empleados_${new Date().toISOString().split("T")[0]}.xlsx`);
}

// ============ LIQUIDACIONES ============
function LiquidacionesTab() {
  const qc = useQueryClient();
  const { year } = useYear();
  const [mes, setMes] = useState<string>("all");

  const { data: sueldos } = useQuery({
    queryKey: ["fema_sueldos", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_sueldos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sueldo[];
    },
  });
  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre,funcion");
      return (data ?? []) as { id: string; nombre: string; funcion: string | null }[];
    },
  });

  const rows = useMemo(() => {
    const list = (sueldos ?? []).filter((s) => (s.anio ?? year) === year);
    if (mes === "all") return list;
    return list.filter((s) => String(s.mes) === mes);
  }, [sueldos, mes, year]);

  const empMap = useMemo(
    () => Object.fromEntries((empleados ?? []).map((e) => [e.id, e])),
    [empleados],
  );

  const pagar = async (id: string) => {
    const { error } = await supabase.from("fema_sueldos").update({ estado: "Pagado" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Liquidación pagada");
    qc.invalidateQueries({ queryKey: ["fema_sueldos"] });
  };
  const eliminar = async (id: string) => {
    const { error } = await supabase.from("fema_sueldos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_sueldos"] });
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-medium">Liquidaciones de sueldos</h3>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los meses</SelectItem>
            {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empleado</TableHead><TableHead>Rol</TableHead>
            <TableHead>Mes</TableHead><TableHead>Período</TableHead>
            <TableHead className="text-right">Básico</TableHead>
            <TableHead className="text-right">Adicional</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sin liquidaciones</TableCell></TableRow>
          )}
          {rows.map((r) => {
            const e = r.empleado_id ? empMap[r.empleado_id] : null;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{e?.nombre ?? "—"}</TableCell>
                <TableCell>{r.rol ?? e?.funcion ?? "—"}</TableCell>
                <TableCell>{r.mes ? MESES_LARGOS[r.mes - 1] : "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.periodo}</TableCell>
                <TableCell className="text-right">{formatPesos(r.basico)}</TableCell>
                <TableCell className="text-right">{Number(r.adicional) > 0 ? formatPesos(r.adicional) : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{formatPesos(r.total)}</TableCell>
                <TableCell>
                  {r.estado === "Pagado"
                    ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">● Pagado</Badge>
                    : <Badge variant="outline" className="border-destructive text-destructive">● Pendiente</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.estado !== "Pagado" && (
                      <Button size="sm" variant="outline" className="h-7 text-primary border-primary/40" onClick={() => pagar(r.id)}>
                        <Check className="size-3 mr-1" /> Pagar
                      </Button>
                    )}
                    <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => eliminar(r.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function NuevaLiquidacionDialog() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [empleadoId, setEmpleadoId] = useState("");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [basico, setBasico] = useState("0");
  const [adicional, setAdicional] = useState("0");
  const [estado, setEstado] = useState("Pendiente");

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre,funcion,sueldo_bruto");
      return (data ?? []) as { id: string; nombre: string; funcion: string | null; sueldo_bruto: number }[];
    },
  });

  const emp = empleados?.find((e) => e.id === empleadoId);
  const total = Number(basico) + Number(adicional);

  const onSubmit = async () => {
    if (!empleadoId) return toast.error("Seleccionar empleado");
    const m = Number(mes);
    const payload = {
      user_id: user!.id, empleado_id: empleadoId,
      periodo: `${year}-${String(m).padStart(2, "0")}`,
      mes: m, anio: year, rol: emp?.funcion ?? null,
      basico: Number(basico), adicional: Number(adicional),
      total, estado, sueldo_bruto: total,
    };
    const { error } = await supabase.from("fema_sueldos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Liquidación creada");
    qc.invalidateQueries({ queryKey: ["fema_sueldos"] });
    setOpen(false);
    setEmpleadoId(""); setBasico("0"); setAdicional("0");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Nueva liquidación</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva liquidación</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={empleadoId} onValueChange={(v) => {
              setEmpleadoId(v);
              const e = empleados?.find((x) => x.id === v);
              if (e?.sueldo_bruto) setBasico(String(e.sueldo_bruto));
            }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre} {e.funcion ? `— ${e.funcion}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mes</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="Pagado">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Básico ($)</Label><Input type="number" value={basico} onChange={(e) => setBasico(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Adicional ($)</Label><Input type="number" value={adicional} onChange={(e) => setAdicional(e.target.value)} /></div>
          </div>
          <div className="flex justify-between items-center p-3 rounded-md bg-muted/40">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-semibold text-lg">{formatPesos(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSubmit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ PERSONAL ============
function PersonalTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["fema_empleados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleados").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Empleado[];
    },
  });
  const eliminar = async (id: string) => {
    const { error } = await supabase.from("fema_empleados").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
  };
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b"><h3 className="font-medium">Nómina de personal</h3></div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead><TableHead>DNI</TableHead><TableHead>CUIL</TableHead>
            <TableHead>Función</TableHead><TableHead>Contratación</TableHead>
            <TableHead className="text-right">Básico</TableHead>
            <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
          {!isLoading && (data ?? []).length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin empleados cargados</TableCell></TableRow>
          )}
          {(data ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.nombre}</TableCell>
              <TableCell>{r.dni ?? "—"}</TableCell>
              <TableCell>{r.cuil ?? "—"}</TableCell>
              <TableCell>{r.funcion ?? r.cargo ?? "—"}</TableCell>
              <TableCell>{r.tipo_contratacion ?? "—"}</TableCell>
              <TableCell className="text-right">{formatPesos(r.sueldo_bruto)}</TableCell>
              <TableCell>{r.activo
                ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Activo</Badge>
                : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => eliminar(r.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NuevoEmpleadoDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    nombre: "", dni: "", cuil: "", funcion: "Operador de máquina",
    tipo_contratacion: "Mensualizado", telefono: "", email: "", domicilio: "",
    fecha_ingreso: "", sueldo_bruto: "0", valor_hora: "0", activo: "Activo",
    contacto_emergencia: "", obra_social: "", observaciones: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const onSubmit = async () => {
    if (!v.nombre.trim()) return toast.error("Nombre requerido");
    const payload = {
      user_id: user!.id, nombre: v.nombre, dni: v.dni || null, cuil: v.cuil || null,
      funcion: v.funcion, cargo: v.funcion, tipo_contratacion: v.tipo_contratacion,
      telefono: v.telefono || null, email: v.email || null, domicilio: v.domicilio || null,
      fecha_ingreso: v.fecha_ingreso || null,
      sueldo_bruto: Number(v.sueldo_bruto || 0), valor_hora: Number(v.valor_hora || 0),
      activo: v.activo === "Activo",
      contacto_emergencia: v.contacto_emergencia || null, obra_social: v.obra_social || null,
      observaciones: v.observaciones || null,
    };
    const { error } = await supabase.from("fema_empleados").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Empleado creado");
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
    qc.invalidateQueries({ queryKey: ["fema_empleados_min"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Nuevo empleado</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nombre y apellido</Label><Input value={v.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre completo" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>DNI</Label><Input value={v.dni} onChange={(e) => set("dni", e.target.value)} placeholder="00.000.000" /></div>
            <div className="space-y-1.5"><Label>CUIL</Label><Input value={v.cuil} onChange={(e) => set("cuil", e.target.value)} placeholder="20-00000000-0" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Función / Rol</Label>
              <Select value={v.funcion} onValueChange={(x) => set("funcion", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FUNCIONES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de contratación</Label>
              <Select value={v.tipo_contratacion} onValueChange={(x) => set("tipo_contratacion", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRATACIONES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={v.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+54 9 ..." /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="email@dominio.com" /></div>
          </div>
          <div className="space-y-1.5"><Label>Domicilio</Label><Input value={v.domicilio} onChange={(e) => set("domicilio", e.target.value)} placeholder="Calle, número, localidad" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Fecha de ingreso</Label><Input type="date" value={v.fecha_ingreso} onChange={(e) => set("fecha_ingreso", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sueldo básico ($)</Label><Input type="number" value={v.sueldo_bruto} onChange={(e) => set("sueldo_bruto", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Valor hora ($)</Label><Input type="number" value={v.valor_hora} onChange={(e) => set("valor_hora", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={v.activo} onValueChange={(x) => set("activo", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Contacto de emergencia</Label><Input value={v.contacto_emergencia} onChange={(e) => set("contacto_emergencia", e.target.value)} placeholder="Nombre y teléfono" /></div>
            <div className="space-y-1.5"><Label>Obra social / ART</Label><Input value={v.obra_social} onChange={(e) => set("obra_social", e.target.value)} placeholder="Cobertura" /></div>
          </div>
          <div className="space-y-1.5"><Label>Observaciones</Label><Textarea value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSubmit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ HORAS TRABAJADAS ============
function HorasTab() {
  const qc = useQueryClient();
  const { year } = useYear();
  const [empF, setEmpF] = useState("all");
  const [mesF, setMesF] = useState("all");

  const { data: horas } = useQuery({
    queryKey: ["fema_horas", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_horas_trabajadas").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return data as Hora[];
    },
  });
  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const empMap = useMemo(() => Object.fromEntries((empleados ?? []).map((e) => [e.id, e.nombre])), [empleados]);

  const rows = useMemo(() => {
    let list = (horas ?? []).filter((h) => (h.anio ?? new Date(h.fecha).getFullYear()) === year);
    if (empF !== "all") list = list.filter((h) => h.empleado_id === empF);
    if (mesF !== "all") list = list.filter((h) => String(h.mes ?? new Date(h.fecha).getMonth() + 1) === mesF);
    return list;
  }, [horas, empF, mesF, year]);

  const eliminar = async (id: string) => {
    const { error } = await supabase.from("fema_horas_trabajadas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_horas"] });
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b gap-2 flex-wrap">
        <h3 className="font-medium">Registro de horas trabajadas</h3>
        <div className="flex gap-2">
          <Select value={empF} onValueChange={setEmpF}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los empleados</SelectItem>
              {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mesF} onValueChange={setMesF}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead><TableHead>Empleado</TableHead>
            <TableHead>Referencia</TableHead><TableHead>Tarea</TableHead>
            <TableHead className="text-right">Horas</TableHead>
            <TableHead>Observaciones</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin registros</TableCell></TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{formatFecha(r.fecha)}</TableCell>
              <TableCell className="font-medium">{r.empleado_id ? empMap[r.empleado_id] ?? "—" : "—"}</TableCell>
              <TableCell>{r.referencia ?? "—"}</TableCell>
              <TableCell>{r.tarea ?? "—"}</TableCell>
              <TableCell className="text-right font-mono">{Number(r.horas).toFixed(1)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.observaciones ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => eliminar(r.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NuevaHoraDialog() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [v, setV] = useState({
    empleado_id: "", fecha: today, horas: "8",
    referencia: "", tarea: "", observaciones: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const onSubmit = async () => {
    if (!v.empleado_id) return toast.error("Seleccionar empleado");
    const d = new Date(v.fecha);
    const payload = {
      user_id: user!.id, empleado_id: v.empleado_id,
      fecha: v.fecha, horas: Number(v.horas || 0),
      referencia: v.referencia || null, tarea: v.tarea || null,
      observaciones: v.observaciones || null,
      mes: d.getMonth() + 1, anio: d.getFullYear() || year,
    };
    const { error } = await supabase.from("fema_horas_trabajadas").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Horas registradas");
    qc.invalidateQueries({ queryKey: ["fema_horas"] });
    setOpen(false);
    setV({ empleado_id: "", fecha: today, horas: "8", referencia: "", tarea: "", observaciones: "" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Cargar horas</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cargar horas trabajadas</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={v.empleado_id} onValueChange={(x) => set("empleado_id", x)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Horas trabajadas</Label><Input type="number" step="0.5" value={v.horas} onChange={(e) => set("horas", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Referencia (campo / lugar)</Label><Input value={v.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ej: Campo Garessi" /></div>
          <div className="space-y-1.5"><Label>Tarea realizada</Label><Input value={v.tarea} onChange={(e) => set("tarea", e.target.value)} placeholder="Siembra, pulverización, etc." /></div>
          <div className="space-y-1.5"><Label>Observaciones</Label><Textarea value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSubmit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ REPORTE ============
function ReporteTab() {
  const { year } = useYear();
  const { data: sueldos } = useQuery({
    queryKey: ["fema_sueldos", year],
    queryFn: async () => (await supabase.from("fema_sueldos").select("*")).data as Sueldo[] ?? [],
  });
  const { data: horas } = useQuery({
    queryKey: ["fema_horas", year],
    queryFn: async () => (await supabase.from("fema_horas_trabajadas").select("*")).data as Hora[] ?? [],
  });
  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados"],
    queryFn: async () => (await supabase.from("fema_empleados").select("*")).data as Empleado[] ?? [],
  });

  const sueY = (sueldos ?? []).filter((s) => (s.anio ?? year) === year);
  const horY = (horas ?? []).filter((h) => (h.anio ?? new Date(h.fecha).getFullYear()) === year);
  const totalLiq = sueY.reduce((a, s) => a + Number(s.total), 0);
  const pagado = sueY.filter((s) => s.estado === "Pagado").reduce((a, s) => a + Number(s.total), 0);
  const pendiente = totalLiq - pagado;
  const totalHoras = horY.reduce((a, h) => a + Number(h.horas), 0);
  const activos = (empleados ?? []).filter((e) => e.activo).length;

  const porEmpleado = useMemo(() => {
    const map = new Map<string, { nombre: string; horas: number; total: number }>();
    (empleados ?? []).forEach((e) => map.set(e.id, { nombre: e.nombre, horas: 0, total: 0 }));
    horY.forEach((h) => { if (h.empleado_id) { const e = map.get(h.empleado_id); if (e) e.horas += Number(h.horas); } });
    sueY.forEach((s) => { if (s.empleado_id) { const e = map.get(s.empleado_id); if (e) e.total += Number(s.total); } });
    return Array.from(map.values()).filter((r) => r.horas > 0 || r.total > 0);
  }, [empleados, horY, sueY]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Empleados activos" value={String(activos)} />
        <Kpi label="Total liquidado" value={formatPesos(totalLiq)} />
        <Kpi label="Pagado" value={formatPesos(pagado)} tone="primary" />
        <Kpi label="Pendiente" value={formatPesos(pendiente)} tone="destructive" />
      </div>
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-medium">Reporte por empleado · {year}</h3>
          <span className="text-sm text-muted-foreground">Total horas: <span className="font-mono">{totalHoras.toFixed(1)}</span></span>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Empleado</TableHead>
            <TableHead className="text-right">Horas trabajadas</TableHead>
            <TableHead className="text-right">Total liquidado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {porEmpleado.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sin datos</TableCell></TableRow>
            )}
            {porEmpleado.map((r) => (
              <TableRow key={r.nombre}>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell className="text-right font-mono">{r.horas.toFixed(1)}</TableCell>
                <TableCell className="text-right font-semibold">{formatPesos(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "primary" | "destructive" }) {
  const cls = tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${cls}`}>{value}</p>
    </div>
  );
}