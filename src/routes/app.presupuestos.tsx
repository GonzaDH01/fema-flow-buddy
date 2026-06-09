import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Printer, FileDown, FileText, Search, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/app/presupuestos")({ component: Page });

type Estado = "Pendiente" | "Aprobado" | "Facturado" | "Anulado";
const ESTADOS: Estado[] = ["Pendiente", "Aprobado", "Facturado", "Anulado"];

type Cliente = {
  id: string; nombre: string; cuit: string | null; condicion_iva: string | null;
  domicilio: string | null; localidad: string | null;
};

type Item = {
  id?: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  alicuota_iva: number;
  subtotal: number;
};

type Presupuesto = {
  id: string; numero: string | null; fecha: string; fecha_vencimiento: string | null;
  cliente_id: string | null; cliente_nombre: string | null; cliente_cuit: string | null;
  cliente_domicilio: string | null; cliente_localidad: string | null; cliente_cond_iva: string | null;
  estado: string | null; descripcion: string | null;
  descuento_pct: number | null; descuento_monto: number | null;
  neto: number | null; iva_21: number | null; iva_105: number | null; total: number | null;
  observaciones: string | null; condicion_pago: string | null; consideraciones: string | null;
  anio: number | null;
};

const SERVICIOS_FRECUENTES = [
  { codigo: "00003", descripcion: "SERV. PICADO MAIZ/SORGO", iva: 10.5 },
  { codigo: "00009", descripcion: "SERV EMBOLSADO CON BOLSA DE 10'", iva: 10.5 },
  { codigo: "00010", descripcion: "SERV EMBOLSADO CON BOLSA DE 9'", iva: 10.5 },
  { codigo: "00005", descripcion: "SERV. PICADO ALFALFA", iva: 10.5 },
  { codigo: "00020", descripcion: "TRASLADO / FLETE", iva: 21 },
  { codigo: "00030", descripcion: "CRACKER", iva: 21 },
  { codigo: "00031", descripcion: "INOCULANTE", iva: 21 },
];

const EMPTY_ITEM: Item = { codigo: "", descripcion: "", cantidad: 1, precio_unitario: 0, alicuota_iva: 21, subtotal: 0 };

