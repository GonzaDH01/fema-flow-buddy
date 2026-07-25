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
import { Plus, Download, Pencil, Trash2, ArrowRight, CheckCircle2, FileText, ShoppingCart, Send, Edit3, Receipt, Printer } from "lucide-react";
import { Sparkles, X as XIcon } from "lucide-react";
import {
  FemaDocHeader, FemaClientBox, FemaWatermark,
  femaPrintCSS, femaHeaderHTML, femaClientHTML, femaWatermarkHTML,
  absoluteAssetUrl, femaLogoUrl, femaWatermarkUrl,
} from "@/lib/fema-doc";

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

// Reconcilia el estado de una factura (venta/compra) según los movimientos activos asociados.
// Si la suma cubre el total → marca cobrada/pagada; si no → vuelve a pendiente.
async function reconciliarFactura(facturaId: string | null | undefined, tipo: "venta" | "compra") {
  if (!facturaId) return;
  const tabla = tipo === "venta" ? "fema_facturas_venta" : "fema_facturas_compra";
  const col = tipo === "venta" ? "factura_venta_id" : "factura_compra_id";
  const estadoOk = tipo === "venta" ? "cobrada" : "pagada";
  // Solo cuentan como pago confirmado: cobrado (venta) / pagado o cedido (compra).
  // En_cartera = pendiente de cobro (no marca factura como cobrada).
  const estadosConfirmados = tipo === "venta" ? ["cobrado"] : ["pagado", "cedido"];
  const { data: fact } = await sb.from(tabla).select("id,total,estado").eq("id", facturaId).maybeSingle();
  if (!fact) return;
  const { data: movs } = await sb.from("fema_movimientos_pago")
    .select("monto,estado").eq(col, facturaId);
  const activos = (movs ?? []).filter((m: any) => estadosConfirmados.includes(m.estado));
  const cubierto = activos.reduce((s: number, m: any) => s + Number(m.monto || 0), 0);
  const totalFac = Number(fact.total || 0);
  const nuevo = cubierto >= totalFac - 0.01 && totalFac > 0 ? estadoOk : "pendiente";
  if (fact.estado !== nuevo) {
    await sb.from(tabla).update({ estado: nuevo }).eq("id", facturaId);
  }
}

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
  const [ordenar, setOrdenar] = useState<string>("recientes");
  const [openMov, setOpenMov] = useState(false);
  const [editMov, setEditMov] = useState<Mov | null>(null);
  const [reciboMov, setReciboMov] = useState<Mov | null>(null);
  const [openCta, setOpenCta] = useState(false);
  const [editCta, setEditCta] = useState<any | null>(null);

  const ctasQ = useQuery({
    queryKey: ["fema_cuentas_bancarias", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_cuentas_bancarias")
        .select("*").order("banco", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const cuentas = ctasQ.data ?? [];
  const totalSaldoBancos = cuentas.reduce((s: number, c: any) => s + Number(c.saldo || 0), 0);

  const eliminarCta = async (id: string) => {
    if (!confirm("¿Eliminar cuenta bancaria?")) return;
    const { error } = await sb.from("fema_cuentas_bancarias").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta eliminada");
    qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
  };

  const movsQ = useQuery({
    queryKey: ["fema_movimientos_pago", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_movimientos_pago")
        .select("*").eq("anio", year)
        .order("fecha_emision", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mov[];
    },
  });

  const facturasVentaQ = useQuery({
    queryKey: ["fema_facturas_venta_pendientes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_facturas_venta")
        .select("id,numero,fecha,total,cliente_id,trabajo,estado")
        .eq("estado", "pendiente")
        .order("fecha", { ascending: false }).limit(200);
      if (error) throw error;
      const clienteIds = [...new Set((data ?? []).map((f: any) => f.cliente_id).filter(Boolean))];
      const clientesPorId = new Map<string, string>();
      if (clienteIds.length > 0) {
        const { data: clientes, error: clientesError } = await sb.from("fema_clientes")
          .select("id,nombre")
          .in("id", clienteIds);
        if (clientesError) throw clientesError;
        for (const c of clientes ?? []) clientesPorId.set(c.id, c.nombre);
      }
      return (data ?? []).map((f: any) => ({
        ...f,
        proveedor: clientesPorId.get(f.cliente_id) ?? "Cliente",
      })) as any[];
    },
  });
  const facturasCompraQ = useQuery({
    queryKey: ["fema_facturas_compra_pendientes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_facturas_compra")
        .select("id,numero,fecha,total,proveedor_id,descripcion,producto,estado")
        .eq("estado", "pendiente")
        .order("fecha", { ascending: false }).limit(200);
      if (error) throw error;
      const proveedorIds = [...new Set((data ?? []).map((f: any) => f.proveedor_id).filter(Boolean))];
      const proveedoresPorId = new Map<string, string>();
      if (proveedorIds.length > 0) {
        const { data: proveedores, error: proveedoresError } = await sb.from("fema_proveedores")
          .select("id,nombre")
          .in("id", proveedorIds);
        if (proveedoresError) throw proveedoresError;
        for (const p of proveedores ?? []) proveedoresPorId.set(p.id, p.nombre);
      }
      return (data ?? []).map((f: any) => ({
        ...f,
        proveedor: proveedoresPorId.get(f.proveedor_id) ?? "Proveedor",
        trabajo: f.descripcion ?? f.producto ?? "",
      })) as any[];
    },
  });

  const movs = movsQ.data ?? [];

  // Facturas ya cubiertas (suma de movimientos activos >= total) deben ocultarse del selector.
  const ACTIVOS_FAC = new Set(["en_cartera", "cobrado", "pagado", "cedido"]);
  const cubiertoFV = new Map<string, number>();
  const cubiertoFC = new Map<string, number>();
  for (const m of movs) {
    if (!ACTIVOS_FAC.has(m.estado)) continue;
    if (m.direccion === "cobro" && m.factura_venta_id) {
      cubiertoFV.set(m.factura_venta_id, (cubiertoFV.get(m.factura_venta_id) ?? 0) + Number(m.monto));
    }
    if (m.direccion === "pago" && m.factura_compra_id) {
      cubiertoFC.set(m.factura_compra_id, (cubiertoFC.get(m.factura_compra_id) ?? 0) + Number(m.monto));
    }
  }
  const facturasVentaPend = (facturasVentaQ.data ?? []).filter((f: any) => (cubiertoFV.get(f.id) ?? 0) < Number(f.total) - 0.01);
  const facturasCompraPend = (facturasCompraQ.data ?? []).filter((f: any) => (cubiertoFC.get(f.id) ?? 0) < Number(f.total) - 0.01);

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
    const filtrados = movs.filter(m => {
      if (!filtro(m)) return false;
      if (mesFiltro !== "todos" && m.mes !== Number(mesFiltro)) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (![m.contraparte, m.numero, m.banco, m.observaciones].some(v => (v ?? "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
    const hoyStr = new Date().toISOString().split("T")[0];
    const cmp = (a: string | null | undefined, b: string | null | undefined, asc: boolean) => {
      const av = a ?? ""; const bv = b ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    };
    if (ordenar === "pago_prox") {
      return [...filtrados].sort((a, b) => {
        const av = a.vencimiento ?? "";
        const bv = b.vencimiento ?? "";
        const aFut = av && av >= hoyStr ? 0 : 1;
        const bFut = bv && bv >= hoyStr ? 0 : 1;
        if (aFut !== bFut) return aFut - bFut;
        return cmp(av, bv, true);
      });
    }
    if (ordenar === "pago_asc") return [...filtrados].sort((a, b) => cmp(a.vencimiento, b.vencimiento, true));
    if (ordenar === "pago_desc") return [...filtrados].sort((a, b) => cmp(a.vencimiento, b.vencimiento, false));
    if (ordenar === "emision_asc") return [...filtrados].sort((a, b) => cmp(a.fecha_emision, b.fecha_emision, true));
    return [...filtrados].sort((a, b) => cmp(a.fecha_emision, b.fecha_emision, false));
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
    await reconciliarFactura(m.factura_venta_id, "venta");
    await reconciliarFactura(m.factura_compra_id, "compra");
    toast.success("Estado actualizado");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra_pendientes"] });
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
    await reconciliarFactura(m.factura_venta_id, "venta");
    toast.success("Echeq cedido");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
  };

  const eliminar = async (m: Mov) => {
    if (!confirm("¿Eliminar movimiento?")) return;
    // Si es una cesión, devolver el echeq de origen a cartera
    if (m.instrumento === "cesion" && m.echeq_origen_id) {
      await sb.from("fema_movimientos_pago")
        .update({ estado: "en_cartera", observaciones: null })
        .eq("id", m.echeq_origen_id);
    }
    await sb.from("fema_movimientos_pago").delete().eq("id", m.id);
    await reconciliarFactura(m.factura_venta_id, "venta");
    await reconciliarFactura(m.factura_compra_id, "compra");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra_pendientes"] });
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Saldos bancarios disponibles</h3>
              <span className="text-xs text-muted-foreground">
                Saldo total: <b>{formatPesos(totalSaldoBancos)}</b> · Usado para abonar facturas por transferencia
              </span>
            </div>
            <Button size="sm" onClick={() => { setEditCta(null); setOpenCta(true); }}>
              <Plus className="w-4 h-4 mr-2" />Agregar cuenta
            </Button>
          </div>
          {cuentas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sin cuentas cargadas. Agregá una para llevar el control del saldo disponible.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Alias / Titular</TableHead>
                  <TableHead>Nº Cuenta / CBU</TableHead>
                  <TableHead className="text-right">Saldo disponible</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuentas.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.banco}</TableCell>
                    <TableCell>{c.alias || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {c.numero_cuenta || "—"}
                      {c.cbu ? <><br /><span className="text-muted-foreground">CBU: {c.cbu}</span></> : null}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPesos(Number(c.saldo || 0))}</TableCell>
                    <TableCell>
                      <Badge variant={c.activa ? "default" : "secondary"}>{c.activa ? "Activa" : "Inactiva"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditCta(c); setOpenCta(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => eliminarCta(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                    <Select value={ordenar} onValueChange={setOrdenar}>
                      <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recientes">Emisión: más recientes</SelectItem>
                        <SelectItem value="emision_asc">Emisión: más antiguos</SelectItem>
                        <SelectItem value="pago_prox">Fecha de pago: próximas</SelectItem>
                        <SelectItem value="pago_asc">Fecha de pago: ascendente</SelectItem>
                        <SelectItem value="pago_desc">Fecha de pago: descendente</SelectItem>
                      </SelectContent>
                    </Select>
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
                <MovsTable rows={filas[k]} onCobrar={cobrar} onCeder={ceder} onEdit={(m) => { setEditMov(m); setOpenMov(true); }} onDelete={eliminar} onRecibo={(m) => setReciboMov(m)} />
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


      <Dialog open={openCta} onOpenChange={(v) => { if (!v) { setOpenCta(false); setEditCta(null); } }}>
        {openCta && (
          <CuentaBancariaDialog
            initial={editCta}
            userId={user!.id}
            onClose={() => { setOpenCta(false); setEditCta(null); }}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
              setOpenCta(false); setEditCta(null);
            }}
          />
        )}
      </Dialog>

      <Dialog open={openMov} onOpenChange={(v) => { if (!v) { setOpenMov(false); setEditMov(null); } }}>
        {openMov && (
          <MovimientoDialog
            initial={editMov}
            userId={user!.id} year={year}
            facturasVenta={facturasVentaPend}
            facturasCompra={facturasCompraPend}
            echeqsCartera={movs.filter(m => m.instrumento === "echeq" && m.direccion === "cobro" && m.estado === "en_cartera")}
            onClose={() => { setOpenMov(false); setEditMov(null); }}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
              qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] });
              qc.invalidateQueries({ queryKey: ["fema_facturas_compra_pendientes"] });
              setOpenMov(false); setEditMov(null);
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!reciboMov} onOpenChange={(v) => { if (!v) setReciboMov(null); }}>
        {reciboMov && (
          <ReciboDialog
            mov={reciboMov}
            allMovs={movs}
            facturasVenta={facturasVentaQ.data ?? []}
            facturasCompra={facturasCompraQ.data ?? []}
            emisor="FEMA — Gestión Agropecuaria"
            onClose={() => setReciboMov(null)}
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

function MovsTable({ rows, onCobrar, onCeder, onEdit, onDelete, onRecibo }: {
  rows: Mov[]; onCobrar: (m: Mov) => void; onCeder: (m: Mov) => void;
  onEdit: (m: Mov) => void; onDelete: (m: Mov) => void; onRecibo: (m: Mov) => void;
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
          <TableHead>Fecha de pago</TableHead>
          <TableHead>Origen / Destino</TableHead>
          <TableHead>Nº cheque / CBU / ref.</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(m => {
          const hoyStr = new Date().toISOString().slice(0,10);
          const vencidoSinCobrar = m.estado === "en_cartera" && m.vencimiento && m.vencimiento < hoyStr;
          return (
          <TableRow key={m.id} className={vencidoSinCobrar ? "bg-red-500/10 hover:bg-red-500/15" : ""}>
            <TableCell className="font-medium">{INSTRUMENT_LABEL[m.instrumento]}{vencidoSinCobrar && <Badge variant="outline" className="ml-2 border-red-500/50 text-red-400">Vencido</Badge>}</TableCell>
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
                {(m.estado === "cobrado" || m.estado === "pagado" || m.estado === "en_cartera") && (
                  <Button size="sm" variant="outline" onClick={() => onRecibo(m)} className="border-primary/40 text-primary">
                    <Receipt className="w-3 h-3 mr-1" />Recibo
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEdit(m)}><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(m)} className="text-rose-400"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </TableCell>
          </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CarteraEcheqs({ rows, onCeder }: { rows: Mov[]; onCeder: (m: Mov) => void }) {
  const [orden, setOrden] = useState<"pago_asc"|"pago_desc"|"monto_asc"|"monto_desc">("pago_asc");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const hoy = new Date();

  const filtradas = useMemo(() => {
    let r = [...rows];
    if (desde) r = r.filter(m => (m.vencimiento ?? "") >= desde);
    if (hasta) r = r.filter(m => (m.vencimiento ?? "") <= hasta);
    r.sort((a, b) => {
      if (orden === "pago_asc" || orden === "pago_desc") {
        const av = a.vencimiento ?? "9999-12-31";
        const bv = b.vencimiento ?? "9999-12-31";
        return orden === "pago_asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const am = Number(a.monto), bm = Number(b.monto);
      return orden === "monto_asc" ? am - bm : bm - am;
    });
    return r;
  }, [rows, orden, desde, hasta]);

  const totalFiltrado = filtradas.reduce((a, m) => a + Number(m.monto), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">Fecha pago desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">Ordenar</label>
          <Select value={orden} onValueChange={(v: any) => setOrden(v)}>
            <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pago_asc">Fecha de pago (menor a mayor)</SelectItem>
              <SelectItem value="pago_desc">Fecha de pago (mayor a menor)</SelectItem>
              <SelectItem value="monto_asc">Monto (menor a mayor)</SelectItem>
              <SelectItem value="monto_desc">Monto (mayor a menor)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(desde || hasta) && (
          <Button variant="ghost" size="sm" onClick={() => { setDesde(""); setHasta(""); }}>
            <XIcon className="w-4 h-4 mr-1" />Limpiar
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtradas.length} echeqs · <span className="font-mono text-emerald-400">{formatPesos(totalFiltrado)}</span>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          {rows.length === 0 ? "No hay echeqs en cartera" : "Ningún echeq coincide con los filtros"}
        </div>
      ) : (
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nº echeq</TableHead>
          <TableHead>Recibido de</TableHead>
          <TableHead>Banco</TableHead>
          <TableHead>Fecha de pago</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtradas.map(m => {
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
      )}
    </div>
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

  // multi-cuota / echeqs para cobro_cliente y pago_proveedor
  type Cuota = { id?: string; numero: string; banco: string; vencimiento: string; monto: number; obs: string; estado?: string; instrumento?: string };
  const [cuotas, setCuotas] = useState<Cuota[]>([{ numero: "", banco: "", vencimiento: "", monto: 0, obs: "" }]);
  const [planOriginalIds, setPlanOriginalIds] = useState<string[]>([]);
  const [planCargado, setPlanCargado] = useState(false);
  const [bancoGlobal, setBancoGlobal] = useState("");
  const [genCuotas, setGenCuotas] = useState(1);
  const [genPrimerVto, setGenPrimerVto] = useState(new Date().toISOString().split("T")[0]);
  const [genPeriodicidad, setGenPeriodicidad] = useState<"semanal"|"quincenal"|"mensual">("mensual");

  const facturaActual = useMemo(() => {
    if (!facturaSel) return null;
    const list = tipo === "cobro_cliente" ? facturasVenta : facturasCompra;
    return list.find(f => f.id === facturaSel) ?? null;
  }, [facturaSel, tipo, facturasVenta, facturasCompra]);

  const totalCargado = useMemo(
    () => cuotas.reduce((a, c) => a + Number(c.monto || 0), 0),
    [cuotas]);
  const totalFactura = Number(facturaActual?.total ?? monto ?? 0);
  const diferencia = totalFactura - totalCargado;

  const generarCuotas = () => {
    if (!genCuotas || genCuotas < 1) return;
    const base = totalFactura > 0 ? totalFactura : Number(monto || 0);
    const cuotaMonto = Math.round((base / genCuotas) * 100) / 100;
    const start = genPrimerVto ? new Date(genPrimerVto + "T00:00:00") : new Date();
    const arr: Cuota[] = [];
    for (let i = 0; i < genCuotas; i++) {
      const d = new Date(start);
      if (genPeriodicidad === "semanal") d.setDate(d.getDate() + 7 * i);
      else if (genPeriodicidad === "quincenal") d.setDate(d.getDate() + 15 * i);
      else d.setMonth(d.getMonth() + i);
      arr.push({
        numero: numero ? `${numero}-${i+1}` : "",
        banco: bancoGlobal || banco || "",
        vencimiento: d.toISOString().split("T")[0],
        monto: cuotaMonto,
        obs: `Cuota ${i+1}/${genCuotas}`,
      });
    }
    setCuotas(arr);
  };

  const addFila = () => setCuotas(prev => [...prev, { numero: "", banco: bancoGlobal || "", vencimiento: "", monto: 0, obs: "" }]);
  const delFila = (i: number) => setCuotas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const updFila = (i: number, patch: Partial<Cuota>) => setCuotas(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  useEffect(() => {
    if (tipo === "ceder_echeq" && echeqId) {
      const e = echeqsCartera.find(x => x.id === echeqId);
      if (e) { setMonto(Number(e.monto)); setVencimiento(e.vencimiento ?? ""); setNumero(e.numero ?? ""); setBanco(e.banco ?? ""); }
    }
  }, [echeqId, tipo, echeqsCartera]);

  // Cargar plan de cuotas existente al seleccionar una factura (alta nueva)
  useEffect(() => {
    if (initial) return; // edición de un único movimiento
    if (tipo !== "cobro_cliente" && tipo !== "pago_proveedor") return;
    if (!facturaSel) { setPlanOriginalIds([]); setPlanCargado(false); return; }
    const col = tipo === "cobro_cliente" ? "factura_venta_id" : "factura_compra_id";
    sb.from("fema_movimientos_pago")
      .select("id,numero,banco,vencimiento,monto,observaciones,estado,instrumento")
      .eq(col, facturaSel)
      .order("vencimiento", { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        if (!data || data.length === 0) { setPlanOriginalIds([]); setPlanCargado(false); return; }
        setCuotas(data.map((r: any) => ({
          id: r.id,
          numero: r.numero ?? "",
          banco: r.banco ?? "",
          vencimiento: r.vencimiento ?? "",
          monto: Number(r.monto),
          obs: r.observaciones ?? "",
          estado: r.estado,
          instrumento: r.instrumento,
        })));
        setPlanOriginalIds(data.map((r: any) => r.id));
        const inst = data[0]?.instrumento;
        if (inst) setInstrumento(inst);
        setPlanCargado(true);
        toast.message(`Plan de ${data.length} cuotas cargado desde la factura. Podés editarlo antes de confirmar.`);
      });
  }, [facturaSel, tipo, initial]);

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
        const filasValidas = cuotas.filter(c => Number(c.monto) > 0);
        if (filasValidas.length === 0) { toast.error("Cargá al menos una cuota con monto"); return; }
        if (initial) {
          // edición: actualiza única fila
          const c = filasValidas[0];
          const payload: any = {
            instrumento: instrumento as any,
            direccion: tipo === "cobro_cliente" ? "cobro" : "pago",
            tipo_movimiento: tipo,
            fecha_emision: fechaEmision || new Date().toISOString().split("T")[0],
            vencimiento: c.vencimiento || null,
            numero: c.numero || null, banco: c.banco || bancoGlobal || null,
            contraparte: contraparte || (fact?.proveedor ?? null),
            monto: Number(c.monto), estado, observaciones: c.obs || observaciones || null,
            factura_venta_id: tipo === "cobro_cliente" ? facturaSel : null,
            factura_compra_id: tipo === "pago_proveedor" ? facturaSel : null,
            anio: year, mes,
          };
          const { error } = await sb.from("fema_movimientos_pago").update(payload).eq("id", initial.id);
          if (error) throw error;
        } else {
          // Filas con id → UPDATE (cuotas del plan original modificadas/confirmadas)
          // Filas sin id → INSERT (nuevas)
          // ids originales que ya no están → DELETE
          const keepIds = filasValidas.filter(c => c.id).map(c => c.id!) as string[];
          const toDelete = planOriginalIds.filter(id => !keepIds.includes(id));
          if (toDelete.length > 0) {
            const { error } = await sb.from("fema_movimientos_pago").delete().in("id", toDelete);
            if (error) throw error;
          }
          for (const c of filasValidas) {
            const base: any = {
              instrumento: instrumento as any,
              direccion: tipo === "cobro_cliente" ? "cobro" : "pago",
              tipo_movimiento: tipo,
              fecha_emision: fechaEmision || new Date().toISOString().split("T")[0],
              vencimiento: c.vencimiento || null,
              numero: c.numero || null,
              banco: c.banco || bancoGlobal || null,
              contraparte: contraparte || (fact?.proveedor ?? null),
              monto: Number(c.monto),
              estado, observaciones: c.obs || observaciones || null,
              factura_venta_id: tipo === "cobro_cliente" ? facturaSel : null,
              factura_compra_id: tipo === "pago_proveedor" ? facturaSel : null,
              anio: year, mes,
            };
            if (c.id) {
              const { error } = await sb.from("fema_movimientos_pago").update(base).eq("id", c.id);
              if (error) throw error;
            } else {
              const { error } = await sb.from("fema_movimientos_pago").insert({ ...base, user_id: userId });
              if (error) throw error;
            }
          }
        }
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
      // Reconcilia estado de la(s) factura(s) afectada(s)
      if (tipo === "cobro_cliente") await reconciliarFactura(facturaSel, "venta");
      if (tipo === "pago_proveedor") await reconciliarFactura(facturaSel, "compra");
      if (tipo === "ceder_echeq" && facturaCompraCesion) await reconciliarFactura(facturaCompraCesion, "compra");
      if (initial?.factura_venta_id && initial.factura_venta_id !== facturaSel) {
        await reconciliarFactura(initial.factura_venta_id, "venta");
      }
      if (initial?.factura_compra_id && initial.factura_compra_id !== facturaSel) {
        await reconciliarFactura(initial.factura_compra_id, "compra");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <FormField label={tipo === "cobro_cliente" ? "Factura de cliente a cobrar" : "Factura de proveedor a pagar"}>
            <Input placeholder="Buscar por cliente / proveedor / Nº factura..." value={busqFact} onChange={(e) => setBusqFact(e.target.value)} />
          </FormField>

          {facturaActual ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm uppercase truncate">{facturaActual.proveedor ?? "Cliente"}</div>
                <div className="text-xs text-muted-foreground">
                  Factura {facturaActual.numero ?? "s/n"} · {formatFecha(facturaActual.fecha)}
                  {facturaActual.trabajo ? ` · ${facturaActual.trabajo}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="font-mono text-emerald-400 text-base">{formatPesos(facturaActual.total)}</div>
                <Button size="sm" variant="outline" onClick={() => { setFacturaSel(null); setCuotas([{ numero: "", banco: "", vencimiento: "", monto: 0, obs: "" }]); }}>
                  <XIcon className="w-3 h-3 mr-1" />Cambiar
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-h-48 overflow-auto border rounded-md divide-y">
              {facturasFiltradas.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sin facturas</div>}
              {facturasFiltradas.map(f => (
                <button key={f.id} type="button"
                  onClick={() => { setFacturaSel(f.id); setMonto(Number(f.total)); setContraparte(f.proveedor ?? ""); setCuotas([{ numero: "", banco: "", vencimiento: "", monto: Number(f.total), obs: "" }]); }}
                  className="w-full text-left p-3 hover:bg-muted/50">
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
          )}

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Tipo documento">
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
            <FormField label="Banco (todas las filas)">
              <Input placeholder="— Banco —" value={bancoGlobal} onChange={(e) => setBancoGlobal(e.target.value)} />
            </FormField>
            <FormField label="Estado inicial">
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en_cartera">En cartera</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="cobrado">Cobrado</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Generar cuotas automático</div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Cuotas</div>
                <Input type="number" min={1} max={48} className="w-20" value={genCuotas} onChange={(e) => setGenCuotas(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">1° vto</div>
                <Input type="date" className="w-[160px]" value={genPrimerVto} onChange={(e) => setGenPrimerVto(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Periodicidad</div>
                <Select value={genPeriodicidad} onValueChange={(v) => setGenPeriodicidad(v as any)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" onClick={generarCuotas}>
                <Sparkles className="w-3 h-3 mr-1" />Generar
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            {planCargado && (
              <div className="border-b bg-primary/10 px-3 py-2 text-[11px] text-primary">
                Plan de cuotas cargado desde la factura ({planOriginalIds.length}). Confirmá el cobro tal cual, o modificá montos / vencimientos / instrumento si el cliente pagó de otra forma.
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Nº {instrumento === "echeq" ? "Echeq" : instrumento === "cheque_fisico" ? "Cheque" : "Ref"}</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto ($)</TableHead>
                  <TableHead>Obs.</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuotas.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i+1}</TableCell>
                    <TableCell><Input className="h-8" placeholder="Nº" value={c.numero} onChange={(e) => updFila(i, { numero: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" placeholder="— Banco —" value={c.banco} onChange={(e) => updFila(i, { banco: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" type="date" value={c.vencimiento} onChange={(e) => updFila(i, { vencimiento: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8 text-right font-mono" type="number" value={c.monto} onChange={(e) => updFila(i, { monto: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input className="h-8" placeholder="nota..." value={c.obs} onChange={(e) => updFila(i, { obs: e.target.value })} /></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-400" onClick={() => delFila(i)}><XIcon className="w-3 h-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between p-2 border-t bg-muted/30 text-xs">
              <Button type="button" size="sm" variant="outline" onClick={addFila}>
                <Plus className="w-3 h-3 mr-1" />Agregar fila
              </Button>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">Total cargado</span>
                <span className="font-mono font-semibold">{formatPesos(totalCargado)}</span>
                {totalFactura > 0 && Math.abs(diferencia) > 0.5 && (
                  <span className={diferencia > 0 ? "text-amber-400" : "text-rose-400"}>
                    {diferencia > 0 ? `Faltan ${formatPesos(diferencia)} para cubrir el total` : `Excede en ${formatPesos(-diferencia)}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Mes asociado">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_LARGOS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <div className="col-span-2">
              <FormField label="Observaciones generales">
                <Input placeholder="Ej: Paquete anticipado — financiado 8 meses" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </FormField>
            </div>
          </div>
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

function numeroALetras(n: number): string {
  // simple, suficiente para recibos
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function ReciboDialog({ mov, allMovs, facturasVenta, facturasCompra, emisor, onClose }: {
  mov: Mov;
  allMovs: Mov[];
  facturasVenta: any[];
  facturasCompra: any[];
  emisor: string;
  onClose: () => void;
}) {
  const esCobro = mov.direccion === "cobro";
  const facturaId = esCobro ? mov.factura_venta_id : mov.factura_compra_id;
  const factura = facturaId
    ? (esCobro ? facturasVenta : facturasCompra).find((f: any) => f.id === facturaId)
    : null;

  // Si está vinculado a una factura, agrupamos TODOS los movimientos de esa factura.
  const items = facturaId
    ? allMovs.filter(m =>
        (esCobro ? m.factura_venta_id : m.factura_compra_id) === facturaId
      )
    : [mov];

  const total = items.reduce((a, m) => a + Number(m.monto), 0);
  const reciboNro = `R-${new Date().getFullYear()}-${mov.id.slice(0, 8).toUpperCase()}`;
  const hoy = new Date().toISOString().split("T")[0];
  const contraparte = mov.contraparte ?? factura?.proveedor ?? "—";
  const tituloDoc = esCobro ? "RECIBO DE COBRO" : "RECIBO DE PAGO";
  const saldo = factura ? Number(factura.total) - total : 0;

  const imprimir = () => {
    const logo = absoluteAssetUrl(femaLogoUrl);
    const wm = absoluteAssetUrl(femaWatermarkUrl);
    const rowsHTML = items.map(m => `<tr>
      <td>${INSTRUMENT_LABEL[m.instrumento] ?? ""}</td>
      <td>${m.numero ?? "—"}</td>
      <td>${m.banco ?? "—"}</td>
      <td>${formatFecha(m.fecha_emision)}</td>
      <td>${m.vencimiento ? formatFecha(m.vencimiento) : "—"}</td>
      <td class="right">${formatPesos(Number(m.monto))}</td>
    </tr>`).join("");
    const obsParts: string[] = [`Son: <b>${numeroALetras(total)}</b>`];
    if (factura && saldo > 0.01) obsParts.push(`Saldo pendiente de la factura: <b>${formatPesos(saldo)}</b>`);
    if (mov.observaciones) obsParts.push(String(mov.observaciones).replace(/\n/g, "<br>"));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${tituloDoc} ${reciboNro}</title>
<style>${femaPrintCSS}</style></head><body>
<div class="fema-page">
  ${femaWatermarkHTML(wm)}
  <div class="fema-content">
    ${femaHeaderHTML(tituloDoc, [
      { label: "Nº:", value: reciboNro },
      { label: "Fecha:", value: formatFecha(hoy) },
      ...(factura ? [{ label: "Factura:", value: factura.numero ?? "s/n" }] : []),
    ], logo)}
    ${femaClientHTML([
      { label: esCobro ? "Cliente:" : "Proveedor:", value: contraparte },
      { label: "Concepto:", value: factura?.trabajo || (esCobro ? "Cobro" : "Pago") },
      ...(factura ? [
        { label: "Factura Nº:", value: `${factura.numero ?? "s/n"} — ${formatFecha(factura.fecha)}` },
        { label: "Total factura:", value: formatPesos(Number(factura.total)) },
      ] : [{ label: "", value: "" }, { label: "", value: "" }]),
    ])}
    <table class="fema">
      <thead><tr>
        <th>Medio</th><th>Nº / Ref.</th><th>Banco</th>
        <th>Fecha emisión</th><th>Vencimiento</th><th class="right">Monto</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div class="fema-spacer"></div>
    <div class="fema-bottom">
      <div class="fema-obs">
        <div class="t">OBSERVACIONES:</div>
        ${obsParts.join("<br>")}
      </div>
      <div class="fema-tot">
        <div class="row"><span>Cantidad de valores:</span><span>${items.length}</span></div>
        <div class="row"><span>Subtotal:</span><span>${formatPesos(total)}</span></div>
        <div class="row total"><span>Total</span><span>${formatPesos(total)}</span></div>
      </div>
    </div>
    <div class="fema-sign">
      <div>Firma del emisor</div>
      <div>Firma ${esCobro ? "del cliente" : "del proveedor"}</div>
    </div>
  </div>
</div>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("Bloqueado por el navegador"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader className="no-print">
        <DialogTitle>Recibo de {esCobro ? "cobro" : "pago"}</DialogTitle>
        <DialogDescription>Comprobante para entregar al {esCobro ? "cliente" : "proveedor"}.</DialogDescription>
      </DialogHeader>

      <div className="recibo-print relative bg-white text-black p-6 text-[10.5px] flex flex-col" style={{ minHeight: "273mm" }}>
        <FemaWatermark />
        <div className="relative z-10 flex flex-col flex-1">
          <FemaDocHeader
            title={tituloDoc}
            meta={[
              { label: "Nº:", value: reciboNro },
              { label: "Fecha:", value: formatFecha(hoy) },
              ...(factura ? [{ label: "Factura:", value: factura.numero ?? "s/n" }] : []),
            ]}
          />
          <FemaClientBox
            rows={[
              { label: esCobro ? "Cliente:" : "Proveedor:", value: contraparte },
              { label: "Concepto:", value: factura?.trabajo || (esCobro ? "Cobro" : "Pago") },
              ...(factura ? [
                { label: "Factura Nº:", value: `${factura.numero ?? "s/n"} — ${formatFecha(factura.fecha)}` },
                { label: "Total factura:", value: formatPesos(factura.total) },
              ] : [{ label: "", value: "" }, { label: "", value: "" }]),
            ]}
          />

          <table className="fema mt-3 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className="border-y-2 border-black px-2 py-1 text-left">Medio</th>
                <th className="border-y-2 border-black px-2 py-1 text-left">Nº / Ref.</th>
                <th className="border-y-2 border-black px-2 py-1 text-left">Banco</th>
                <th className="border-y-2 border-black px-2 py-1 text-left">Fecha emisión</th>
                <th className="border-y-2 border-black px-2 py-1 text-left">Vencimiento</th>
                <th className="border-y-2 border-black px-2 py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className="border-b border-gray-300">
                  <td className="px-2 py-1">{INSTRUMENT_LABEL[m.instrumento]}</td>
                  <td className="px-2 py-1">{m.numero ?? "—"}</td>
                  <td className="px-2 py-1">{m.banco ?? "—"}</td>
                  <td className="px-2 py-1">{formatFecha(m.fecha_emision)}</td>
                  <td className="px-2 py-1">{m.vencimiento ? formatFecha(m.vencimiento) : "—"}</td>
                  <td className="px-2 py-1 text-right font-mono">{formatPesos(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex-1" />
          <div className="mt-4 grid grid-cols-[1fr_260px] gap-3">
            <div className="border-2 border-black p-2 text-[10.5px]">
              <div className="italic font-bold underline">OBSERVACIONES:</div>
              <div className="mt-1">
                Son: <span className="font-semibold">{numeroALetras(total)}</span>
              </div>
              {factura && saldo > 0.01 && (
                <div className="mt-1">Saldo pendiente de la factura: <b>{formatPesos(saldo)}</b></div>
              )}
              {mov.observaciones && <div className="mt-1 whitespace-pre-wrap">{mov.observaciones}</div>}
            </div>
            <div className="text-[10.5px]">
              <div className="flex justify-between border-b border-gray-400 px-2 py-1"><span className="font-semibold">Cantidad de valores:</span><span>{items.length}</span></div>
              <div className="flex justify-between border-b border-gray-400 px-2 py-1"><span className="font-semibold">Subtotal:</span><span>{formatPesos(total)}</span></div>
              <div className="flex justify-between border-t border-black px-2 py-1.5 font-bold text-[13px]">
                <span>Total</span><span>{formatPesos(total)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-16 pt-12">
            <div className="border-t border-black pt-1 text-center text-[10.5px]">Firma del emisor</div>
            <div className="border-t border-black pt-1 text-center text-[10.5px]">Firma {esCobro ? "del cliente" : "del proveedor"}</div>
          </div>
        </div>
      </div>

      <DialogFooter className="no-print">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={imprimir}><Printer className="w-4 h-4 mr-2" />Imprimir / Guardar PDF</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CuentaBancariaDialog({
  initial, userId, onClose, onSaved,
}: {
  initial: any | null; userId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [banco, setBanco] = useState(initial?.banco ?? "");
  const [alias, setAlias] = useState(initial?.alias ?? "");
  const [numeroCuenta, setNumeroCuenta] = useState(initial?.numero_cuenta ?? "");
  const [cbu, setCbu] = useState(initial?.cbu ?? "");
  const [saldo, setSaldo] = useState<string>(String(initial?.saldo ?? "0"));
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");
  const [activa, setActiva] = useState<boolean>(initial?.activa ?? true);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!banco.trim()) { toast.error("Ingresá el banco"); return; }
    setSaving(true);
    const payload: any = {
      user_id: userId,
      banco: banco.trim(),
      alias: alias.trim() || null,
      numero_cuenta: numeroCuenta.trim() || null,
      cbu: cbu.trim() || null,
      saldo: Number(saldo) || 0,
      observaciones: observaciones.trim() || null,
      activa,
    };
    const { error } = initial
      ? await sb.from("fema_cuentas_bancarias").update(payload).eq("id", initial.id)
      : await sb.from("fema_cuentas_bancarias").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Cuenta actualizada" : "Cuenta creada");
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}</DialogTitle>
        <DialogDescription>Registrá el saldo disponible para abonar por transferencia.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <FormField label="Banco *">
          <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej: BANCO NACION" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Alias / Titular">
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
          </FormField>
          <FormField label="Saldo disponible">
            <Input type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Nº de cuenta">
            <Input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} />
          </FormField>
          <FormField label="CBU">
            <Input value={cbu} onChange={(e) => setCbu(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Observaciones">
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Cuenta activa
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}