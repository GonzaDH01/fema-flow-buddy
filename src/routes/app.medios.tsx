import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Pencil, Trash2, ArrowRight, CheckCircle2, FileText, ShoppingCart, Send, Edit3 } from "lucide-react";

export const Route = createFileRoute("/app/medios")({ component: Page });

type Mov = {
  id: string; user_id: string;
  instrumento: "echeq"|"cheque_fisico"|"transferencia"|"cesion"|"efectivo"|"otro";
  direccion: "cobro"|"pago";
  tipo_movimiento: "cobro_cliente"|"pago_proveedor"|"ceder_echeq"|"libre";
  fecha_emision: string; vencimiento: string | null;
  numero: string | null; banco: string | null; contraparte: string | null;
  monto: number;
  estado: "en_cartera"|"cobrado"|"pagado"|"cedido"|"vencido"|"anulado";
  factura_venta_id: string | null; factura_compra_id: string | null;
  echeq_origen_id: string | null;
  observaciones: string | null;
  anio: number; mes: number;
};

const sb = supabase as any;

const INSTRUMENT_LABEL: Record<string, string> = {
  echeq: "Echeq", cheque_fisico: "Cheque físico", transferencia: "Transferencia",
  cesion: "Cesión echeq", efectivo: "Efectivo", otro: "Otro",
};
const ESTADO_VARIANT: Record<string, string> = {
  en_cartera: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cobrado: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pagado: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cedido: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  vencido: "bg-red-500/15 text-red-400 border-red-500/30",
  anulado: "bg-muted text-muted-foreground border-border",
};
const ESTADO_LABEL: Record<string, string> = {
  en_cartera: "En cartera", cobrado: "Cobrado", pagado: "Pagado",
  cedido: "Cedido", vencido: "Vencido", anulado: "Anulado",
};

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [tab, setTab] = useState("todos");
  const [mesFiltro, setMesFiltro] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [openMov, setOpenMov] = useState(false);
  const [editMov, setEditMov] = useState<Mov | null>(null);

  const movsQ = useQuery({
    queryKey: ["fema_movimientos_pago", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_movimientos_pago")
        .select("*").eq("user_id", user!.id).eq("anio", year)
        .order("fecha_emision", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mov[];
    },
  });

  const facturasVentaQ = useQuery({
    queryKey: ["fema_facturas_venta_pendientes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await sb.from("fema_facturas_venta")
        .select("id,numero,fecha,total,cliente_id,trabajo")
        .eq("user_id", user!.id).order("fecha", { ascending: false }).limit(100);
      return (data ?? []) as any[];
    },
  });
  const facturasCompraQ = useQuery({
    queryKey: ["fema_facturas_compra_pendientes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await sb.from("fema_facturas_compra")
        .select("id,numero,fecha,total,proveedor")
        .eq("user_id", user!.id).order("fecha", { ascending: false }).limit(100);
      return (data ?? []) as any[];
    },
  });

  const movs = movsQ.data ?? [];

  const totalCobros = useMemo(
    () => movs.filter(m => m.direccion === "cobro").reduce((a, m) => a + Number(m.monto), 0),
    [movs]);
  const totalPagos = useMemo(
    () => movs.filter(m => m.direccion === "pago").reduce((a, m) => a + Number(m.monto), 0),
    [movs]);
  const enCartera = useMemo(
    () => movs.filter(m => m.estado === "en_cartera"),
    [movs]);
  const vencidosSinCobrar = useMemo(() => {
    const hoy = new Date().toISOString().split("T")[0];
    return movs.filter(m => m.estado === "en_cartera" && m.vencimiento && m.vencimiento < hoy);
  }, [movs]);

  const filtrar = (filtro: (m: Mov) => boolean) => {
    return movs.filter(m => {
      if (!filtro(m)) return false;
      if (mesFiltro !== "todos" && m.mes !== Number(mesFiltro)) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (![m.contraparte, m.numero, m.banco, m.observaciones].some(v => (v ?? "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  };

  const filas = {
    todos: filtrar(() => true),
    echeqs: filtrar(m => m.instrumento === "echeq"),
    cheques: filtrar(m => m.instrumento === "cheque_fisico"),
    transferencias: filtrar(m => m.instrumento === "transferencia"),
    cesiones: filtrar(m => m.instrumento === "cesion"),
  };

  const cobrar = async (m: Mov) => {
    const { error } = await sb.from("fema_movimientos_pago")
      .update({ estado: m.direccion === "cobro" ? "cobrado" : "pagado" }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Estado actualizado");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
  };

  const ceder = async (m: Mov) => {
    const proveedor = window.prompt("Proveedor / beneficiario al que se cede el echeq:");
    if (!proveedor) return;
    const { error } = await sb.from("fema_movimientos_pago")
      .update({ estado: "cedido", observaciones: `Cedido a ${proveedor}` }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    await sb.from("fema_movimientos_pago").insert({
      user_id: user!.id, instrumento: "cesion", direccion: "pago",
      tipo_movimiento: "ceder_echeq", fecha_emision: new Date().toISOString().split("T")[0],
      vencimiento: m.vencimiento, numero: m.numero, banco: m.banco, contraparte: proveedor,
      monto: m.monto, estado: "pagado", echeq_origen_id: m.id,
      observaciones: `Cesión de echeq Nº ${m.numero ?? ""}`,
    });
    toast.success("Echeq cedido");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
  };

  const eliminar = async (m: Mov) => {
    if (!confirm("¿Eliminar movimiento?")) return;
    await sb.from("fema_movimientos_pago").delete().eq("id", m.id);
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    toast.success("Eliminado");
  };

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(movs.map(m => ({
      Instrumento: INSTRUMENT_LABEL[m.instrumento], Dirección: m.direccion,
      "Fecha emisión": m.fecha_emision, Vencimiento: m.vencimiento,
      Contraparte: m.contraparte, "Nº": m.numero, Banco: m.banco,
      Monto: m.monto, Estado: ESTADO_LABEL[m.estado], Observaciones: m.observaciones,
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Medios de pago");
    XLSX.writeFile(wb, `FEMA_medios_${year}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Medios de Pago</h1>
          <p className="text-sm text-muted-foreground">
            Registro de transferencias, echeqs, cheques físicos y cesiones · {year}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportar}><Download className="w-4 h-4 mr-2" />Exportar Excel</Button>
          <Button onClick={() => { setEditMov(null); setOpenMov(true); }}>
            <Plus className="w-4 h-4 mr-2" />Registrar movimiento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total cobros registrados" value={formatPesos(totalCobros)}
          hint="Echeqs + cheques + transf." tone="emerald" />
        <KpiCard label="Total pagos registrados" value={formatPesos(totalPagos)}
          hint="A proveedores" tone="rose" />
        <KpiCard label="En cartera" value={formatPesos(enCartera.reduce((a, m) => a + Number(m.monto), 0))}
          hint={`${enCartera.length} documentos`} tone="blue" />
        <KpiCard label="Vencidos sin cobrar" value={String(vencidosSinCobrar.length)}
          hint={formatPesos(vencidosSinCobrar.reduce((a, m) => a + Number(m.monto), 0))} tone="amber" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="echeqs">Echeqs</TabsTrigger>
          <TabsTrigger value="cheques">Cheques físicos</TabsTrigger>
          <TabsTrigger value="transferencias">Transferencias</TabsTrigger>
          <TabsTrigger value="cesiones">Cesiones</TabsTrigger>
        </TabsList>

        {(["todos","echeqs","cheques","transferencias","cesiones"] as const).map(k => (
          <TabsContent key={k} value={k}>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {k === "todos" ? "Todos los movimientos"
                      : k === "echeqs" ? "Echeqs"
                      : k === "cheques" ? "Cheques físicos"
                      : k === "transferencias" ? "Transferencias" : "Cesiones"}
                  </h3>
                  <div className="flex gap-2">
                    <Select value={mesFiltro} onValueChange={setMesFiltro}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos los meses</SelectItem>
                        {MESES_LARGOS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-[200px]" />
                  </div>
                </div>
                <MovsTable rows={filas[k]} onCobrar={cobrar} onCeder={ceder} onEdit={(m) => { setEditMov(m); setOpenMov(true); }} onDelete={eliminar} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Cartera de echeqs disponibles para ceder</h3>
            <span className="text-xs text-muted-foreground">Echeqs recibidos de clientes aún no usados para pagar proveedores</span>
          </div>
          <CarteraEcheqs rows={movs.filter(m => m.instrumento === "echeq" && m.direccion === "cobro" && m.estado === "en_cartera")} onCeder={ceder} />
        </CardContent>
      </Card>

      <Dialog open={openMov} onOpenChange={(v) => { if (!v) { setOpenMov(false); setEditMov(null); } }}>
        {openMov && (
          <MovimientoDialog
            initial={editMov}
            userId={user!.id} year={year}
            facturasVenta={facturasVentaQ.data ?? []}
            facturasCompra={facturasCompraQ.data ?? []}
            echeqsCartera={movs.filter(m => m.instrumento === "echeq" && m.direccion === "cobro" && m.estado === "en_cartera")}
            onClose={() => { setOpenMov(false); setEditMov(null); }}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] }); setOpenMov(false); setEditMov(null); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: "emerald"|"rose"|"blue"|"amber" }) {
  const color = tone === "emerald" ? "text-emerald-400"
    : tone === "rose" ? "text-rose-400"
    : tone === "blue" ? "text-blue-400" : "text-amber-400";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MovsTable({ rows, onCobrar, onCeder, onEdit, onDelete }: {
  rows: Mov[]; onCobrar: (m: Mov) => void; onCeder: (m: Mov) => void;
  onEdit: (m: Mov) => void; onDelete: (m: Mov) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
        <FileText className="w-10 h-10 mb-2 opacity-40" />
        No hay movimientos registrados
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Dirección</TableHead>
          <TableHead>Fecha emisión</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead>Origen / Destino</TableHead>
          <TableHead>Nº cheque / CBU / ref.</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(m => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{INSTRUMENT_LABEL[m.instrumento]}</TableCell>
            <TableCell>
              <Badge variant="outline" className={m.direccion === "cobro" ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"}>
                {m.direccion === "cobro" ? "Cobro" : "Pago"}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">{formatFecha(m.fecha_emision)}</TableCell>
            <TableCell className="text-xs">{m.vencimiento ? formatFecha(m.vencimiento) : "—"}</TableCell>
            <TableCell>{m.contraparte ?? "—"}</TableCell>
            <TableCell className="text-xs">{m.numero ?? "—"}</TableCell>
            <TableCell className="text-xs">{m.banco ?? "—"}</TableCell>
            <TableCell className="text-right font-mono">{formatPesos(m.monto)}</TableCell>
            <TableCell><Badge variant="outline" className={ESTADO_VARIANT[m.estado]}>{ESTADO_LABEL[m.estado]}</Badge></TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                {m.instrumento === "echeq" && m.direccion === "cobro" && m.estado === "en_cartera" && (
                  <Button size="sm" variant="outline" onClick={() => onCeder(m)}><ArrowRight className="w-3 h-3 mr-1" />Ceder</Button>
                )}
                {m.estado === "en_cartera" && (
                  <Button size="sm" variant="outline" onClick={() => onCobrar(m)} className="border-emerald-500/40 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3 mr-1" />{m.direccion === "cobro" ? "Cobrar" : "Pagar"}
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEdit(m)}><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(m)} className="text-rose-400"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CarteraEcheqs({ rows, onCeder }: { rows: Mov[]; onCeder: (m: Mov) => void }) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">No hay echeqs en cartera</div>;
  }
  const hoy = new Date();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nº echeq</TableHead>
          <TableHead>Recibido de</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(m => {
          const dias = m.vencimiento ? Math.round((new Date(m.vencimiento).getTime() - hoy.getTime()) / 86400000) : null;
          const venc = dias !== null && dias < 7;
          return (
            <TableRow key={m.id}>
              <TableCell className="font-mono text-xs">{m.numero ?? "—"}</TableCell>
              <TableCell>{m.contraparte ?? "—"}</TableCell>
              <TableCell>{m.banco ?? "—"}</TableCell>
              <TableCell className={`text-xs ${venc ? "text-amber-400" : ""}`}>
                {m.vencimiento ? `${formatFecha(m.vencimiento)} (${dias}d)` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-emerald-400">{formatPesos(m.monto)}</TableCell>
              <TableCell><Badge variant="outline" className={ESTADO_VARIANT.en_cartera}>En cartera</Badge></TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => onCeder(m)} className="border-amber-500/40 text-amber-400">
                  <ArrowRight className="w-3 h-3 mr-1" />Ceder a proveedor
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

type Tipo = "cobro_cliente"|"pago_proveedor"|"ceder_echeq"|"libre";

function MovimientoDialog({ initial, userId, year, facturasVenta, facturasCompra, echeqsCartera, onClose, onSaved }: {
  initial: Mov | null;
  userId: string; year: number;
  facturasVenta: any[]; facturasCompra: any[]; echeqsCartera: Mov[];
  onClose: () => void; onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>(initial?.tipo_movimiento ?? "cobro_cliente");
  const [busqFact, setBusqFact] = useState("");
  const [facturaSel, setFacturaSel] = useState<string | null>(initial?.factura_venta_id ?? initial?.factura_compra_id ?? null);

  // libre fields
  const [instrumento, setInstrumento] = useState<string>(initial?.instrumento ?? "echeq");
  const [direccion, setDireccion] = useState<string>(initial?.direccion ?? "cobro");
  const [fechaEmision, setFechaEmision] = useState(initial?.fecha_emision ?? new Date().toISOString().split("T")[0]);
  const [vencimiento, setVencimiento] = useState(initial?.vencimiento ?? "");
  const [numero, setNumero] = useState(initial?.numero ?? "");
  const [banco, setBanco] = useState(initial?.banco ?? "");
  const [contraparte, setContraparte] = useState(initial?.contraparte ?? "");
  const [monto, setMonto] = useState<number>(Number(initial?.monto ?? 0));
  const [estado, setEstado] = useState<string>(initial?.estado ?? "en_cartera");
  const [mes, setMes] = useState<number>(initial?.mes ?? (new Date().getMonth() + 1));
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");

  // ceder echeq
  const [echeqId, setEcheqId] = useState<string>(initial?.echeq_origen_id ?? "");
  const [proveedorCesion, setProveedorCesion] = useState("");
  const [facturaCompraCesion, setFacturaCompraCesion] = useState<string>("");

  useEffect(() => {
    if (tipo === "ceder_echeq" && echeqId) {
      const e = echeqsCartera.find(x => x.id === echeqId);
      if (e) { setMonto(Number(e.monto)); setVencimiento(e.vencimiento ?? ""); setNumero(e.numero ?? ""); setBanco(e.banco ?? ""); }
    }
  }, [echeqId, tipo, echeqsCartera]);

  const facturasFiltradas = useMemo(() => {
    const list = tipo === "cobro_cliente" ? facturasVenta : tipo === "pago_proveedor" ? facturasCompra : [];
    if (!busqFact) return list.slice(0, 6);
    const q = busqFact.toLowerCase();
    return list.filter(f => [f.numero, f.trabajo, f.proveedor].some((v: string) => (v ?? "").toLowerCase().includes(q))).slice(0, 6);
  }, [tipo, busqFact, facturasVenta, facturasCompra]);

  const guardar = async () => {
    try {
      if (tipo === "ceder_echeq") {
        if (!echeqId) { toast.error("Seleccioná un echeq"); return; }
        const e = echeqsCartera.find(x => x.id === echeqId)!;
        await sb.from("fema_movimientos_pago").update({ estado: "cedido" }).eq("id", echeqId);
        const { error } = await sb.from("fema_movimientos_pago").insert({
          user_id: userId, instrumento: "cesion", direccion: "pago",
          tipo_movimiento: "ceder_echeq", fecha_emision: new Date().toISOString().split("T")[0],
          vencimiento: e.vencimiento, numero: e.numero, banco: e.banco,
          contraparte: proveedorCesion || "Proveedor", monto: e.monto, estado: "pagado",
          echeq_origen_id: echeqId,
          factura_compra_id: facturaCompraCesion || null,
          observaciones: observaciones || `Cesión de echeq Nº ${e.numero ?? ""}`,
          anio: year, mes: new Date().getMonth() + 1,
        });
        if (error) throw error;
      } else if (tipo === "cobro_cliente" || tipo === "pago_proveedor") {
        const fact = (tipo === "cobro_cliente" ? facturasVenta : facturasCompra).find(f => f.id === facturaSel);
        const payload: any = {
          user_id: userId,
          instrumento: instrumento as any,
          direccion: tipo === "cobro_cliente" ? "cobro" : "pago",
          tipo_movimiento: tipo,
          fecha_emision: fechaEmision || new Date().toISOString().split("T")[0],
          vencimiento: vencimiento || null,
          numero: numero || null, banco: banco || null,
          contraparte: contraparte || (fact?.proveedor ?? null),
          monto: Number(monto || fact?.total || 0),
          estado, observaciones: observaciones || null,
          factura_venta_id: tipo === "cobro_cliente" ? facturaSel : null,
          factura_compra_id: tipo === "pago_proveedor" ? facturaSel : null,
          anio: year, mes,
        };
        const op = initial
          ? sb.from("fema_movimientos_pago").update(payload).eq("id", initial.id)
          : sb.from("fema_movimientos_pago").insert(payload);
        const { error } = await op;
        if (error) throw error;
      } else {
        // libre
        const payload: any = {
          user_id: userId, instrumento, direccion, tipo_movimiento: "libre",
          fecha_emision: fechaEmision, vencimiento: vencimiento || null,
          numero: numero || null, banco: banco || null, contraparte: contraparte || null,
          monto: Number(monto), estado, observaciones: observaciones || null,
          anio: year, mes,
        };
        const op = initial
          ? sb.from("fema_movimientos_pago").update(payload).eq("id", initial.id)
          : sb.from("fema_movimientos_pago").insert(payload);
        const { error } = await op;
        if (error) throw error;
      }
      toast.success("Movimiento guardado");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Registrar movimiento</DialogTitle>
        <DialogDescription>
          {tipo === "ceder_echeq" ? "Elegí el echeq en cartera y el proveedor destino"
            : tipo === "cobro_cliente" ? "Elegí la factura y cargá los echeqs de una vez"
            : tipo === "pago_proveedor" ? "Elegí la factura y registrá el pago"
            : "Movimiento sin vincular a comprobante"}
        </DialogDescription>
      </DialogHeader>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">¿Qué querés registrar?</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <TipoBtn icon={<FileText className="w-4 h-4" />} label="Cobro de cliente" sub="Facturas de servicio" active={tipo === "cobro_cliente"} onClick={() => setTipo("cobro_cliente")} />
          <TipoBtn icon={<ShoppingCart className="w-4 h-4" />} label="Pago a proveedor" sub="Facturas de compra" active={tipo === "pago_proveedor"} onClick={() => setTipo("pago_proveedor")} />
          <TipoBtn icon={<Send className="w-4 h-4" />} label="Ceder echeq" sub="Endosar a proveedor" active={tipo === "ceder_echeq"} onClick={() => setTipo("ceder_echeq")} />
          <TipoBtn icon={<Edit3 className="w-4 h-4" />} label="Libre" sub="Sin comprobante" active={tipo === "libre"} onClick={() => setTipo("libre")} />
        </div>
      </div>

      {(tipo === "cobro_cliente" || tipo === "pago_proveedor") && (
        <div className="space-y-3">
          <FormField label={tipo === "cobro_cliente" ? "Factura de cliente a cobrar" : "Factura de compra a pagar"}>
            <Input placeholder="Buscar por cliente / proveedor / Nº factura..." value={busqFact} onChange={(e) => setBusqFact(e.target.value)} />
          </FormField>
          <div className="max-h-48 overflow-auto border rounded-md divide-y">
            {facturasFiltradas.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sin facturas</div>}
            {facturasFiltradas.map(f => (
              <button key={f.id} type="button"
                onClick={() => { setFacturaSel(f.id); setMonto(Number(f.total)); setContraparte(f.proveedor ?? ""); }}
                className={`w-full text-left p-3 hover:bg-muted/50 ${facturaSel === f.id ? "bg-muted/60" : ""}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm">{f.proveedor ?? "Cliente"}</div>
                    <div className="text-xs text-muted-foreground">Fact. {f.numero ?? "s/n"} · {formatFecha(f.fecha)} {f.trabajo ? `· ${f.trabajo}` : ""}</div>
                  </div>
                  <div className="font-mono text-emerald-400 text-sm">{formatPesos(f.total)}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Instrumento">
              <Select value={instrumento} onValueChange={setInstrumento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="echeq">Echeq</SelectItem>
                  <SelectItem value="cheque_fisico">Cheque físico</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Monto"><Input type="number" value={monto} onChange={(e) => setMonto(Number(e.target.value))} /></FormField>
            <FormField label="Nº cheque / echeq / ref."><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></FormField>
            <FormField label="Banco"><Input value={banco} onChange={(e) => setBanco(e.target.value)} /></FormField>
            <FormField label="Fecha emisión"><Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} /></FormField>
            <FormField label="Vencimiento"><Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></FormField>
        </div>
      )}

      {tipo === "ceder_echeq" && (
        <div className="space-y-3 border border-amber-500/30 bg-amber-500/5 rounded-md p-4">
          <div className="text-xs uppercase text-amber-400 font-semibold tracking-wide">Cesión de echeq en cartera → proveedor</div>
          <FormField label="Echeq a ceder (de cartera)">
            <Select value={echeqId} onValueChange={setEcheqId}>
              <SelectTrigger><SelectValue placeholder="— Seleccionar echeq —" /></SelectTrigger>
              <SelectContent>
                {echeqsCartera.length === 0 && <div className="p-2 text-xs text-muted-foreground">Sin echeqs en cartera</div>}
                {echeqsCartera.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    Nº {e.numero ?? "s/n"} · {e.contraparte ?? ""} · {formatPesos(e.monto)} · vto {formatFecha(e.vencimiento)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Proveedor / beneficiario"><Input placeholder="Nombre del proveedor" value={proveedorCesion} onChange={(e) => setProveedorCesion(e.target.value)} /></FormField>
          <FormField label="Factura de compra vinculada (opcional)">
            <Select value={facturaCompraCesion} onValueChange={setFacturaCompraCesion}>
              <SelectTrigger><SelectValue placeholder="— Sin vincular —" /></SelectTrigger>
              <SelectContent>
                {facturasCompra.slice(0, 30).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.proveedor ?? "Proveedor"} · {f.numero ?? "s/n"} · {formatPesos(f.total)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Observaciones"><Textarea placeholder="Ej: Cesión por pago gasoil YPF..." value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></FormField>
          <p className="text-xs text-muted-foreground">El echeq pasará a estado "Cedido" automáticamente.</p>
        </div>
      )}

      {tipo === "libre" && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Instrumento">
            <Select value={instrumento} onValueChange={setInstrumento}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="echeq">Echeq</SelectItem>
                <SelectItem value="cheque_fisico">Cheque físico</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Dirección">
            <Select value={direccion} onValueChange={setDireccion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cobro">Recibido (cobro)</SelectItem>
                <SelectItem value="pago">Emitido (pago)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Fecha emisión"><Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} /></FormField>
          <FormField label="Vencimiento"><Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></FormField>
          <FormField label="Nº cheque / echeq"><Input placeholder="Ej: 00123456" value={numero} onChange={(e) => setNumero(e.target.value)} /></FormField>
          <FormField label="Banco"><Input value={banco} onChange={(e) => setBanco(e.target.value)} /></FormField>
          <FormField label="Contraparte (cliente / proveedor)"><Input placeholder="Nombre" value={contraparte} onChange={(e) => setContraparte(e.target.value)} /></FormField>
          <FormField label="Estado">
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Monto ($)"><Input type="number" value={monto} onChange={(e) => setMonto(Number(e.target.value))} /></FormField>
          <FormField label="Mes">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_LARGOS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <div className="col-span-2">
            <FormField label="Observaciones"><Textarea placeholder="Notas..." value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></FormField>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar}>Guardar movimiento</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TipoBtn({ icon, label, sub, active, onClick }: { icon: React.ReactNode; label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-md border p-3 transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
      <div className="flex items-center gap-2 font-medium text-sm">{icon}{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </button>
  );
}