function nextNumero(prev: string | null | undefined): string {
  const last = prev ?? "0001-00000000";
  const [pv, n] = last.split("-");
  const next = String(Number(n) + 1).padStart(8, "0");
  return `${pv}-${next}`;
}

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"listado" | "nuevo">("listado");
  const [editing, setEditing] = useState<Presupuesto | null>(null);
  const [filter, setFilter] = useState("");

  const { data: presupuestos, isLoading } = useQuery({
    queryKey: ["fema_presupuestos", year],
    queryFn: async () => {
      const { data } = await supabase.from("fema_presupuestos").select("*").eq("anio", year).order("fecha", { ascending: false });
      return (data ?? []) as Presupuesto[];
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["fema_clientes_full"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_clientes").select("id,nombre,cuit,condicion_iva,domicilio,localidad").order("nombre");
      return (data ?? []) as Cliente[];
    },
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return presupuestos ?? [];
    return (presupuestos ?? []).filter((p) =>
      (p.cliente_nombre ?? "").toLowerCase().includes(q) ||
      (p.numero ?? "").toLowerCase().includes(q)
    );
  }, [presupuestos, filter]);

  const lastNumero = useMemo(() => {
    const nums = (presupuestos ?? []).map((p) => p.numero).filter(Boolean) as string[];
    return nums.sort().reverse()[0] ?? null;
  }, [presupuestos]);

  const handleNuevo = () => { setEditing(null); setTab("nuevo"); };
  const handleEdit = (p: Presupuesto) => { setEditing(p); setTab("nuevo"); };

  const onDelete = async (p: Presupuesto) => {
    await supabase.from("fema_presupuestos").delete().eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["fema_presupuestos"] });
    toast.success("Presupuesto eliminado");
  };

  const onExportExcel = () => {
    const rows = (presupuestos ?? []).map((p) => ({
      Numero: p.numero, Fecha: p.fecha, Vencimiento: p.fecha_vencimiento,
      Cliente: p.cliente_nombre, CUIT: p.cliente_cuit, Descripcion: p.descripcion,
      Neto: p.neto, IVA: (p.iva_21 ?? 0) + (p.iva_105 ?? 0), Total: p.total, Estado: p.estado,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Presupuestos");
    XLSX.writeFile(wb, `Presupuestos_${year}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Presupuestos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Emisión y seguimiento de presupuestos {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onExportExcel}><FileDown className="mr-1.5 h-4 w-4" /> Exportar Excel</Button>
          <Button onClick={handleNuevo}><Plus className="mr-1.5 h-4 w-4" /> Nuevo presupuesto</Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="nuevo">{editing ? "Editar presupuesto" : "Nuevo presupuesto"}</TabsTrigger>
        </TabsList>

        <TabsContent value="listado" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Presupuestos emitidos</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar cliente..." value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Vto.</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">No hay presupuestos</TableCell></TableRow>
                  ) : filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.numero ?? "—"}</TableCell>
                      <TableCell>{formatFecha(p.fecha)}</TableCell>
                      <TableCell>{p.fecha_vencimiento ? formatFecha(p.fecha_vencimiento) : "—"}</TableCell>
                      <TableCell className="font-medium">{p.cliente_nombre ?? "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{p.descripcion ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatPesos(p.neto)}</TableCell>
                      <TableCell className="text-right">{formatPesos((p.iva_21 ?? 0) + (p.iva_105 ?? 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPesos(p.total)}</TableCell>
                      <TableCell>
                        <Badge variant={p.estado === "Aprobado" ? "default" : p.estado === "Facturado" ? "secondary" : "outline"}>
                          {p.estado ?? "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Imprimir" onClick={() => printPresupuesto(p.id)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar" onClick={() => handleEdit(p)}>
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
                                <AlertDialogTitle>¿Eliminar presupuesto {p.numero}?</AlertDialogTitle>
                                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(p)}>Eliminar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nuevo" className="mt-4">
          <PresupuestoForm
            key={editing?.id ?? "new"}
            userId={user!.id}
            year={year}
            clientes={clientes ?? []}
            initial={editing}
            lastNumero={lastNumero}
            onSaved={() => { setEditing(null); setTab("listado"); qc.invalidateQueries({ queryKey: ["fema_presupuestos"] }); }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Form ============

function PresupuestoForm({
  userId, year, clientes, initial, lastNumero, onSaved,
}: {
  userId: string; year: number; clientes: Cliente[]; initial: Presupuesto | null;
  lastNumero: string | null; onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];

  const [numero, setNumero] = useState(initial?.numero ?? nextNumero(lastNumero));
  const [fecha, setFecha] = useState(initial?.fecha ?? today);
  const [fechaVto, setFechaVto] = useState(initial?.fecha_vencimiento ?? in7);
  const [estado, setEstado] = useState<Estado>((initial?.estado as Estado) ?? "Pendiente");
  const [clienteId, setClienteId] = useState<string>(initial?.cliente_id ?? "");
  const [clienteNombre, setClienteNombre] = useState(initial?.cliente_nombre ?? "");
  const [cuit, setCuit] = useState(initial?.cliente_cuit ?? "");
  const [condIva, setCondIva] = useState(initial?.cliente_cond_iva ?? "");
  const [domicilio, setDomicilio] = useState(initial?.cliente_domicilio ?? "");
  const [localidad, setLocalidad] = useState(initial?.cliente_localidad ?? "");
  const [descuentoPct, setDescuentoPct] = useState<number>(Number(initial?.descuento_pct ?? 0));
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");
  const [condicionPago, setCondicionPago] = useState(initial?.condicion_pago ?? "");
  const [consideraciones, setConsideraciones] = useState(initial?.consideraciones ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial) { setItems([]); return; }
    (async () => {
      const { data } = await supabase.from("fema_presupuesto_items").select("*").eq("presupuesto_id", initial.id).order("orden");
      setItems((data ?? []).map((d: any) => ({
        id: d.id, codigo: d.codigo ?? "", descripcion: d.descripcion, cantidad: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario), alicuota_iva: Number(d.alicuota_iva), subtotal: Number(d.subtotal),
      })));
    })();
  }, [initial]);

  const onSelectCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setClienteNombre(c.nombre);
      setCuit(c.cuit ?? "");
      setCondIva(c.condicion_iva ?? "");
      setDomicilio(c.domicilio ?? "");
      setLocalidad(c.localidad ?? "");
    }
  };

  const updateItem = (i: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const merged = { ...it, ...patch };
      merged.subtotal = Number(merged.cantidad || 0) * Number(merged.precio_unitario || 0);
      return merged;
    }));
  };
  const addItem = (it?: Partial<Item>) => setItems((prev) => [...prev, { ...EMPTY_ITEM, ...(it ?? {}) }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((a, b) => a + (b.subtotal || 0), 0);
  const descuentoMonto = subtotal * (Number(descuentoPct || 0) / 100);
  const neto = subtotal - descuentoMonto;
  const iva21 = items.filter((i) => Number(i.alicuota_iva) === 21).reduce((a, b) => a + b.subtotal, 0) * (1 - descuentoPct / 100) * 0.21;
  const iva105 = items.filter((i) => Number(i.alicuota_iva) === 10.5).reduce((a, b) => a + b.subtotal, 0) * (1 - descuentoPct / 100) * 0.105;
  const total = neto + iva21 + iva105;

  const save = async () => {
    if (!clienteNombre.trim()) { toast.error("Indicá el cliente"); return; }
    if (items.length === 0) { toast.error("Agregá al menos un ítem"); return; }
    setSaving(true);
    const payload = {
      user_id: userId, numero, fecha, fecha_vencimiento: fechaVto, anio: year,
      estado, cliente_id: clienteId || null, cliente_nombre: clienteNombre, cliente_cuit: cuit,
      cliente_domicilio: domicilio, cliente_localidad: localidad, cliente_cond_iva: condIva,
      descripcion: items.map((i) => i.descripcion).join(" · ").slice(0, 200),
      descuento_pct: descuentoPct, descuento_monto: descuentoMonto,
      neto, iva_21: iva21, iva_105: iva105, total,
      observaciones, condicion_pago: condicionPago, consideraciones,
    };

    let presupuestoId = initial?.id;
    if (initial) {
      const { error } = await supabase.from("fema_presupuestos").update(payload).eq("id", initial.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await supabase.from("fema_presupuesto_items").delete().eq("presupuesto_id", initial.id);
    } else {
      const { data, error } = await supabase.from("fema_presupuestos").insert(payload).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Error"); setSaving(false); return; }
      presupuestoId = data.id;
    }

    const itemsPayload = items.map((it, idx) => ({
      user_id: userId, presupuesto_id: presupuestoId!, codigo: it.codigo || null,
      descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario,
      alicuota_iva: it.alicuota_iva, subtotal: it.subtotal, orden: idx,
    }));
    if (itemsPayload.length > 0) {
      const { error } = await supabase.from("fema_presupuesto_items").insert(itemsPayload);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success("Presupuesto guardado");
    setSaving(false);
    onSaved();
  };

  const printPreview = () => window.print();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4 print:hidden">
        {/* Datos del presupuesto */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del presupuesto</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="N° Presupuesto"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>
            <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
            <Field label="Fecha Vto."><Input type="date" value={fechaVto} onChange={(e) => setFechaVto(e.target.value)} /></Field>
            <Field label="Estado">
              <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Cliente">
              <Select value={clienteId || "__none__"} onValueChange={(v) => v === "__none__" ? setClienteId("") : onSelectCliente(v)}>
                <SelectTrigger><SelectValue placeholder="— Seleccionar cliente registrado —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin cliente registrado —</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="O escribí el nombre del cliente">
              <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
            </Field>
            <Field label="CUIT"><Input value={cuit} onChange={(e) => setCuit(e.target.value)} /></Field>
            <Field label="Cond. IVA"><Input value={condIva} onChange={(e) => setCondIva(e.target.value)} /></Field>
            <Field label="Domicilio"><Input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} /></Field>
            <Field label="Localidad"><Input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></Field>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Ítems del presupuesto</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addItem()}><Plus className="mr-1.5 h-4 w-4" /> Agregar ítem</Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Cód.</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-20 text-right">Cant.</TableHead>
                    <TableHead className="w-28 text-right">P. Unit.</TableHead>
                    <TableHead className="w-20 text-right">IVA %</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Agregá ítems con los botones de abajo o con "+ Agregar ítem"
                    </TableCell></TableRow>
                  ) : items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell><Input className="h-8" value={it.codigo} onChange={(e) => updateItem(i, { codigo: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8" value={it.descripcion} onChange={(e) => updateItem(i, { descripcion: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={it.cantidad} onChange={(e) => updateItem(i, { cantidad: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={it.precio_unitario} onChange={(e) => updateItem(i, { precio_unitario: Number(e.target.value) })} /></TableCell>
                      <TableCell>
                        <Select value={String(it.alicuota_iva)} onValueChange={(v) => updateItem(i, { alicuota_iva: Number(v) })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="21">21%</SelectItem>
                            <SelectItem value="10.5">10,5%</SelectItem>
                            <SelectItem value="0">0%</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatPesos(it.subtotal)}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(i)}><X className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Servicios frecuentes</p>
              <div className="flex flex-wrap gap-2">
                {SERVICIOS_FRECUENTES.map((s) => (
                  <Button key={s.codigo} size="sm" variant="outline" onClick={() => addItem({ codigo: s.codigo, descripcion: s.descripcion, alicuota_iva: s.iva })}>
                    + {s.descripcion}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-y-1 text-sm md:grid-cols-[1fr_auto] md:gap-x-8">
              <div className="text-right text-muted-foreground">T. Neto:</div>
              <div className="text-right font-medium">{formatPesos(subtotal)}</div>
              <div className="text-right text-muted-foreground">% Desc:</div>
              <div className="flex items-center justify-end gap-2">
                <Input className="h-8 w-20 text-right" type="number" step="0.01" value={descuentoPct} onChange={(e) => setDescuentoPct(Number(e.target.value))} />
                <span className="w-24 text-right">{formatPesos(descuentoMonto)}</span>
              </div>
              <div className="text-right text-muted-foreground">IVA 10,5%:</div>
              <div className="text-right">{formatPesos(iva105)}</div>
              <div className="text-right text-muted-foreground">IVA 21%:</div>
              <div className="text-right">{formatPesos(iva21)}</div>
              <div className="text-right font-semibold">TOTAL:</div>
              <div className="text-right text-lg font-bold">{formatPesos(total)}</div>
            </div>
          </CardContent>
        </Card>

        {/* Observaciones */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones y condiciones</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Observaciones para el cliente">
              <Textarea rows={3} placeholder="Ej: Cracker incluido + inoculante. Traslado HASTA 2km." value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </Field>
            <Field label="Condición de pago">
              <Input placeholder="Ej: 8 valores (e-cheq) Feb-Mar-Abr-May-Jun-Jul-Ago-Sep" value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)} />
            </Field>
            <Field label="Consideraciones adicionales">
              <Textarea rows={2} placeholder="Ej: Superando las 200 ha → 3% desc. pagando en 9 valores e-cheq" value={consideraciones} onChange={(e) => setConsideraciones(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Right: preview + actions */}
      <div className="space-y-3 print:hidden">
        <div className="lg:sticky lg:top-4 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Vista previa</CardTitle></CardHeader>
            <CardContent>
              <div className="scale-[0.82] origin-top-left -mb-16 w-[120%]">
                <PresupuestoPDF data={{
                  numero, fecha, fechaVto, clienteNombre, cuit, condIva, domicilio, localidad,
                  items, observaciones, condicionPago, consideraciones,
                  descuentoPct, descuentoMonto, neto, iva21, iva105, total, subtotal,
                }} />
              </div>
            </CardContent>
          </Card>
          <Button className="w-full" onClick={save} disabled={saving}>
            <FileText className="mr-1.5 h-4 w-4" /> {saving ? "Guardando..." : "Guardar presupuesto"}
          </Button>
          <Button className="w-full" variant="secondary" onClick={printPreview}>
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Hidden printable */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:text-black">
        <PresupuestoPDF data={{
          numero, fecha, fechaVto, clienteNombre, cuit, condIva, domicilio, localidad,
          items, observaciones, condicionPago, consideraciones,
          descuentoPct, descuentoMonto, neto, iva21, iva105, total, subtotal,
        }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ============ Printable PDF layout ============

type PdfData = {
  numero: string; fecha: string; fechaVto: string;
  clienteNombre: string; cuit: string; condIva: string; domicilio: string; localidad: string;
  items: Item[];
  observaciones: string; condicionPago: string; consideraciones: string;
  descuentoPct: number; descuentoMonto: number; subtotal: number; neto: number;
  iva21: number; iva105: number; total: number;
};

function PresupuestoPDF({ data }: { data: PdfData }) {
  return (
    <div className="bg-white p-6 text-[11px] text-black" style={{ minHeight: "auto" }}>
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-lg font-bold">FEMA AGRONEGOCIOS S.A.S.</div>
          <div className="text-[10px] leading-tight">
            Belgrano 135 — San Guillermo — CP 2347 · 0356 252-5255<br />
            femaagronegocios@gmail.com<br />
            RESPONSABLE INSCRIPTO
          </div>
        </div>
        <div className="ml-4 border border-black px-4 py-2 text-center">
          <div className="text-sm font-bold">PRESUPUESTO</div>
          <div className="mt-1 text-[10px] text-left">
            <div><span className="font-semibold">N°:</span> {data.numero}</div>
            <div><span className="font-semibold">Fecha:</span> {formatFecha(data.fecha)}</div>
            <div><span className="font-semibold">Vto.:</span> {data.fechaVto ? formatFecha(data.fechaVto) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 border border-black p-2 text-[10px]">
        <div className="grid grid-cols-[80px_1fr] gap-x-2">
          <span className="font-semibold">Cliente:</span><span>{data.clienteNombre || "—"}</span>
          <span className="font-semibold">Domicilio:</span><span>{data.domicilio || "—"}</span>
          <span className="font-semibold">Localidad:</span><span>{data.localidad || "—"}</span>
          <span className="font-semibold">CUIT:</span><span>{data.cuit || "—"} &nbsp;&nbsp; <span className="font-semibold">Cond. IVA:</span> {data.condIva || "—"}</span>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black bg-gray-100">
            <th className="border-r border-black px-2 py-1 text-left">CÓD.</th>
            <th className="border-r border-black px-2 py-1 text-left">DESCRIPCIÓN</th>
            <th className="border-r border-black px-2 py-1 text-right">CANT.</th>
            <th className="border-r border-black px-2 py-1 text-right">P. UNIT.</th>
            <th className="px-2 py-1 text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-500">Sin ítems</td></tr>
          ) : data.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="border-r border-gray-300 px-2 py-1">{it.codigo}</td>
              <td className="border-r border-gray-300 px-2 py-1">{it.descripcion}</td>
              <td className="border-r border-gray-300 px-2 py-1 text-right">{it.cantidad}</td>
              <td className="border-r border-gray-300 px-2 py-1 text-right">{formatPesos(it.precio_unitario)}</td>
              <td className="px-2 py-1 text-right">{formatPesos(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-[1fr_220px] gap-3">
        <div className="border border-black p-2 text-[10px]">
          <div className="font-semibold">OBSERVACIONES:</div>
          <div className="whitespace-pre-wrap">{data.observaciones || "—"}</div>
          {data.condicionPago && <div className="mt-1">{data.condicionPago}</div>}
          {data.consideraciones && <div className="mt-1">{data.consideraciones}</div>}
        </div>
        <div className="border border-black text-[10px]">
          <Row k="% Desc:" v={`${data.descuentoPct.toFixed(2)}%`} />
          <Row k="Descuento:" v={formatPesos(data.descuentoMonto)} />
          <Row k="T. Neto:" v={formatPesos(data.neto)} />
          <Row k="I.V.A. 21%:" v={formatPesos(data.iva21)} />
          <Row k="I.V.A. 10,5%:" v={formatPesos(data.iva105)} />
          <div className="flex justify-between border-t-2 border-black bg-gray-100 px-2 py-1 font-bold">
            <span>Total:</span><span>{formatPesos(data.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b border-gray-300 px-2 py-0.5"><span>{k}</span><span>{v}</span></div>;
}

// ============ Print existing record ============

async function printPresupuesto(id: string) {
  const { data: p } = await supabase.from("fema_presupuestos").select("*").eq("id", id).single();
  const { data: its } = await supabase.from("fema_presupuesto_items").select("*").eq("presupuesto_id", id).order("orden");
  if (!p) return;
  const items = (its ?? []) as any[];
  const html = renderPrintHTML(p as Presupuesto, items);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { toast.error("Bloqueado por el navegador"); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 250);
}

function renderPrintHTML(p: Presupuesto, items: any[]) {
  const fmt = (n: number) => formatPesos(n);
  const fdate = (d: string | null) => d ? formatFecha(d) : "—";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${p.numero ?? "Presupuesto"}</title>
<style>
  body { font-family: Arial, sans-serif; color: #000; margin: 24px; font-size: 12px; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .hdr h1 { margin: 0; font-size: 16px; }
  .box { border: 1px solid #000; padding: 6px; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
  th, td { border: 1px solid #888; padding: 4px 6px; }
  th { background: #eee; text-align: left; }
  .right { text-align: right; }
  .totals { width: 240px; float: right; margin-top: 10px; border: 1px solid #000; font-size: 11px; }
  .totals .r { display: flex; justify-content: space-between; padding: 3px 6px; border-bottom: 1px solid #ccc; }
  .totals .t { font-weight: bold; background: #eee; border-top: 2px solid #000; border-bottom: none; }
  .obs { border: 1px solid #000; padding: 6px; margin-top: 10px; font-size: 11px; max-width: 460px; }
  .quote { border: 1px solid #000; padding: 6px 12px; text-align: center; }
</style></head><body>
<div class="hdr">
  <div>
    <h1>FEMA AGRONEGOCIOS S.A.S.</h1>
    <div>Belgrano 135 — San Guillermo — CP 2347 · 0356 252-5255</div>
    <div>femaagronegocios@gmail.com</div>
    <div>RESPONSABLE INSCRIPTO</div>
  </div>
  <div class="quote">
    <div style="font-weight:bold">PRESUPUESTO</div>
    <div style="text-align:left;margin-top:6px">
      <div><b>N°:</b> ${p.numero ?? "—"}</div>
      <div><b>Fecha:</b> ${fdate(p.fecha)}</div>
      <div><b>Vto.:</b> ${fdate(p.fecha_vencimiento)}</div>
    </div>
  </div>
</div>
<div class="box">
  <div><b>Cliente:</b> ${p.cliente_nombre ?? "—"}</div>
  <div><b>Domicilio:</b> ${p.cliente_domicilio ?? "—"}</div>
  <div><b>Localidad:</b> ${p.cliente_localidad ?? "—"}</div>
  <div><b>CUIT:</b> ${p.cliente_cuit ?? "—"} &nbsp;&nbsp; <b>Cond. IVA:</b> ${p.cliente_cond_iva ?? "—"}</div>
</div>
<table>
  <thead><tr><th>Cód.</th><th>Descripción</th><th class="right">Cant.</th><th class="right">P. Unit.</th><th class="right">Total</th></tr></thead>
  <tbody>
    ${items.length === 0 ? `<tr><td colspan="5" style="text-align:center;color:#888">Sin ítems</td></tr>` :
      items.map((i) => `<tr><td>${i.codigo ?? ""}</td><td>${i.descripcion}</td><td class="right">${i.cantidad}</td><td class="right">${fmt(Number(i.precio_unitario))}</td><td class="right">${fmt(Number(i.subtotal))}</td></tr>`).join("")}
  </tbody>
</table>
<div style="overflow:hidden">
  <div class="totals">
    <div class="r"><span>% Desc:</span><span>${Number(p.descuento_pct ?? 0).toFixed(2)}%</span></div>
    <div class="r"><span>Descuento:</span><span>${fmt(Number(p.descuento_monto ?? 0))}</span></div>
    <div class="r"><span>T. Neto:</span><span>${fmt(Number(p.neto ?? 0))}</span></div>
    <div class="r"><span>I.V.A. 21%:</span><span>${fmt(Number(p.iva_21 ?? 0))}</span></div>
    <div class="r"><span>I.V.A. 10,5%:</span><span>${fmt(Number(p.iva_105 ?? 0))}</span></div>
    <div class="r t"><span>Total:</span><span>${fmt(Number(p.total ?? 0))}</span></div>
  </div>
  <div class="obs">
    <b>OBSERVACIONES:</b><br>
    ${(p.observaciones ?? "—").replace(/\n/g, "<br>")}<br>
    ${p.condicion_pago ?? ""}<br>
    ${p.consideraciones ?? ""}
  </div>
</div>
</body></html>`;
}
