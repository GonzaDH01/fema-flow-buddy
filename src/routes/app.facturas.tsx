import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileDown, CheckCircle2, RotateCcw, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatNumero, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/facturas")({ component: Page });

const TIPOS_COMPROBANTE = ["Factura", "Recibo", "Nota de Crédito", "Nota de Débito", "Estimado"] as const;
const LETRAS = ["A", "B", "C", "M", "E"] as const;
const CULTIVOS = ["Maíz", "Sorgo", "Alfalfa", "Soja", "Trigo", "Girasol", "Otro"] as const;
const TIPOS_IVA = ["0%", "10.5%", "21%", "27%", "Exento"] as const;
const FORMAS_COBRO = ["Transferencia", "Efectivo", "Cheque", "E-cheq", "Mercado Pago", "Otro"] as const;
const CATEGORIAS_VENTA = ["Picado", "Embolsado", "Servicios", "Mano_de_Obra", "Honorarios", "Franco_Particular", "Otro"] as const;
const labelCatVenta = (c: string) => {
  if (c === "Mano_de_Obra") return "Mano de Obra";
  if (c === "Franco_Particular") return "Franco Particular";
  return c;
};
const PERIODICIDADES = ["semanal", "quincenal", "mensual"] as const;
const INSTRUMENTOS_PLAN = ["echeq", "cheque_fisico", "transferencia", "efectivo", "otro"] as const;

const schema = z.object({
  tipo_comprobante: z.enum(TIPOS_COMPROBANTE),
  tipo: z.enum(LETRAS),
  numero: z.string().max(20).optional().or(z.literal("")),
  fecha: z.string().min(1),
  cliente_id: z.string().uuid().optional().or(z.literal("")),
  trabajo: z.string().max(200).optional().or(z.literal("")),
  categoria: z.string().optional().or(z.literal("")),
  cultivo: z.string().optional().or(z.literal("")),
  iva_pct: z.enum(TIPOS_IVA),
  hectareas: z.coerce.number().min(0),
  precio_ha: z.coerce.number().min(0),
  metros_bolsa: z.coerce.number().min(0),
  precio_metro: z.coerce.number().min(0),
  estado: z.enum(["pendiente", "cobrada"]),
  fecha_cobro: z.string().optional().or(z.literal("")),
  forma_cobro: z.string().optional().or(z.literal("")),
  observaciones: z.string().max(500).optional().or(z.literal("")),
  plan_cuotas: z.array(z.object({
    vencimiento: z.string().min(1),
    monto: z.coerce.number().min(0),
    instrumento: z.enum(INSTRUMENTOS_PLAN),
    numero: z.string().optional().or(z.literal("")),
    banco: z.string().optional().or(z.literal("")),
  })).optional(),
});
type FormVals = z.infer<typeof schema>;

type Row = {
  id: string; fecha: string; cliente_id: string | null; numero: string | null;
  tipo: typeof LETRAS[number]; tipo_comprobante: string | null;
  trabajo: string | null; cultivo: string | null;
  categoria?: string | null;
  hectareas: number | null; precio_ha: number | null;
  metros_bolsa: number | null; precio_metro: number | null;
  neto: number | null; iva_21: number | null; iva_105: number | null;
  percepciones: number | null; total: number;
  condicion_pago: string | null; observaciones: string | null;
  fecha_cobro: string | null; forma_cobro: string | null;
  estado: "pendiente" | "cobrada";
};

