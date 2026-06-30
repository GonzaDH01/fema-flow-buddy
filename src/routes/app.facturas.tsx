import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileDown, CheckCircle2, RotateCcw } from "lucide-react";
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
const PERIODICIDADES = ["semanal", "quincenal", "mensual"] as const;
const INSTRUMENTOS_PLAN = ["echeq", "cheque_fisico", "transferencia", "efectivo", "otro"] as const;

const schema = z.object({
  tipo_comprobante: z.enum(TIPOS_COMPROBANTE),
  tipo: z.enum(LETRAS),
  numero: z.string().max(20).optional().or(z.literal("")),
  fecha: z.string().min(1),
  cliente_id: z.string().uuid().optional().or(z.literal("")),
  trabajo: z.string().max(200).optional().or(z.literal("")),
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
  hectareas: number | null; precio_ha: number | null;
  metros_bolsa: number | null; precio_metro: number | null;
  neto: number | null; iva_21: number | null; iva_105: number | null;
  percepciones: number | null; total: number;
  condicion_pago: string | null; observaciones: string | null;
  fecha_cobro: string | null; forma_cobro: string | null;
  estado: "pendiente" | "cobrada";
};

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [tab, setTab] = useState<"todas" | "pendiente" | "cobrada">("todas");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["fema_facturas_venta", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_facturas_venta")
        .select("*").eq("user_id", user!.id).eq("anio", year)
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

  const close = () => { setOpen(false); setEdit(null); };

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
    const { error } = edit
      ? await supabase.from("fema_facturas_venta").update(payload).eq("id", edit.id)
      : await supabase.from("fema_facturas_venta").insert(payload).select("id").single() as any;
    if (error) { toast.error(error.message); return; }
    // Si se generó plan de cuotas en alta, insertarlas vinculadas
    const inserted = !edit ? (error ? null : (await supabase.from("fema_facturas_venta").select("id").eq("user_id", user!.id).eq("fecha", v.fecha).eq("total", total).order("created_at", { ascending: false }).limit(1).maybeSingle()).data) : null;
    const facturaId = edit ? edit.id : inserted?.id ?? null;
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
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
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
            </TabsList>
          </Tabs>
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
        </div>

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
      </section>

      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog onSubmit={onSubmit} initial={edit} clientes={clientes ?? []} year={year} />
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

function FormDialog({ onSubmit, initial, clientes, year }: {
  onSubmit: (v: FormVals) => Promise<void>;
  initial: Row | null;
  clientes: { id: string; nombre: string }[];
  year: number;
}) {
  const inferIva = (r: Row | null): typeof TIPOS_IVA[number] => {
    if (!r) return "21%";
    if ((r.iva_21 ?? 0) > 0) return "21%";
    if ((r.iva_105 ?? 0) > 0) return "10.5%";
    return r.tipo === "A" ? "21%" : "0%";
  };

  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_comprobante: (initial?.tipo_comprobante as typeof TIPOS_COMPROBANTE[number]) ?? "Factura",
      tipo: initial?.tipo ?? "A",
      numero: initial?.numero ?? "",
      fecha: initial?.fecha ?? new Date(`${year}-01-01`).toISOString().slice(0, 10),
      cliente_id: initial?.cliente_id ?? "",
      trabajo: initial?.trabajo ?? "",
      cultivo: initial?.cultivo ?? "Maíz",
      iva_pct: inferIva(initial),
      hectareas: Number(initial?.hectareas ?? 0),
      precio_ha: Number(initial?.precio_ha ?? 0),
      metros_bolsa: Number(initial?.metros_bolsa ?? 0),
      precio_metro: Number(initial?.precio_metro ?? 0),
      estado: initial?.estado ?? "pendiente",
      fecha_cobro: initial?.fecha_cobro ?? "",
      forma_cobro: initial?.forma_cobro ?? "Transferencia",
      observaciones: initial?.observaciones ?? "",
    },
  });

  const tipo = f.watch("tipo");
  const ivaPctStr = f.watch("iva_pct");
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

  useEffect(() => {
    if (!initial) {
      // ensure form rerenders totals via watch — nothing to do
    }
  }, [initial]);

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar" : "Nueva"} Factura de Servicio</DialogTitle>
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

        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar factura</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}