type EstimRow = {
  id: string; cliente_id: string | null; fecha_estimada: string;
  monto: number; descripcion: string | null; estado: string;
};
type EstimGroup = {
  key: string;
  cliente_id: string | null;
  descripcionBase: string;
  ids: string[];
  cuotas: { id: string; vencimiento: string; monto: number; descripcion: string | null }[];
  total: number;
  primerVenc: string;
  ultimoVenc: string;
};
type PrefillEstim = {
  group: EstimGroup;
};

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [prefill, setPrefill] = useState<PrefillEstim | null>(null);
  const [tab, setTab] = useState<"todas" | "pendiente" | "cobrada" | "estimados">("todas");
  const [search, setSearch] = useState("");
  const [editEstim, setEditEstim] = useState<EstimGroup | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_facturas_venta", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_facturas_venta")
        .select("*").eq("anio", year)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["fema_clientes_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_clientes").select("id,nombre").order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
  });

  const { data: estimaciones } = useQuery({
    queryKey: ["fema_estimaciones_facturas", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_estimaciones")
        .select("id,cliente_id,fecha_estimada,monto,descripcion,estado")
        .eq("estado", "estimado")
        .gte("fecha_estimada", `${year}-01-01`).lte("fecha_estimada", `${year + 1}-12-31`)
        .order("fecha_estimada");
      if (error) throw error;
      return data as EstimRow[];
    },
  });

  const estimGroups = useMemo<EstimGroup[]>(() => {
    const map = new Map<string, EstimGroup>();
    for (const e of estimaciones ?? []) {
      const base = (e.descripcion ?? "").replace(/\s*-\s*Cuota\s*\d+\/\d+\s*$/i, "").trim();
      const key = `${e.cliente_id ?? "x"}||${base}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, cliente_id: e.cliente_id, descripcionBase: base, ids: [],
          cuotas: [], total: 0, primerVenc: e.fecha_estimada, ultimoVenc: e.fecha_estimada,
        };
        map.set(key, g);
      }
      g.ids.push(e.id);
      g.cuotas.push({ id: e.id, vencimiento: e.fecha_estimada, monto: Number(e.monto), descripcion: e.descripcion });
      g.total += Number(e.monto);
      if (e.fecha_estimada < g.primerVenc) g.primerVenc = e.fecha_estimada;
      if (e.fecha_estimada > g.ultimoVenc) g.ultimoVenc = e.fecha_estimada;
    }
    for (const g of map.values()) g.cuotas.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
    return Array.from(map.values()).sort((a, b) => a.primerVenc.localeCompare(b.primerVenc));
  }, [estimaciones]);

  const clientesMap = useMemo(
    () => Object.fromEntries((clientes ?? []).map((c) => [c.id, c.nombre])),
    [clientes],
  );

  const rows = data ?? [];

  // KPIs
  const kpis = useMemo(() => {
    const totalHas = rows.reduce((a, r) => a + Number(r.hectareas ?? 0), 0);
    const totalMts = rows.reduce((a, r) => a + Number(r.metros_bolsa ?? 0), 0);
    const facturado = rows.reduce((a, r) => a + Number(r.total ?? 0), 0);
    const cobrado = rows.filter((r) => r.estado === "cobrada").reduce((a, r) => a + Number(r.total ?? 0), 0);
    const hasCobradas = rows.filter((r) => r.estado === "cobrada").reduce((a, r) => a + Number(r.hectareas ?? 0), 0);
    const mtsCobrados = rows.filter((r) => r.estado === "cobrada").reduce((a, r) => a + Number(r.metros_bolsa ?? 0), 0);
    return { totalHas, totalMts, facturado, cobrado, hasCobradas, mtsCobrados };
  }, [rows]);

  // Por cultivo
  const porCultivo = useMemo(() => {
    const map = new Map<string, { trabajos: number; has: number; mts: number; facturado: number }>();
    for (const r of rows) {
      const k = r.cultivo || "Sin clasificar";
      const cur = map.get(k) ?? { trabajos: 0, has: 0, mts: 0, facturado: 0 };
      cur.trabajos += 1;
      cur.has += Number(r.hectareas ?? 0);
      cur.mts += Number(r.metros_bolsa ?? 0);
      cur.facturado += Number(r.total ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].facturado - a[1].facturado);
  }, [rows]);

  // Top clientes
  const topClientes = useMemo(() => {
    const map = new Map<string, { trabajos: number; has: number; mts: number; facturado: number }>();
    for (const r of rows) {
      const k = r.cliente_id ? (clientesMap[r.cliente_id] ?? "—") : "Sin cliente";
      const cur = map.get(k) ?? { trabajos: 0, has: 0, mts: 0, facturado: 0 };
      cur.trabajos += 1;
      cur.has += Number(r.hectareas ?? 0);
      cur.mts += Number(r.metros_bolsa ?? 0);
      cur.facturado += Number(r.total ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].facturado - a[1].facturado).slice(0, 8);
  }, [rows, clientesMap]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== "todas") list = list.filter((r) => r.estado === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const cli = r.cliente_id ? (clientesMap[r.cliente_id] ?? "") : "";
        return cli.toLowerCase().includes(q)
          || (r.numero ?? "").toLowerCase().includes(q)
          || (r.trabajo ?? "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [rows, tab, search, clientesMap]);

  const close = () => { setOpen(false); setEdit(null); setPrefill(null); };

  const facturarEstim = (g: EstimGroup) => {
    setEdit(null);
    setPrefill({ group: g });
    setOpen(true);
  };

  const eliminarEstim = async (g: EstimGroup) => {
    const { error } = await supabase.from("fema_estimaciones").delete().in("id", g.ids);
    if (error) { toast.error(error.message); return; }
    toast.success("Estimación eliminada");
    qc.invalidateQueries({ queryKey: ["fema_estimaciones_facturas"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const guardarEstim = async (g: EstimGroup, descripcionBase: string, cliente_id: string | null, cuotas: { vencimiento: string; monto: number }[]) => {
    // borra las cuotas previas y reinserta con los datos editados (sigue siendo estimado)
    const { error: delErr } = await supabase.from("fema_estimaciones").delete().in("id", g.ids);
    if (delErr) { toast.error(delErr.message); return; }
    const total = cuotas.length;
    const inserts = cuotas.map((c, i) => ({
      user_id: user!.id,
      cliente_id: cliente_id || null,
      fecha_estimada: c.vencimiento,
      monto: c.monto,
      descripcion: `${descripcionBase} - Cuota ${i + 1}/${total}`,
      estado: "estimado",
    }));
    const { error: insErr } = await supabase.from("fema_estimaciones").insert(inserts);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Estimación actualizada");
    setEditEstim(null);
    qc.invalidateQueries({ queryKey: ["fema_estimaciones_facturas"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
  };

  const onSubmit = async (v: FormVals) => {
    // calc
    const importePicado = (v.hectareas || 0) * (v.precio_ha || 0);
    const importeBolsa = (v.metros_bolsa || 0) * (v.precio_metro || 0);
    const neto = importePicado + importeBolsa;
    const ivaPct = v.iva_pct === "21%" ? 0.21 : v.iva_pct === "10.5%" ? 0.105 : v.iva_pct === "27%" ? 0.27 : 0;
    const iva21 = v.iva_pct === "21%" ? neto * 0.21 : 0;
    const iva105 = v.iva_pct === "10.5%" ? neto * 0.105 : 0;
    const total = v.tipo === "A" ? neto * (1 + ivaPct) : neto;
    const periodo = MESES_LARGOS[new Date(v.fecha).getMonth()];

    const payload = {
      user_id: user!.id,
      fecha: v.fecha,
      cliente_id: v.cliente_id || null,
      numero: v.numero || null,
      tipo: v.tipo,
      tipo_comprobante: v.tipo_comprobante,
      trabajo: v.trabajo || null,
      categoria: v.categoria || null,
      cultivo: v.cultivo || null,
      hectareas: v.hectareas,
      precio_ha: v.precio_ha,
      metros_bolsa: v.metros_bolsa,
      precio_metro: v.precio_metro,
      neto, iva_21: iva21, iva_105: iva105, percepciones: 0, total,
      estado: v.estado,
      fecha_cobro: v.fecha_cobro || null,
      forma_cobro: v.forma_cobro || null,
      observaciones: v.observaciones || null,
      condicion_pago: periodo,
    };
    let facturaId: string | null = null;
    if (edit) {
      const { error } = await supabase.from("fema_facturas_venta").update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
      facturaId = edit.id;
    } else {
      const { data: ins, error } = await supabase.from("fema_facturas_venta").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      facturaId = (ins as any)?.id ?? null;
    }
    if (facturaId && v.plan_cuotas && v.plan_cuotas.length > 0) {
      const movs = v.plan_cuotas.map((c, i) => ({
        user_id: user!.id,
        instrumento: c.instrumento,
        direccion: "cobro" as const,
        tipo_movimiento: "cobro_cliente" as const,
        fecha_emision: v.fecha,
        vencimiento: c.vencimiento || null,
        numero: c.numero || null,
        banco: c.banco || null,
        contraparte: v.cliente_id ? null : null,
        monto: c.monto,
        estado: "en_cartera" as const,
        factura_venta_id: facturaId,
        observaciones: `Cuota ${i + 1}/${v.plan_cuotas!.length}${v.tipo_comprobante === "Estimado" ? " (Estimado)" : ""}`,
      }));
      const { error: errMov } = await supabase.from("fema_movimientos_pago").insert(movs);
      if (errMov) toast.error(`Plan de cuotas: ${errMov.message}`);
    }
    toast.success(edit ? "Factura actualizada" : "Comprobante creado");
    // Si venía de un estimado → marcarlo como facturado eliminando las cuotas estimadas
    if (!edit && prefill) {
      const { error: errEst } = await supabase.from("fema_estimaciones")
        .delete().in("id", prefill.group.ids);
      if (errEst) toast.error(`Estimación: ${errEst.message}`);
      qc.invalidateQueries({ queryKey: ["fema_estimaciones_facturas"] });
    }
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["cashflow-matrix"] });
    close();
  };

  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_facturas_venta").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
  };

  const toggleCobrada = async (r: Row) => {
    const nuevo = r.estado === "cobrada" ? "pendiente" : "cobrada";
    const patch: any = { estado: nuevo };
    if (nuevo === "cobrada" && !r.fecha_cobro) patch.fecha_cobro = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("fema_facturas_venta").update(patch).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(nuevo === "cobrada" ? "Marcada como cobrada" : "Marcada como pendiente");
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Fecha: r.fecha,
      Numero: r.numero ?? "",
      Cliente: r.cliente_id ? clientesMap[r.cliente_id] ?? "" : "",
      Trabajo: r.trabajo ?? "",
      Cultivo: r.cultivo ?? "",
      Hectareas: r.hectareas ?? 0,
      MetrosBolsa: r.metros_bolsa ?? 0,
      Total: r.total,
      Estado: r.estado,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturas");
    XLSX.writeFile(wb, `facturas-${year}.xlsx`);
  };

  const pctCobrado = kpis.facturado > 0 ? Math.round((kpis.cobrado / kpis.facturado) * 100) : 0;

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Facturas de Servicio</h2>
          <p className="mt-1 text-sm text-muted-foreground">Control de campaña — año {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarExcel}>
            <FileDown className="mr-1.5 h-4 w-4" /> Exportar Excel
          </Button>
          <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Nueva factura
          </Button>
        </div>
      </header>

      {/* Control de campaña */}
      <section className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Control de campaña</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Hectáreas picadas" value={formatNumero(kpis.totalHas)} sub={`Cobradas: ${formatNumero(kpis.hasCobradas)} ha`} />
          <Kpi label="Metros de bolsa" value={formatNumero(kpis.totalMts)} sub={`Cobrados: ${formatNumero(kpis.mtsCobrados)} m`} />
          <Kpi label="Facturado total" value={formatPesos(kpis.facturado)} sub={`${rows.length} facturas`} accent="primary" />
          <Kpi label="Cobrado" value={formatPesos(kpis.cobrado)} sub={`${pctCobrado}% del facturado`} accent="accent" />
        </div>
      </section>

      {/* Por cultivo + Top clientes */}
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <SummaryTable
          title="Por cultivo"
          col1="Cultivo"
          rows={porCultivo}
        />
        <SummaryTable
          title="Top clientes"
          col1="Cliente"
          rows={topClientes}
        />
      </section>

      {/* Tabs + tabla */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
              <TabsTrigger value="cobrada">Cobradas</TabsTrigger>
              <TabsTrigger value="estimados">Estimados ({estimGroups.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
        </div>

        {tab === "estimados" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cuotas</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Total estimado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-28 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimGroups.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No hay estimaciones cargadas</TableCell></TableRow>
              ) : estimGroups.map((g) => (
                <TableRow key={g.key}>
                  <TableCell className="font-medium">{g.cliente_id ? clientesMap[g.cliente_id] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.descripcionBase || "—"}</TableCell>
                  <TableCell className="text-right">{g.cuotas.length}</TableCell>
                  <TableCell className="text-xs">{formatFecha(g.primerVenc)} → {formatFecha(g.ultimoVenc)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(g.total)}</TableCell>
                  <TableCell><Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Estimado</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setEditEstim(g)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="default" className="h-8" onClick={() => facturarEstim(g)}>
                        <Receipt className="mr-1 h-3.5 w-3.5" /> Facturar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar estimación?</AlertDialogTitle>
                            <AlertDialogDescription>Se eliminarán las {g.cuotas.length} cuotas estimadas de este grupo.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => eliminarEstim(g)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° Factura</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No hay facturas</TableCell></TableRow>
            ) : filtered.map((r) => {
              const periodo = MESES_LARGOS[new Date(r.fecha).getMonth()];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.numero ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.cliente_id ? clientesMap[r.cliente_id] ?? "—" : "—"}</TableCell>
                  <TableCell>{formatFecha(r.fecha)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.trabajo ?? "—"}</TableCell>
                  <TableCell>{periodo}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(Number(r.total))}</TableCell>
                  <TableCell>
                    {r.estado === "cobrada"
                      ? <Badge className="bg-primary/15 text-primary border-0">● Cobrada</Badge>
                      : <Badge variant="outline">Pendiente</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={r.estado === "cobrada" ? "Marcar como pendiente" : "Marcar como cobrada"}
                        className={r.estado === "cobrada" ? "text-muted-foreground" : "text-primary hover:text-primary"}
                        onClick={() => toggleCobrada(r)}
                      >
                        {r.estado === "cobrada" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEdit(r); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
                            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(r)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </section>

      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        {open && (
          <FormDialog
            key={prefill?.group.ids.join(",") ?? edit?.id ?? "new"}
            onSubmit={onSubmit}
            initial={edit}
            prefill={prefill}
            clientes={clientes ?? []}
            year={year}
          />
        )}
      </Dialog>

      <Dialog open={!!editEstim} onOpenChange={(v) => !v && setEditEstim(null)}>
        {editEstim && (
          <EditEstimDialog
            key={editEstim.key}
            group={editEstim}
            clientes={clientes ?? []}
            onSave={guardarEstim}
          />
        )}
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "primary" | "accent" }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent === "primary" ? "text-primary" : accent === "accent" ? "text-accent" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SummaryTable({ title, col1, rows }: {
  title: string;
  col1: string;
  rows: [string, { trabajos: number; has: number; mts: number; facturado: number }][];
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3></div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{col1}</TableHead>
            <TableHead className="text-right">Trab.</TableHead>
            <TableHead className="text-right">Has</TableHead>
            <TableHead className="text-right">Mts bolsa</TableHead>
            <TableHead className="text-right">Facturado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground text-sm">Sin datos</TableCell></TableRow>
          ) : rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="font-medium">{k}</TableCell>
              <TableCell className="text-right">{v.trabajos}</TableCell>
              <TableCell className="text-right">{formatNumero(v.has)}</TableCell>
              <TableCell className="text-right">{formatNumero(v.mts)}</TableCell>
              <TableCell className="text-right font-semibold">{formatPesos(v.facturado)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FormDialog({ onSubmit, initial, prefill, clientes, year }: {
  onSubmit: (v: FormVals) => Promise<void>;
  initial: Row | null;
  prefill: PrefillEstim | null;
  clientes: { id: string; nombre: string }[];
  year: number;
}) {
  const inferIva = (r: Row | null): typeof TIPOS_IVA[number] => {
    if (!r) return "21%";
    if ((r.iva_21 ?? 0) > 0) return "21%";
    if ((r.iva_105 ?? 0) > 0) return "10.5%";
    return r.tipo === "A" ? "21%" : "0%";
  };

  // Derivar ha, mts, precios y cultivo desde el estimado precargado
  const estimDerived = useMemo(() => {
    if (!prefill) return null;
    const desc = prefill.group.descripcionBase ?? "";
    const haMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*ha\b/i);
    const mtMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*m(?:ts|etros)?\b/i);
    const ha = haMatch ? Number(haMatch[1].replace(",", ".")) : 0;
    const mt = mtMatch ? Number(mtMatch[1].replace(",", ".")) : 0;
    const cultivo = CULTIVOS.find((c) => desc.toLowerCase().includes(c.toLowerCase()));
    const totalBruto = prefill.group.total;
    // Asumimos IVA 21% sobre Letra A
    const neto = +(totalBruto / 1.21).toFixed(2);
    let pHa = 0, pMt = 0;
    if (ha > 0 && mt > 0) {
      const half = neto / 2;
      pHa = +(half / ha).toFixed(2);
      pMt = +(half / mt).toFixed(2);
    } else if (ha > 0) {
      pHa = +(neto / ha).toFixed(2);
    } else if (mt > 0) {
      pMt = +(neto / mt).toFixed(2);
    }
    return { ha, mt, pHa, pMt, cultivo: cultivo ?? "Maíz" };
  }, [prefill]);

  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_comprobante: (initial?.tipo_comprobante as typeof TIPOS_COMPROBANTE[number]) ?? "Factura",
      tipo: initial?.tipo ?? "A",
      numero: initial?.numero ?? "",
      fecha: initial?.fecha ?? new Date().toISOString().slice(0, 10),
      cliente_id: initial?.cliente_id ?? prefill?.group.cliente_id ?? "",
      trabajo: initial?.trabajo ?? prefill?.group.descripcionBase ?? "",
      categoria: initial?.categoria ?? "",
      cultivo: initial?.cultivo ?? estimDerived?.cultivo ?? "Maíz",
      iva_pct: inferIva(initial),
      hectareas: Number(initial?.hectareas ?? estimDerived?.ha ?? 0),
      precio_ha: Number(initial?.precio_ha ?? estimDerived?.pHa ?? 0),
      metros_bolsa: Number(initial?.metros_bolsa ?? estimDerived?.mt ?? 0),
      precio_metro: Number(initial?.precio_metro ?? estimDerived?.pMt ?? 0),
      estado: initial?.estado ?? "pendiente",
      fecha_cobro: initial?.fecha_cobro ?? "",
      forma_cobro: initial?.forma_cobro ?? "Transferencia",
      observaciones: initial?.observaciones ?? "",
      plan_cuotas: prefill
        ? prefill.group.cuotas.map((c) => ({
            vencimiento: c.vencimiento,
            monto: c.monto,
            instrumento: "echeq" as const,
            numero: "",
            banco: "",
          }))
        : [],
    },
  });

  const tipo = f.watch("tipo");
  const ivaPctStr = f.watch("iva_pct");
  const tipoComp = f.watch("tipo_comprobante");
  const cuotas = f.watch("plan_cuotas") ?? [];

  // Plan controls
  const [planQty, setPlanQty] = useState(6);
  const [planFirst, setPlanFirst] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [planPer, setPlanPer] = useState<typeof PERIODICIDADES[number]>("mensual");
  const [planInstr, setPlanInstr] = useState<typeof INSTRUMENTOS_PLAN[number]>("echeq");

  const has = Number(f.watch("hectareas") || 0);
  const pHa = Number(f.watch("precio_ha") || 0);
  const mts = Number(f.watch("metros_bolsa") || 0);
  const pMt = Number(f.watch("precio_metro") || 0);

  const importePicado = has * pHa;
  const importeBolsa = mts * pMt;
  const neto = importePicado + importeBolsa;
  const ivaPct = ivaPctStr === "21%" ? 0.21 : ivaPctStr === "10.5%" ? 0.105 : ivaPctStr === "27%" ? 0.27 : 0;
  const ivaMonto = tipo === "A" ? neto * ivaPct : 0;
  const total = neto + ivaMonto;

  const generarPlan = () => {
    if (planQty < 1 || total <= 0) return;
    const cuota = +(total / planQty).toFixed(2);
    const arr = Array.from({ length: planQty }).map((_, i) => {
      const d = new Date(planFirst);
      if (planPer === "semanal") d.setDate(d.getDate() + i * 7);
      else if (planPer === "quincenal") d.setDate(d.getDate() + i * 15);
      else d.setMonth(d.getMonth() + i);
      // Ajustar última cuota por redondeo
      const monto = i === planQty - 1 ? +(total - cuota * (planQty - 1)).toFixed(2) : cuota;
      return {
        vencimiento: d.toISOString().slice(0, 10),
        monto,
        instrumento: planInstr,
        numero: "",
        banco: "",
      };
    });
    f.setValue("plan_cuotas", arr, { shouldDirty: true });
  };

  const updateCuota = (i: number, patch: Partial<NonNullable<FormVals["plan_cuotas"]>[number]>) => {
    const arr = [...cuotas];
    arr[i] = { ...arr[i], ...patch };
    f.setValue("plan_cuotas", arr, { shouldDirty: true });
  };
  const removeCuota = (i: number) => {
    f.setValue("plan_cuotas", cuotas.filter((_, idx) => idx !== i), { shouldDirty: true });
  };
  const totalCuotas = cuotas.reduce((a, c) => a + Number(c.monto || 0), 0);
  const diff = +(total - totalCuotas).toFixed(2);

  useEffect(() => {
    if (!initial) {
      // ensure form rerenders totals via watch — nothing to do
    }
  }, [initial]);

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {initial ? "Editar" : "Nuevo"} {tipoComp === "Estimado" ? "Estimado / Plan de cuotas" : "Comprobante de Servicio"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-4">
        {/* Tipo de comprobante */}
        <fieldset className="rounded-md border border-border bg-muted/30 p-3">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tipo de comprobante
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Select value={f.watch("tipo_comprobante")} onValueChange={(v) => f.setValue("tipo_comprobante", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_COMPROBANTE.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={tipo} onValueChange={(v) => f.setValue("tipo", v as any)}>
              <SelectTrigger><SelectValue placeholder="Letra" /></SelectTrigger>
              <SelectContent>{LETRAS.map((t) => <SelectItem key={t} value={t}>Letra {t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Factura A: separa neto + IVA. Factura B o C: importe final, sin discriminación de IVA.
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="N° Factura"><Input placeholder="0001-00000123" {...f.register("numero")} /></FormField>
          <FormField label="Fecha" required><Input type="date" {...f.register("fecha")} /></FormField>
        </div>

        <FormField label="Cliente">
          <Select value={f.watch("cliente_id") ?? ""} onValueChange={(v) => f.setValue("cliente_id", v)}>
            <SelectTrigger><SelectValue placeholder="Nombre del cliente" /></SelectTrigger>
            <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>

        <FormField label="Trabajo realizado">
          <Input placeholder="Ej. Picado de maíz — 120 ha" {...f.register("trabajo")} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cultivo">
            <Select value={f.watch("cultivo") ?? ""} onValueChange={(v) => f.setValue("cultivo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CULTIVOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Tipo de IVA">
            <Select value={ivaPctStr} onValueChange={(v) => f.setValue("iva_pct", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_IVA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Categoría">
          <Select value={f.watch("categoria") ?? ""} onValueChange={(v) => f.setValue("categoria", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar categoría…" /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS_VENTA.map((c) => <SelectItem key={c} value={c}>{labelCatVenta(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>

        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Servicio de picado
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Hectáreas"><Input type="number" step="0.01" {...f.register("hectareas")} /></FormField>
            <FormField label="Precio unitario ($/ha)"><Input type="number" step="0.01" {...f.register("precio_ha")} /></FormField>
            <FormField label="Importe">
              <Input readOnly value={formatPesos(importePicado)} className="bg-muted/30" />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Servicio de embolsado
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Metros de bolsa"><Input type="number" step="0.01" {...f.register("metros_bolsa")} /></FormField>
            <FormField label="Precio unitario ($/m)"><Input type="number" step="0.01" {...f.register("precio_metro")} /></FormField>
            <FormField label="Importe">
              <Input readOnly value={formatPesos(importeBolsa)} className="bg-muted/30" />
            </FormField>
          </div>
        </fieldset>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between py-1"><span className="text-muted-foreground">Subtotal (neto)</span><span>{formatPesos(neto)}</span></div>
          {tipo === "A" && (
            <div className="flex justify-between py-1"><span className="text-muted-foreground">IVA {ivaPctStr}</span><span>{formatPesos(ivaMonto)}</span></div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold"><span>TOTAL</span><span>{formatPesos(total)}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Estado">
            <Select value={f.watch("estado")} onValueChange={(v) => f.setValue("estado", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="cobrada">Cobrada</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Fecha de cobro"><Input type="date" {...f.register("fecha_cobro")} /></FormField>
        </div>

        <FormField label="Forma de cobro">
          <Select value={f.watch("forma_cobro") ?? ""} onValueChange={(v) => f.setValue("forma_cobro", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FORMAS_COBRO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>

        <FormField label="Observaciones">
          <Textarea placeholder="Notas adicionales..." rows={2} {...f.register("observaciones")} />
        </FormField>

        {/* Plan de cuotas */}
        <fieldset className="rounded-md border border-border bg-muted/20 p-3">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plan de cuotas {tipoComp === "Estimado" ? "(Estimado)" : "(opcional)"}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FormField label="Cantidad">
              <Input type="number" min={1} value={planQty} onChange={(e) => setPlanQty(Number(e.target.value) || 1)} />
            </FormField>
            <FormField label="1° vencimiento">
              <Input type="date" value={planFirst} onChange={(e) => setPlanFirst(e.target.value)} />
            </FormField>
            <FormField label="Periodicidad">
              <Select value={planPer} onValueChange={(v) => setPlanPer(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODICIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Instrumento">
              <Select value={planInstr} onValueChange={(v) => setPlanInstr(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INSTRUMENTOS_PLAN.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={generarPlan}>
              Generar {planQty} cuotas
            </Button>
            {cuotas.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Total cuotas: <span className="font-semibold text-foreground">{formatPesos(totalCuotas)}</span>
                {Math.abs(diff) > 0.5 && <span className="ml-2 text-destructive">Dif: {formatPesos(diff)}</span>}
              </div>
            )}
          </div>
          {cuotas.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {cuotas.map((c, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                  <div className="col-span-1 text-center text-xs text-muted-foreground">{i + 1}</div>
                  <Input type="date" className="col-span-3 h-8 text-xs" value={c.vencimiento} onChange={(e) => updateCuota(i, { vencimiento: e.target.value })} />
                  <Input type="number" step="0.01" className="col-span-2 h-8 text-xs" value={c.monto} onChange={(e) => updateCuota(i, { monto: Number(e.target.value) })} />
                  <Select value={c.instrumento} onValueChange={(v) => updateCuota(i, { instrumento: v as any })}>
                    <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{INSTRUMENTOS_PLAN.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="N°" className="col-span-2 h-8 text-xs" value={c.numero ?? ""} onChange={(e) => updateCuota(i, { numero: e.target.value })} />
                  <Input placeholder="Banco" className="col-span-1 h-8 text-xs" value={c.banco ?? ""} onChange={(e) => updateCuota(i, { banco: e.target.value })} />
                  <Button type="button" size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-destructive" onClick={() => removeCuota(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Al guardar, cada cuota se registra como movimiento de cobro vinculado a este comprobante y aparece en Medios de Pago / Cash Flow.
          </p>
        </fieldset>

        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>
            Guardar {tipoComp === "Estimado" ? "estimado" : "factura"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditEstimDialog({
  group, clientes, onSave,
}: {
  group: EstimGroup;
  clientes: { id: string; nombre: string }[];
  onSave: (g: EstimGroup, descripcionBase: string, cliente_id: string | null, cuotas: { vencimiento: string; monto: number }[]) => Promise<void>;
}) {
  const [clienteId, setClienteId] = useState<string>(group.cliente_id ?? "");
  const [descripcion, setDescripcion] = useState<string>(group.descripcionBase ?? "");
  const [cuotas, setCuotas] = useState(group.cuotas.map((c) => ({ vencimiento: c.vencimiento, monto: c.monto })));
  const [saving, setSaving] = useState(false);

  const total = cuotas.reduce((a, c) => a + Number(c.monto || 0), 0);

  const updateCuota = (i: number, patch: Partial<{ vencimiento: string; monto: number }>) =>
    setCuotas((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCuota = () => {
    const last = cuotas[cuotas.length - 1];
    const next = last ? (() => { const d = new Date(last.vencimiento); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })() : new Date().toISOString().slice(0, 10);
    setCuotas([...cuotas, { vencimiento: next, monto: last?.monto ?? 0 }]);
  };
  const removeCuota = (i: number) => setCuotas((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (cuotas.length === 0) { toast.error("Agregá al menos una cuota"); return; }
    setSaving(true);
    await onSave(group, descripcion.trim() || "Estimación", clienteId || null, cuotas);
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Editar estimación</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <FormField label="Cliente">
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Descripción">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Sorgo 15 ha + 120 m bolsa" />
        </FormField>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium">Cuotas estimadas</legend>
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" size="sm" variant="outline" onClick={addCuota}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar cuota
            </Button>
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{formatPesos(total)}</span> · {cuotas.length} cuotas
            </div>
          </div>
          <div className="space-y-1.5">
            {cuotas.map((c, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                <div className="col-span-1 text-center text-xs text-muted-foreground">{i + 1}</div>
                <Input type="date" className="col-span-5 h-8 text-xs" value={c.vencimiento} onChange={(e) => updateCuota(i, { vencimiento: e.target.value })} />
                <Input type="number" step="0.01" className="col-span-5 h-8 text-xs text-right" value={c.monto} onChange={(e) => updateCuota(i, { monto: Number(e.target.value) })} />
                <Button type="button" size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-destructive" onClick={() => removeCuota(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Al guardar, la estimación se mantiene en estado <strong>Estimado</strong> y se actualiza en el Cash Flow.
          </p>
        </fieldset>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>Guardar cambios</Button>
      </DialogFooter>
    </DialogContent>
  );
}