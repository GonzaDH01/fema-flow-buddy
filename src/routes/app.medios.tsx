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
import {
  estadoFactura, construirObjetivos, repartirImporte, imputarIndivisible,
  esVencidoSinCobrar, esEmitidoPendiente, hoyISO,
} from "@/lib/finanzas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Pencil, Trash2, ArrowRight, CheckCircle2, FileText, ShoppingCart, Edit3, Receipt, Printer } from "lucide-react";
import { Sparkles, X as XIcon } from "lucide-react";
import {
  FemaDocHeader, FemaClientBox, FemaWatermark,
  femaPrintCSS, femaHeaderHTML, femaClientHTML, femaWatermarkHTML,
  absoluteAssetUrl, femaLogoUrl, femaWatermarkUrl,
  femaPdfOptions,
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
  const { data: fact } = await sb.from(tabla).select("id,total,estado").eq("id", facturaId).maybeSingle();
  if (!fact) return;
  const { data: movs } = await sb.from("fema_movimientos_pago")
    .select("monto,estado").eq(col, facturaId);
  // La regla de negocio vive en src/lib/finanzas.ts (pura y testeada).
  const nuevo = estadoFactura(fact.total, (movs ?? []) as any, tipo);
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
  const [depositoMov, setDepositoMov] = useState<Mov | null>(null);
  const [openPase, setOpenPase] = useState(false);

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
  const totalVista = cuentas.filter((c: any) => (c.tipo_cuenta ?? "vista") === "vista")
    .reduce((s: number, c: any) => s + Number(c.saldo || 0), 0);
  const totalFondos = cuentas.filter((c: any) => c.tipo_cuenta === "fondo")
    .reduce((s: number, c: any) => s + Number(c.saldo || 0), 0);

  const fondosQ = useQuery({
    queryKey: ["fema_mov_fondos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_mov_fondos")
        .select("*").order("fecha", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const movFondos = fondosQ.data ?? [];

  const eliminarMovFondo = async (m: any) => {
    if (!confirm("¿Eliminar este pase de dinero? Se revierten los saldos.")) return;
    const { error } = await (sb as any).rpc("fema_eliminar_mov_fondo", { _id: m.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Pase eliminado");
    qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
    qc.invalidateQueries({ queryKey: ["fema_mov_fondos"] });
  };

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
    const hoy = hoyISO();
    return movs.filter(m => esVencidoSinCobrar(m as any, hoy));
  }, [movs]);

  // Echeqs / cheques propios emitidos: la factura ya está paga, pero el dinero
  // recién sale de la caja el día de la fecha de pago del documento.
  const emitidosPendientes = useMemo(() => {
    return movs
      .filter(m => esEmitidoPendiente(m as any))
      .sort((a, b) => (a.vencimiento ?? "9999").localeCompare(b.vencimiento ?? "9999"));
  }, [movs]);
  const totalEmitidosPend = emitidosPendientes.reduce((a, m) => a + Number(m.monto), 0);

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
    propios: filtrar(m => m.direccion === "pago" && (m.instrumento === "echeq" || m.instrumento === "cheque_fisico")),
    cheques: filtrar(m => m.instrumento === "cheque_fisico"),
    transferencias: filtrar(m => m.instrumento === "transferencia"),
    cesiones: filtrar(m => m.instrumento === "cesion"),
  };

  const cobrar = async (m: Mov) => {
    if (cuentas.length > 0) {
      setDepositoMov(m);
      return;
    }
    await aplicarCobro(m, null);
  };

  const aplicarCobro = async (m: Mov, cuentaId: string | null) => {
    const esPago = m.direccion === "pago";
    const nuevoEstado = esPago ? "pagado" : "cobrado";
    const marca = esPago ? "DEB" : "DEP";
    const obs = cuentaId
      ? `${(m.observaciones ?? "").replace(/\s*\[(DEP|DEB):[^\]]+\]/g, "")} [${marca}:${cuentaId}]`.trim()
      : ((m.observaciones ?? "").replace(/\s*\[(DEP|DEB):[^\]]+\]/g, "").trim() || null);
    // Operación única en el servidor: estado + saldo bancario + estado de la factura
    const { error } = await (sb as any).rpc("fema_impactar_caja", {
      _mov_id: m.id,
      _nuevo_estado: nuevoEstado,
      _cuenta_id: cuentaId,
      _es_pago: esPago,
    });
    if (error) {
      toast.error(`No se pudo registrar el movimiento: ${error.message}`);
      await movsQ.refetch();
      return;
    }
    // Actualización inmediata en pantalla
    qc.setQueryData(["fema_movimientos_pago", user?.id, year], (old: Mov[] | undefined) =>
      (old ?? []).map(x => x.id === m.id ? { ...x, estado: nuevoEstado as Mov["estado"], observaciones: obs ?? null } : x));
    if (cuentaId) {
      const cta = cuentas.find((c: any) => c.id === cuentaId);
      if (cta) {
        const nuevo = Number(cta.saldo || 0) + (esPago ? -1 : 1) * Number(m.monto);
        toast.success(`${esPago ? "Debitado de" : "Depositado en"} ${cta.banco}. Nuevo saldo: ${formatPesos(nuevo)}`);
        qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
      }
    } else {
      toast.success(esPago ? "Marcado como pagado (sin debitar de caja)" : "Cobrado sin depositar (no modifica caja)");
    }
    await movsQ.refetch();
    qc.invalidateQueries({ queryKey: ["fema_pagos_por_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra_pendientes"] });
  };

  const revertir = async (m: Mov) => {
    if (!confirm("¿Volver este echeq al estado 'En cartera' / pendiente?")) return;
    const { error } = await (sb as any).rpc("fema_revertir_caja", {
      _mov_id: m.id,
      _estado: "en_cartera",
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
    toast.success("Echeq devuelto a cartera");
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["fema_pagos_por_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] });
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
    qc.invalidateQueries({ queryKey: ["fema_pagos_por_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
  };

  const eliminarMovimientos = async (ids: string[]): Promise<boolean> => {
    const idsUnicos = Array.from(new Set(ids));
    if (idsUnicos.length === 0) return false;

    const seleccionados = movs.filter((m) => idsUnicos.includes(m.id));
    if (seleccionados.length !== idsUnicos.length) {
      toast.error("La lista cambió. Actualizá la pantalla y volvé a seleccionar los movimientos.");
      await movsQ.refetch();
      return false;
    }

    // Las cesiones hijas deben eliminarse antes que el echeq que las originó.
    const { data: cesionesHijas, error: hijosError } = await sb.from("fema_movimientos_pago")
      .select("*").in("echeq_origen_id", idsUnicos);
    if (hijosError) {
      toast.error(`No se pudieron revisar las cesiones relacionadas: ${hijosError.message}`);
      return false;
    }
    const hijos = (cesionesHijas ?? []) as Mov[];
    const todosAEliminar = [...seleccionados, ...hijos.filter((h) => !idsUnicos.includes(h.id))];
    const idsTodos = Array.from(new Set(todosAEliminar.map((m) => m.id)));

    // Si se elimina únicamente la cesión, el echeq original vuelve a cartera.
    const origenesAReponer = Array.from(new Set(seleccionados
      .filter((m) => m.instrumento === "cesion" && m.echeq_origen_id && !idsUnicos.includes(m.echeq_origen_id))
      .map((m) => m.echeq_origen_id)
      .filter((id): id is string => Boolean(id))));
    if (origenesAReponer.length > 0) {
      const { error } = await sb.from("fema_movimientos_pago")
        .update({ estado: "en_cartera", observaciones: null }).in("id", origenesAReponer);
      if (error) { toast.error(`No se pudo devolver el echeq a cartera: ${error.message}`); return false; }
    }

    // Revertir depósitos/débitos bancarios registrados por estos movimientos.
    const ajustesCuenta = new Map<string, number>();
    for (const m of todosAEliminar) {
      const match = /\[(DEP|DEB):([^\]]+)\]/.exec(m.observaciones ?? "");
      if (!match) continue;
      const delta = match[1] === "DEB" ? Number(m.monto) : -Number(m.monto);
      ajustesCuenta.set(match[2], (ajustesCuenta.get(match[2]) ?? 0) + delta);
    }
    for (const [cuentaId, delta] of ajustesCuenta) {
      const { data: cuenta, error: cuentaError } = await sb.from("fema_cuentas_bancarias")
        .select("id,saldo").eq("id", cuentaId).maybeSingle();
      if (cuentaError) { toast.error(`No se pudo revisar el saldo bancario: ${cuentaError.message}`); return false; }
      if (cuenta) {
        const { error } = await sb.from("fema_cuentas_bancarias")
          .update({ saldo: Number(cuenta.saldo || 0) + delta }).eq("id", cuentaId);
        if (error) { toast.error(`No se pudo revertir el saldo bancario: ${error.message}`); return false; }
      }
    }

    const hijosNoSeleccionados = hijos.filter((h) => !idsUnicos.includes(h.id));
    if (hijosNoSeleccionados.length > 0) {
      const { error } = await sb.from("fema_movimientos_pago").delete()
        .in("id", hijosNoSeleccionados.map((h) => h.id));
      if (error) { toast.error(`No se pudieron eliminar las cesiones relacionadas: ${error.message}`); return false; }
    }
    const { error } = await sb.from("fema_movimientos_pago")
      .delete().in("id", idsUnicos);
    if (error) { toast.error(`No se pudieron eliminar: ${error.message}`); return false; }

    // DELETE puede responder sin representación aunque haya eliminado correctamente.
    // Verificamos los IDs que realmente siguen existiendo en vez de contar la respuesta.
    const { data: restantes, error: verificarError } = await sb.from("fema_movimientos_pago")
      .select("id").in("id", idsUnicos);
    if (verificarError) {
      toast.error(`No se pudo verificar la eliminación: ${verificarError.message}`);
      await movsQ.refetch();
      return false;
    }
    if ((restantes ?? []).length > 0) {
      const eliminadosCount = idsUnicos.length - (restantes ?? []).length;
      toast.error(`Se eliminaron ${eliminadosCount} de ${idsUnicos.length}. ${restantes.length} registro(s) continúan vinculados o sin permiso de eliminación.`);
      await movsQ.refetch();
      return false;
    }

    const facturasVenta = Array.from(new Set(todosAEliminar.map((m) => m.factura_venta_id).filter((id): id is string => Boolean(id))));
    const facturasCompra = Array.from(new Set(todosAEliminar.map((m) => m.factura_compra_id).filter((id): id is string => Boolean(id))));
    await Promise.all([
      ...facturasVenta.map((id) => reconciliarFactura(id, "venta")),
      ...facturasCompra.map((id) => reconciliarFactura(id, "compra")),
    ]);

    // Quitar inmediatamente las filas y luego confirmar contra la base.
    qc.setQueryData<Mov[]>(["fema_movimientos_pago", user?.id, year], (actuales) =>
      (actuales ?? []).filter((m) => !idsTodos.includes(m.id)));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["fema_pagos_por_compra"] }),
      qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] }),
      qc.invalidateQueries({ queryKey: ["fema_facturas_venta_pendientes"] }),
      qc.invalidateQueries({ queryKey: ["fema_facturas_compra_pendientes"] }),
      qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["cashflow-matrix"] }),
    ]);
    await movsQ.refetch();
    toast.success(`${idsUnicos.length} movimiento(s) eliminados y relaciones actualizadas`);
    return true;
  };

  const eliminar = async (m: Mov) => {
    if (!confirm("¿Eliminar movimiento? Se actualizarán también sus relaciones, saldos y facturas.")) return;
    await eliminarMovimientos([m.id]);
  };

  const eliminarVarios = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    if (!confirm(`¿Eliminar ${ids.length} movimiento(s)? Se actualizarán cesiones, saldos bancarios y facturas relacionadas.`)) return false;
    return eliminarMovimientos(ids);
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
              <p className="text-xs text-muted-foreground mt-1">
                Cargá primero el saldo que hoy figura en el banco (antes de marcar echeqs). Cada echeq
                que marques como cobrado se suma automáticamente a la cuenta que elijas.
              </p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                  Caja a la vista: <b className="text-emerald-400">{formatPesos(totalVista)}</b>
                </span>
                <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1">
                  En fondos de inversión: <b className="text-blue-400">{formatPesos(totalFondos)}</b>
                </span>
                <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1">
                  Echeqs propios a debitar: <b className="text-rose-400">{formatPesos(totalEmitidosPend)}</b>
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  Saldo proyectado (caja − echeqs emitidos):{" "}
                  <b className={totalVista - totalEmitidosPend < 0 ? "text-rose-400" : "text-foreground"}>
                    {formatPesos(totalVista - totalEmitidosPend)}
                  </b>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenPase(true)} disabled={cuentas.length < 2}>
                <ArrowRight className="w-4 h-4 mr-2" />Mover dinero
              </Button>
              <Button size="sm" onClick={() => { setEditCta(null); setOpenCta(true); }}>
                <Plus className="w-4 h-4 mr-2" />Agregar cuenta
              </Button>
            </div>
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
                  <TableHead>Tipo</TableHead>
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
                      {c.tipo_cuenta === "fondo" ? (
                        <Badge variant="outline" className="border-blue-500/40 text-blue-400">
                          Fondo · rescate {c.rescate === "24hs" ? "24 hs" : "inmediato"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Caja a la vista</Badge>
                      )}
                    </TableCell>
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

          {movFondos.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs uppercase text-muted-foreground mb-2">Últimos pases entre caja y fondos</h4>
              <div className="space-y-1">
                {movFondos.map((m: any) => {
                  const org = cuentas.find((c: any) => c.id === m.origen_id);
                  const dst = cuentas.find((c: any) => c.id === m.destino_id);
                  const nom = (c: any) => (c ? `${c.banco}${c.alias ? ` · ${c.alias}` : ""}` : "—");
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-xs border border-border/50 rounded-md px-2 py-1">
                      <span className="text-muted-foreground">{formatFecha(m.fecha)}</span>
                      <span>{nom(org)}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span>{nom(dst)}</span>
                      <span className="font-mono text-emerald-400 ml-auto">{formatPesos(Number(m.monto))}</span>
                      <Button size="sm" variant="ghost" onClick={() => eliminarMovFondo(m)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-rose-500/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Echeqs / cheques propios emitidos (pendientes de débito)</h3>
              <p className="text-xs text-muted-foreground">
                La factura ya queda abonada con el plan de pago elegido. El importe se descuenta de la caja
                recién el día de la fecha de pago de cada documento: al llegar esa fecha, tocá <b>Debitar de caja</b>.
              </p>
            </div>
            <span className="text-sm font-semibold text-rose-400 whitespace-nowrap">
              {formatPesos(totalEmitidosPend)}
            </span>
          </div>
          {emitidosPendientes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay echeqs propios pendientes de débito.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead>Instrumento</TableHead>
                  <TableHead>Nº</TableHead>
                  <TableHead>Beneficiario</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emitidosPendientes.map((m) => {
                  const hoyStr = new Date().toISOString().split("T")[0];
                  const vence = m.vencimiento ?? "";
                  const vencido = vence && vence < hoyStr;
                  const hoyMismo = vence === hoyStr;
                  return (
                    <TableRow key={m.id} className={vencido ? "bg-rose-500/10" : hoyMismo ? "bg-amber-500/10" : ""}>
                      <TableCell className="whitespace-nowrap">
                        {vence ? formatFecha(vence) : "—"}
                        {vencido && <Badge variant="outline" className="ml-2 border-rose-500/50 text-rose-400">A debitar</Badge>}
                        {hoyMismo && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-400">Hoy</Badge>}
                      </TableCell>
                      <TableCell>{INSTRUMENT_LABEL[m.instrumento]}</TableCell>
                      <TableCell className="font-mono text-xs">{m.numero || "—"}</TableCell>
                      <TableCell>{m.contraparte || "—"}</TableCell>
                      <TableCell className="text-xs">{m.banco || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatPesos(Number(m.monto))}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="border-rose-500/40 text-rose-400"
                          onClick={() => cobrar(m)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" />Debitar de caja
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openPase} onOpenChange={setOpenPase}>
        {openPase && user && (
          <PaseFondosDialog
            cuentas={cuentas}
            userId={user.id}
            onClose={() => setOpenPase(false)}
            onSaved={() => {
              setOpenPase(false);
              qc.invalidateQueries({ queryKey: ["fema_cuentas_bancarias"] });
              qc.invalidateQueries({ queryKey: ["fema_mov_fondos"] });
            }}
          />
        )}
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>

        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="echeqs">Echeqs</TabsTrigger>
          <TabsTrigger value="propios">Echeqs propios / emitidos</TabsTrigger>
          <TabsTrigger value="cheques">Cheques físicos</TabsTrigger>
          <TabsTrigger value="transferencias">Transferencias</TabsTrigger>
          <TabsTrigger value="cesiones">Cesiones</TabsTrigger>
        </TabsList>

        {(["todos","echeqs","propios","cheques","transferencias","cesiones"] as const).map(k => (
          <TabsContent key={k} value={k}>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {k === "todos" ? "Todos los movimientos"
                      : k === "echeqs" ? "Echeqs"
                      : k === "propios" ? "Echeqs / cheques propios emitidos"
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
                {k === "propios" && <ResumenPropios rows={filas.propios} />}
                <MovsTable rows={filas[k]} onCobrar={cobrar} onCeder={ceder} onEdit={(m) => { setEditMov(m); setOpenMov(true); }} onDelete={eliminar} onDeleteMany={eliminarVarios} onRecibo={(m) => setReciboMov(m)} />
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
          <CarteraEcheqs
            rows={movs.filter(m => m.instrumento === "echeq" && m.direccion === "cobro")}
            onCeder={ceder}
            onCobrar={cobrar}
            onRevertir={revertir}
            cuentas={cuentas}
            onDepositar={(m) => setDepositoMov(m)}
          />
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

      <Dialog open={!!depositoMov} onOpenChange={(v) => { if (!v) setDepositoMov(null); }}>
        {depositoMov && (
          <DepositoDialog
            mov={depositoMov}
            cuentas={cuentas}
            onClose={() => setDepositoMov(null)}
            onConfirm={async (cuentaId) => {
              const m = depositoMov;
              setDepositoMov(null);
              await aplicarCobro(m, cuentaId);
            }}
          />
        )}
      </Dialog>

      <Dialog open={openMov} onOpenChange={(v) => { if (!v) { setOpenMov(false); setEditMov(null); } }}>
        {openMov && user && (
          <MovimientoDialog
            initial={editMov}
            userId={user.id} year={year}
            facturasVenta={facturasVentaPend}
            facturasCompra={facturasCompraPend}
            echeqsCartera={movs.filter(m => m.instrumento === "echeq" && m.direccion === "cobro" && m.estado === "en_cartera")}
            onClose={() => { setOpenMov(false); setEditMov(null); }}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["fema_pagos_por_compra"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
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

function ResumenPropios({ rows }: { rows: Mov[] }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = rows.filter(m => m.estado === "en_cartera");
  const debitados = rows.filter(m => m.estado === "pagado");
  const totalPend = pendientes.reduce((a, m) => a + Number(m.monto), 0);
  const totalDeb = debitados.reduce((a, m) => a + Number(m.monto), 0);
  const vencidos = pendientes.filter(m => m.vencimiento && m.vencimiento < hoy);
  const porBenef = new Map<string, { pend: number; deb: number; cant: number }>();
  for (const m of rows) {
    const k = m.contraparte?.trim() || "Sin beneficiario";
    const acc = porBenef.get(k) ?? { pend: 0, deb: 0, cant: 0 };
    acc.cant += 1;
    if (m.estado === "en_cartera") acc.pend += Number(m.monto);
    if (m.estado === "pagado") acc.deb += Number(m.monto);
    porBenef.set(k, acc);
  }
  const grupos = [...porBenef.entries()].sort((a, b) => b[1].pend - a[1].pend);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
      <p className="text-xs text-muted-foreground">
        Documentos <b>propios de la empresa</b> (echeqs y cheques emitidos a proveedores, incluidos los planes de pago
        cargados desde facturas). No forman parte de la cartera de echeqs recibidos de clientes.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-2">
          <p className="text-xs text-muted-foreground">Pendientes de débito</p>
          <p className="font-semibold text-rose-400">{formatPesos(totalPend)}</p>
          <p className="text-xs text-muted-foreground">{pendientes.length} doc. · {vencidos.length} a debitar</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <p className="text-xs text-muted-foreground">Ya debitados</p>
          <p className="font-semibold">{formatPesos(totalDeb)}</p>
          <p className="text-xs text-muted-foreground">{debitados.length} doc.</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <p className="text-xs text-muted-foreground">Total emitido</p>
          <p className="font-semibold">{formatPesos(totalPend + totalDeb)}</p>
          <p className="text-xs text-muted-foreground">{rows.length} doc.</p>
        </div>
      </div>
      <div className="space-y-1">
        {grupos.map(([nombre, g]) => (
          <div key={nombre} className="flex flex-wrap items-center gap-2 rounded-md bg-card/60 px-2 py-1 text-sm">
            <span className="font-medium">{nombre}</span>
            <span className="text-xs text-muted-foreground">{g.cant} doc.</span>
            <span className="ml-auto font-mono text-rose-400">{formatPesos(g.pend)} pend.</span>
            <span className="font-mono text-xs text-muted-foreground">{formatPesos(g.deb)} debitado</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MovsTable({ rows, onCobrar, onCeder, onEdit, onDelete, onDeleteMany, onRecibo }: {
  rows: Mov[]; onCobrar: (m: Mov) => void; onCeder: (m: Mov) => void;
  onEdit: (m: Mov) => void; onDelete: (m: Mov) => void;
  onDeleteMany?: (ids: string[]) => Promise<boolean>; onRecibo: (m: Mov) => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const visibles = rows.map(r => r.id);
  const seleccionados = sel.filter(id => visibles.includes(id));
  const toggle = (id: string) =>
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSel(seleccionados.length === visibles.length ? [] : visibles);
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
        <FileText className="w-10 h-10 mb-2 opacity-40" />
        No hay movimientos registrados
      </div>
    );
  }
  return (
    <>
    {onDeleteMany && seleccionados.length > 0 && (
      <div className="flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm">
        <span>{seleccionados.length} seleccionado(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>Cancelar</Button>
          <Button size="sm" variant="destructive" disabled={deleting} onClick={async () => {
            setDeleting(true);
            try {
              const eliminado = await onDeleteMany(seleccionados);
              if (eliminado) setSel([]);
            } finally {
              setDeleting(false);
            }
          }}>
            <Trash2 className="w-3 h-3 mr-1" />{deleting ? "Eliminando…" : "Eliminar seleccionados"}
          </Button>
        </div>
      </div>
    )}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <input type="checkbox" aria-label="Seleccionar todos"
              checked={seleccionados.length === visibles.length && visibles.length > 0}
              onChange={toggleAll} />
          </TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Dirección</TableHead>
          <TableHead>Origen</TableHead>
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
          const yaImpactoCaja = /\[(DEP|DEB):[^\]]+\]/.test(m.observaciones ?? "");
          const sinImpactoCaja = (m.estado === "pagado" || m.estado === "cobrado")
            && m.instrumento !== "cesion" && !yaImpactoCaja;
          return (
          <TableRow key={m.id} className={vencidoSinCobrar ? "bg-red-500/10 hover:bg-red-500/15" : ""}>
            <TableCell>
              <input type="checkbox" aria-label="Seleccionar movimiento"
                checked={sel.includes(m.id)} onChange={() => toggle(m.id)} />
            </TableCell>
            <TableCell className="font-medium">{INSTRUMENT_LABEL[m.instrumento]}{vencidoSinCobrar && <Badge variant="outline" className="ml-2 border-red-500/50 text-red-400">Vencido</Badge>}</TableCell>
            <TableCell>
              <Badge variant="outline" className={m.direccion === "cobro" ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"}>
                {m.direccion === "cobro" ? "Cobro" : "Pago"}
              </Badge>
            </TableCell>
            <TableCell>
              {(m.instrumento === "echeq" || m.instrumento === "cheque_fisico") ? (
                m.direccion === "pago" ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-400">Propio / emitido</Badge>
                ) : (
                  <Badge variant="outline" className="border-sky-500/50 text-sky-400">De tercero</Badge>
                )
              ) : m.instrumento === "cesion" ? (
                <Badge variant="outline" className="border-violet-500/50 text-violet-400">Echeq cedido</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-xs">{formatFecha(m.fecha_emision)}</TableCell>
            <TableCell className="text-xs">{m.vencimiento ? formatFecha(m.vencimiento) : "—"}</TableCell>
            <TableCell>{m.contraparte ?? "—"}</TableCell>
            <TableCell className="text-xs">{m.numero ?? "—"}</TableCell>
            <TableCell className="text-xs">{m.banco ?? "—"}</TableCell>
            <TableCell className="text-right font-mono">{formatPesos(m.monto)}</TableCell>
            <TableCell>
              <Badge variant="outline" className={ESTADO_VARIANT[m.estado]}>{ESTADO_LABEL[m.estado]}</Badge>
              {sinImpactoCaja && (
                <div className="mt-1 text-[10px] text-amber-400">sin impacto en caja</div>
              )}
            </TableCell>
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
                {sinImpactoCaja && (
                  <Button size="sm" variant="outline" onClick={() => onCobrar(m)} className="border-amber-500/40 text-amber-400">
                    <CheckCircle2 className="w-3 h-3 mr-1" />{m.direccion === "pago" ? "Debitar de caja" : "Acreditar en banco"}
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
    </>
  );
}

function CarteraEcheqs({ rows, onCeder, onCobrar, onRevertir, cuentas = [], onDepositar }: {
  rows: Mov[]; onCeder: (m: Mov) => void; onCobrar: (m: Mov) => void; onRevertir: (m: Mov) => void;
  cuentas?: any[]; onDepositar?: (m: Mov) => void;
}) {
  const [orden, setOrden] = useState<"pago_asc"|"pago_desc"|"monto_asc"|"monto_desc">("pago_asc");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [estadoFiltro, setEstadoFiltro] = useState<"en_cartera"|"cobrado"|"cedido"|"todos">("en_cartera");
  const hoy = new Date();

  const filtradas = useMemo(() => {
    let r = [...rows];
    if (estadoFiltro !== "todos") r = r.filter(m => m.estado === estadoFiltro);
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
  }, [rows, orden, desde, hasta, estadoFiltro]);

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
        <div className="space-y-1">
          <label className="text-[11px] uppercase text-muted-foreground">Estado</label>
          <Select value={estadoFiltro} onValueChange={(v: any) => setEstadoFiltro(v)}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en_cartera">En cartera</SelectItem>
              <SelectItem value="cobrado">Cobrados</SelectItem>
              <SelectItem value="cedido">Cedidos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
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
          <TableHead>Destino / depósito</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtradas.map(m => {
          const dias = m.vencimiento ? Math.round((new Date(m.vencimiento).getTime() - hoy.getTime()) / 86400000) : null;
          const enCartera = m.estado === "en_cartera";
          const vencido = enCartera && dias !== null && dias < 0;
          const venc = dias !== null && dias < 7 && dias >= 0;
          const depId = /\[DEP:([^\]]+)\]/.exec(m.observaciones ?? "")?.[1];
          const ctaDep = depId ? cuentas.find((c: any) => c.id === depId) : null;
          return (
            <TableRow key={m.id} className={vencido ? "bg-red-500/10 hover:bg-red-500/15" : ""}>
              <TableCell className="font-mono text-xs">{m.numero ?? "—"}{vencido && <Badge variant="outline" className="ml-2 border-red-500/50 text-red-400">Vencido</Badge>}</TableCell>
              <TableCell>{m.contraparte ?? "—"}</TableCell>
              <TableCell>{m.banco ?? "—"}</TableCell>
              <TableCell className={`text-xs ${vencido ? "text-red-400 font-semibold" : venc ? "text-amber-400" : ""}`}>
                {m.vencimiento ? `${formatFecha(m.vencimiento)} (${dias}d)` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-emerald-400">{formatPesos(m.monto)}</TableCell>
              <TableCell><Badge variant="outline" className={ESTADO_VARIANT[m.estado]}>{ESTADO_LABEL[m.estado]}</Badge></TableCell>
              <TableCell className="text-xs">
                {m.estado === "cobrado" ? (
                  ctaDep ? (
                    <span className="text-emerald-400">Depositado en {ctaDep.banco}</span>
                  ) : (
                    <span className="text-amber-400">Cobrado sin depositar</span>
                  )
                ) : m.estado === "cedido" ? (
                  <span className="text-muted-foreground">{m.observaciones ?? "Cedido"}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {enCartera && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onCobrar(m)} className="border-emerald-500/40 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Marcar cobrado
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onCeder(m)} className="border-amber-500/40 text-amber-400">
                        <ArrowRight className="w-3 h-3 mr-1" />Ceder a proveedor
                      </Button>
                    </>
                  )}
                  {!enCartera && (
                    <>
                      {m.estado === "cobrado" && !ctaDep && onDepositar && cuentas.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => onDepositar(m)} className="border-emerald-500/40 text-emerald-400">
                          Acreditar en banco
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onRevertir(m)} className="text-muted-foreground">
                        Volver a cartera
                      </Button>
                    </>
                  )}
                </div>
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
  // Pago a proveedor: selección múltiple de facturas del MISMO proveedor
  const [facturasMulti, setFacturasMulti] = useState<string[]>(
    initial?.factura_compra_id ? [initial.factura_compra_id] : []
  );

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

  // Pago a proveedor — permite combinar métodos (transferencia/emitir + ceder de cartera)
  const [echeqsCedidos, setEcheqsCedidos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busqCartera, setBusqCartera] = useState("");
  const [fechaDesdeCartera, setFechaDesdeCartera] = useState("");
  const [fechaHastaCartera, setFechaHastaCartera] = useState("");
  const [ordenCartera, setOrdenCartera] = useState<"pago_asc" | "pago_desc" | "monto_mayor" | "monto_menor">("pago_asc");
  const echeqsCarteraFiltrados = useMemo(() => {
    const q = busqCartera.trim().toLowerCase();
    let list = echeqsCartera;
    if (q) {
      list = list.filter(e => [e.numero, e.contraparte, e.banco].some(v => (v ?? "").toString().toLowerCase().includes(q)));
    }
    if (fechaDesdeCartera) {
      list = list.filter(e => e.vencimiento && e.vencimiento >= fechaDesdeCartera);
    }
    if (fechaHastaCartera) {
      list = list.filter(e => e.vencimiento && e.vencimiento <= fechaHastaCartera);
    }
    list = [...list].sort((a, b) => {
      if (ordenCartera === "pago_asc") return (a.vencimiento ?? "").localeCompare(b.vencimiento ?? "");
      if (ordenCartera === "pago_desc") return (b.vencimiento ?? "").localeCompare(a.vencimiento ?? "");
      if (ordenCartera === "monto_mayor") return Number(b.monto) - Number(a.monto);
      return Number(a.monto) - Number(b.monto);
    });
    return list;
  }, [echeqsCartera, busqCartera, fechaDesdeCartera, fechaHastaCartera, ordenCartera]);
  const totalCedidos = useMemo(
    () => echeqsCartera.filter(e => echeqsCedidos.includes(e.id)).reduce((a, e) => a + Number(e.monto), 0),
    [echeqsCartera, echeqsCedidos]);
  const toggleEcheqCedido = (id: string) =>
    setEcheqsCedidos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const facturaActual = useMemo(() => {
    if (!facturaSel) return null;
    const list = tipo === "cobro_cliente" ? facturasVenta : facturasCompra;
    return list.find(f => f.id === facturaSel) ?? null;
  }, [facturaSel, tipo, facturasVenta, facturasCompra]);

  const multiActivo = tipo === "pago_proveedor" && !initial;
  const facturasSeleccionadas = useMemo(
    () => facturasMulti.map(id => facturasCompra.find(f => f.id === id)).filter(Boolean) as any[],
    [facturasMulti, facturasCompra]);
  const proveedorSel = facturasSeleccionadas[0]?.proveedor_id ?? null;
  const totalMulti = useMemo(
    () => facturasSeleccionadas.reduce((a, f) => a + Number(f.total || 0), 0),
    [facturasSeleccionadas]);
  const toggleFacturaMulti = (f: any) => {
    setFacturasMulti(prev => {
      const next = prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id];
      setFacturaSel(next[0] ?? null);
      return next;
    });
  };

  const totalCargado = useMemo(
    () => cuotas.reduce((a, c) => a + Number(c.monto || 0), 0),
    [cuotas]);
  const totalFactura = multiActivo && facturasSeleccionadas.length > 0
    ? totalMulti
    : Number(facturaActual?.total ?? monto ?? 0);
  const totalCombinado = totalCargado + totalCedidos;
  const diferencia = totalFactura - totalCombinado;

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
    if (facturasMulti.length > 1) { setPlanOriginalIds([]); setPlanCargado(false); return; }
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
  }, [facturaSel, tipo, initial, facturasMulti.length]);

  const facturasFiltradas = useMemo(() => {
    const list = tipo === "cobro_cliente" ? facturasVenta : tipo === "pago_proveedor" ? facturasCompra : [];
    let out = list;
    if (busqFact) {
      const q = busqFact.toLowerCase();
      out = out.filter(f => [f.numero, f.trabajo, f.proveedor].some((v: string) => (v ?? "").toLowerCase().includes(q)));
    }
    // En pago a proveedor con selección múltiple sólo se listan facturas del mismo proveedor
    if (tipo === "pago_proveedor" && !initial && proveedorSel) {
      out = out.filter(f => f.proveedor_id === proveedorSel);
    }
    return out.slice(0, tipo === "pago_proveedor" && !initial ? 30 : 6);
  }, [tipo, busqFact, facturasVenta, facturasCompra, proveedorSel, initial]);

  const guardar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (tipo === "ceder_echeq") {
        if (!echeqId) { toast.error("Seleccioná un echeq"); return; }
        const e = echeqsCartera.find(x => x.id === echeqId)!;
        // Atómico: el echeq sale de cartera y se crea la cesión en la misma operación.
        const { error } = await (sb as any).rpc("fema_registrar_pago", {
          _borrar: [],
          _ceder: [echeqId],
          _inserts: [{
            instrumento: "cesion", direccion: "pago",
            tipo_movimiento: "ceder_echeq", fecha_emision: new Date().toISOString().split("T")[0],
            vencimiento: e.vencimiento, numero: e.numero, banco: e.banco,
            contraparte: proveedorCesion || "Proveedor", monto: e.monto, estado: "pagado",
            echeq_origen_id: echeqId,
            factura_compra_id: facturaCompraCesion || null,
            observaciones: observaciones || `Cesión de echeq Nº ${e.numero ?? ""}`,
            anio: year, mes: new Date().getMonth() + 1,
          }],
          _updates: [],
        });
        if (error) throw error;
      } else if (tipo === "cobro_cliente" || tipo === "pago_proveedor") {
        const fact = (tipo === "cobro_cliente" ? facturasVenta : facturasCompra).find(f => f.id === facturaSel);
        // Pago a proveedor: pueden coexistir cesiones de cartera + cuotas (transferencia/emisión de echeqs)
        const cesionesAProcesar = (tipo === "pago_proveedor" && !initial) ? echeqsCedidos : [];
        const filasValidas = cuotas.filter(c => Number(c.monto) > 0);
        if (filasValidas.length === 0 && cesionesAProcesar.length === 0) {
          toast.error("Cargá al menos una cuota con monto o seleccioná un echeq a ceder");
          return;
        }
        // Objetivos de imputación: una o varias facturas del mismo proveedor
        const idsObjetivo = (multiActivo && facturasMulti.length > 0) ? facturasMulti : (facturaSel ? [facturaSel] : []);
        let objetivos: { id: string; restante: number }[] = [];
        if (idsObjetivo.length > 0) {
          const { data: previos } = await sb.from("fema_movimientos_pago")
            .select("factura_compra_id,factura_venta_id,monto,estado")
            .in(tipo === "pago_proveedor" ? "factura_compra_id" : "factura_venta_id", idsObjetivo);
          const lista = tipo === "cobro_cliente" ? facturasVenta : facturasCompra;
          objetivos = construirObjetivos(
            idsObjetivo.map(fid => ({ id: fid, total: lista.find(x => x.id === fid)?.total ?? 0 })),
            (previos ?? []) as any,
            tipo === "cobro_cliente" ? "venta" : "compra",
          );
        }
        // Reparte un importe entre las facturas pendientes (lógica pura y testeada)
        const repartir = (importe: number) => repartirImporte(objetivos, importe, facturaSel);
        // Un echeq cedido es indivisible: se imputa a la primera factura con saldo
        const imputarEcheq = (importe: number) => imputarIndivisible(objetivos, importe, facturaSel);
        // Operación única y atómica: cesiones + altas + bajas + reconciliación de facturas.
        const opCeder: string[] = [];
        const opInsert: any[] = [];
        const opUpdate: any[] = [];
        const opBorrar: string[] = [];
        if (cesionesAProcesar.length > 0) {
          const provNombre = contraparte || fact?.proveedor || "Proveedor";
          for (const eid of cesionesAProcesar) {
            const e = echeqsCartera.find(x => x.id === eid);
            if (!e) continue;
            opCeder.push(eid);
            opInsert.push({
              instrumento: "cesion", direccion: "pago",
              tipo_movimiento: "ceder_echeq",
              fecha_emision: new Date().toISOString().split("T")[0],
              vencimiento: e.vencimiento, numero: e.numero, banco: e.banco,
              contraparte: provNombre, monto: e.monto, estado: "pagado",
              echeq_origen_id: eid,
              factura_compra_id: imputarEcheq(Number(e.monto)),
              observaciones: observaciones || `Cesión echeq Nº ${e.numero ?? ""} a ${provNombre}`,
              anio: year, mes,
            });
          }
        }
        if (filasValidas.length > 0) {
        if (initial) {
          // edición: actualiza única fila
          const c = filasValidas[0];
          const payload: any = {
            id: initial.id,
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
          opUpdate.push(payload);
        } else {
          // Filas con id → UPDATE (cuotas del plan original modificadas/confirmadas)
          // Filas sin id → INSERT (nuevas)
          // ids originales que ya no están → DELETE
          const keepIds = filasValidas.filter(c => c.id).map(c => c.id!) as string[];
          opBorrar.push(...planOriginalIds.filter(id => !keepIds.includes(id)));
          for (const c of filasValidas) {
            const mkBase = (facturaId: string | null, m: number, obsExtra?: string): any => ({
              instrumento: instrumento as any,
              direccion: tipo === "cobro_cliente" ? "cobro" : "pago",
              tipo_movimiento: tipo,
              fecha_emision: fechaEmision || new Date().toISOString().split("T")[0],
              vencimiento: c.vencimiento || null,
              numero: c.numero || null,
              banco: c.banco || bancoGlobal || null,
              contraparte: contraparte || (fact?.proveedor ?? null),
              monto: m,
              estado,
              observaciones: [c.obs || observaciones || "", obsExtra].filter(Boolean).join(" · ") || null,
              factura_venta_id: tipo === "cobro_cliente" ? facturaId : null,
              factura_compra_id: tipo === "pago_proveedor" ? facturaId : null,
              anio: year, mes,
            });
            if (c.id) {
              opUpdate.push({ ...mkBase(facturaSel, Number(c.monto)), id: c.id });
            } else {
              const lista = tipo === "cobro_cliente" ? facturasVenta : facturasCompra;
              for (const chunk of repartir(Number(c.monto))) {
                const nro = lista.find(x => x.id === chunk.facturaId)?.numero;
                const obsExtra = objetivos.length > 1 && nro ? `Imputado a Fact. ${nro}` : undefined;
                opInsert.push(mkBase(chunk.facturaId, chunk.monto, obsExtra));
              }
            }
          }
        }
        }
        // Un solo viaje al servidor: si algo falla, no queda nada a medias.
        const { error: rpcErr } = await (sb as any).rpc("fema_registrar_pago", {
          _borrar: opBorrar,
          _ceder: opCeder,
          _inserts: opInsert,
          _updates: opUpdate,
        });
        if (rpcErr) throw rpcErr;
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
      if (tipo === "pago_proveedor") {
        const ids = (multiActivo && facturasMulti.length > 0) ? facturasMulti : (facturaSel ? [facturaSel] : []);
        for (const fid of ids) await reconciliarFactura(fid, "compra");
      }
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <TipoBtn icon={<FileText className="w-4 h-4" />} label="Cobro de cliente" sub="Facturas de servicio" active={tipo === "cobro_cliente"} onClick={() => setTipo("cobro_cliente")} />
          <TipoBtn icon={<ShoppingCart className="w-4 h-4" />} label="Pago a proveedor" sub="Facturas de compra" active={tipo === "pago_proveedor"} onClick={() => setTipo("pago_proveedor")} />
          <TipoBtn icon={<Edit3 className="w-4 h-4" />} label="Libre" sub="Sin comprobante" active={tipo === "libre"} onClick={() => setTipo("libre")} />
        </div>
      </div>

      {(tipo === "cobro_cliente" || tipo === "pago_proveedor") && (
        <div className="space-y-3">
          <FormField label={tipo === "cobro_cliente" ? "Factura de cliente a cobrar" : "Facturas del proveedor a pagar (selección múltiple)"}>
            <Input placeholder="Buscar por cliente / proveedor / Nº factura..." value={busqFact} onChange={(e) => setBusqFact(e.target.value)} />
          </FormField>

          {multiActivo ? (
            <div className="space-y-2">
              {facturasSeleccionadas.length > 0 && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-sm uppercase truncate">{facturasSeleccionadas[0].proveedor}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{facturasSeleccionadas.length} factura(s)</span>
                      <span className="font-mono text-emerald-400 text-base">{formatPesos(totalMulti)}</span>
                      <Button size="sm" variant="outline" onClick={() => { setFacturasMulti([]); setFacturaSel(null); setCuotas([{ numero: "", banco: "", vencimiento: "", monto: 0, obs: "" }]); }}>
                        <XIcon className="w-3 h-3 mr-1" />Limpiar
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {facturasSeleccionadas.map(f => `${f.numero ?? "s/n"} (${formatPesos(f.total)})`).join(" · ")}
                  </div>
                </div>
              )}
              <div className="max-h-56 overflow-auto border rounded-md divide-y">
                {facturasFiltradas.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sin facturas</div>}
                {facturasFiltradas.map(f => {
                  const sel = facturasMulti.includes(f.id);
                  return (
                    <button key={f.id} type="button"
                      onClick={() => {
                        toggleFacturaMulti(f);
                        const nuevos = sel ? facturasMulti.filter(x => x !== f.id) : [...facturasMulti, f.id];
                        const suma = nuevos.reduce((a, id) => a + Number(facturasCompra.find(x => x.id === id)?.total ?? 0), 0);
                        setMonto(suma);
                        setContraparte(f.proveedor ?? "");
                        setCuotas([{ numero: "", banco: bancoGlobal || "", vencimiento: "", monto: suma, obs: "" }]);
                      }}
                      className={`w-full text-left p-3 hover:bg-muted/50 ${sel ? "bg-primary/10" : ""}`}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${sel ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"}`}>{sel ? "✓" : ""}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{f.proveedor ?? "Proveedor"}</div>
                            <div className="text-xs text-muted-foreground truncate">Fact. {f.numero ?? "s/n"} · {formatFecha(f.fecha)} {f.trabajo ? `· ${f.trabajo}` : ""}</div>
                          </div>
                        </div>
                        <div className="font-mono text-emerald-400 text-sm shrink-0">{formatPesos(f.total)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {proveedorSel && (
                <div className="text-[11px] text-muted-foreground">
                  Sólo se listan facturas de <b>{facturasSeleccionadas[0]?.proveedor}</b>. Limpiá la selección para cambiar de proveedor.
                </div>
              )}
            </div>
          ) : facturaActual ? (
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

          {tipo === "pago_proveedor" && !initial && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-muted-foreground">
              Podés combinar varios medios de pago en un mismo movimiento: cargá <b>cesiones de echeqs de cartera</b> abajo, y/o <b>transferencias / echeqs emitidos</b> en la tabla de instrumentos. El sistema guardará todo junto al confirmar.
            </div>
          )}

          {tipo === "pago_proveedor" && !initial && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs uppercase text-amber-400 font-semibold tracking-wide">Ceder echeqs de cartera (opcional · selección múltiple)</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input placeholder="Filtrar por Nº / cliente / banco..." value={busqCartera} onChange={(e) => setBusqCartera(e.target.value)} className="w-56 h-8" />
                  <div className="flex items-center gap-1">
                    <Input type="date" value={fechaDesdeCartera} onChange={(e) => setFechaDesdeCartera(e.target.value)} className="w-32 h-8 text-xs" />
                    <span className="text-xs text-muted-foreground">a</span>
                    <Input type="date" value={fechaHastaCartera} onChange={(e) => setFechaHastaCartera(e.target.value)} className="w-32 h-8 text-xs" />
                  </div>
                  <Select value={ordenCartera} onValueChange={(v) => setOrdenCartera(v as any)}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pago_asc">Fecha pago ↑</SelectItem>
                      <SelectItem value="pago_desc">Fecha pago ↓</SelectItem>
                      <SelectItem value="monto_mayor">Monto mayor</SelectItem>
                      <SelectItem value="monto_menor">Monto menor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border divide-y">
                <div className="hidden sm:grid grid-cols-6 gap-3 px-2 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground items-center">
                  <div className="col-span-1 pl-6">Nº</div>
                  <div className="col-span-1">Cliente / Origen</div>
                  <div className="col-span-1">Banco</div>
                  <div className="col-span-1">Fecha de pago</div>
                  <div className="col-span-1 text-right">Monto</div>
                  <div className="col-span-1"></div>
                </div>
                {echeqsCarteraFiltrados.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">Sin echeqs en cartera</div>
                )}
                {echeqsCarteraFiltrados.map(e => {
                  const checked = echeqsCedidos.includes(e.id);
                  const vencido = e.vencimiento && e.vencimiento < new Date().toISOString().split("T")[0];
                  return (
                    <label key={e.id} className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/10" : ""} ${vencido && !checked ? "bg-red-500/10" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleEcheqCedido(e.id)} />
                      <div className="flex-1 min-w-0 grid grid-cols-6 gap-3 text-xs items-center">
                        <div className="font-mono truncate">Nº {e.numero ?? "s/n"}</div>
                        <div className="truncate text-muted-foreground">{e.contraparte ?? "—"}</div>
                        <div className="truncate text-muted-foreground">{e.banco ?? "—"}</div>
                        <div className="truncate">{formatFecha(e.vencimiento)} {vencido && <span className="text-[10px] text-red-400 ml-1">Vencido</span>}</div>
                        <div className="text-right font-mono text-emerald-400">{formatPesos(Number(e.monto))}</div>
                        <div className="text-right">
                          {checked && <Badge variant="outline" className="text-[10px] h-5">Seleccionado</Badge>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">{echeqsCedidos.length} seleccionados</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">Subtotal cesiones</span>
                  <span className="font-mono font-semibold">{formatPesos(totalCedidos)}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Los echeqs seleccionados pasarán a estado "Cedido" y quedarán vinculados a esta factura de compra.</p>
            </div>
          )}

          <>
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
                <span className="text-muted-foreground">Instrumentos</span>
                <span className="font-mono font-semibold">{formatPesos(totalCargado)}</span>
                {totalCedidos > 0 && (
                  <>
                    <span className="text-muted-foreground">+ Cesiones</span>
                    <span className="font-mono font-semibold text-amber-400">{formatPesos(totalCedidos)}</span>
                    <span className="text-muted-foreground">= Total</span>
                    <span className="font-mono font-semibold">{formatPesos(totalCombinado)}</span>
                  </>
                )}
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
          </>
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
        <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar movimiento"}</Button>
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

  const descargarPDF = async () => {
    const el = document.querySelector(".recibo-print") as HTMLElement | null;
    if (!el) { toast.error("No se pudo generar el PDF"); return; }
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set(femaPdfOptions(`${tituloDoc.replace(/\s+/g, "_")}_${reciboNro}.pdf`, ".recibo-print"))
        .from(el)
        .save();
    } catch (e: any) {
      toast.error("Error generando PDF: " + (e?.message ?? ""));
    }
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
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" onClick={imprimir}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
        <Button onClick={descargarPDF}><Printer className="w-4 h-4 mr-2" />Descargar PDF</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DepositoDialog({ mov, cuentas, onClose, onConfirm }: {
  mov: Mov; cuentas: any[];
  onClose: () => void; onConfirm: (cuentaId: string | null) => void;
}) {
  const activas = cuentas.filter((c: any) => c.activa !== false);
  const vista = activas.filter((c: any) => (c.tipo_cuenta ?? "vista") === "vista");
  const lista = vista.length ? vista : activas;
  const [cuentaId, setCuentaId] = useState<string>(lista[0]?.id ?? "");
  const cta = cuentas.find((c: any) => c.id === cuentaId);
  const esPago = mov.direccion === "pago";
  const nuevoSaldo = cta ? Number(cta.saldo || 0) + (esPago ? -1 : 1) * Number(mov.monto) : 0;
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{esPago ? "Debitar de caja" : "Marcar como cobrado"}</DialogTitle>
        <DialogDescription>
          {esPago ? (
            <>El pago de {formatPesos(mov.monto)}{mov.numero ? ` del echeq propio Nº ${mov.numero}` : ""}
            {mov.vencimiento ? ` con fecha de pago ${formatFecha(mov.vencimiento)}` : ""} se <b>descuenta</b> de la
            caja a la vista. La factura ya figura abonada; esto solo impacta el saldo del banco el día del cobro.</>
          ) : (
            <>El cobro de {formatPesos(mov.monto)}{mov.numero ? ` del echeq Nº ${mov.numero}` : ""} se acredita en la
            caja a la vista. Después, con <b>Mover dinero</b>, decidís qué importe pasás a cada fondo de inversión.</>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <FormField label="Caja a la vista">
          <Select value={cuentaId} onValueChange={setCuentaId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
            <SelectContent>
              {lista.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.banco}{c.alias ? ` · ${c.alias}` : ""} — {formatPesos(Number(c.saldo || 0))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {cta && (
          <p className="text-xs text-muted-foreground">
            Saldo actual {formatPesos(Number(cta.saldo || 0))} → nuevo saldo{" "}
            <b className={esPago ? "text-rose-400" : "text-emerald-400"}>{formatPesos(nuevoSaldo)}</b>
            {esPago && nuevoSaldo < 0 && <span className="text-rose-400"> · saldo insuficiente en esa cuenta</span>}
          </p>
        )}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="ghost" onClick={() => onConfirm(null)}>
          {esPago ? "Marcar pagado sin debitar" : "Cobrar sin depositar"}
        </Button>
        <Button onClick={() => onConfirm(cuentaId || null)} disabled={!cuentaId}>
          {esPago ? "Pagar y debitar" : "Cobrar y acreditar"}
        </Button>
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
  return <CuentaBancariaDialogInner initial={initial} userId={userId} onClose={onClose} onSaved={onSaved} />;
}

function PaseFondosDialog({ cuentas, userId, onClose, onSaved }: {
  cuentas: any[]; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const vista = cuentas.filter((c) => (c.tipo_cuenta ?? "vista") === "vista");
  const [origen, setOrigen] = useState<string>(vista[0]?.id ?? cuentas[0]?.id ?? "");
  const [destino, setDestino] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split("T")[0]);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const ctaOrigen = cuentas.find((c) => c.id === origen);
  const ctaDestino = cuentas.find((c) => c.id === destino);
  const importe = Number(monto) || 0;
  const nom = (c: any) => (c ? `${c.banco}${c.alias ? ` · ${c.alias}` : ""} — ${formatPesos(Number(c.saldo || 0))}` : "");

  const guardar = async () => {
    if (!ctaOrigen || !ctaDestino || ctaOrigen.id === ctaDestino.id) { toast.error("Elegí origen y destino distintos"); return; }
    if (importe <= 0) { toast.error("Ingresá el monto a mover"); return; }
    if (importe > Number(ctaOrigen.saldo || 0)) { toast.error("El origen no tiene saldo suficiente"); return; }
    setSaving(true);
    const { error } = await sb.from("fema_mov_fondos").insert({
      user_id: userId, fecha, origen_id: ctaOrigen.id, destino_id: ctaDestino.id,
      monto: importe, observaciones: obs.trim() || null,
      anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)),
    });
    if (error) { setSaving(false); toast.error(error.message); return; }
    await sb.from("fema_cuentas_bancarias").update({ saldo: Number(ctaOrigen.saldo || 0) - importe }).eq("id", ctaOrigen.id);
    await sb.from("fema_cuentas_bancarias").update({ saldo: Number(ctaDestino.saldo || 0) + importe }).eq("id", ctaDestino.id);
    setSaving(false);
    toast.success("Dinero movido");
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Mover dinero entre caja y fondos</DialogTitle>
        <DialogDescription>
          Pasá plata de la caja a la vista a un fondo (o al revés). Los saldos se actualizan solos.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde">
            <Select value={origen} onValueChange={setOrigen}>
              <SelectTrigger><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                {cuentas.map((c) => <SelectItem key={c.id} value={c.id}>{nom(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Hacia">
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
              <SelectContent>
                {cuentas.filter((c) => c.id !== origen).map((c) => <SelectItem key={c.id} value={c.id}>{nom(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto">
            <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </FormField>
          <FormField label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Observaciones">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>
        {ctaOrigen && ctaDestino && importe > 0 && (
          <p className="text-xs text-muted-foreground">
            {ctaOrigen.banco}{ctaOrigen.alias ? ` · ${ctaOrigen.alias}` : ""} queda en{" "}
            <b>{formatPesos(Number(ctaOrigen.saldo || 0) - importe)}</b> ·{" "}
            {ctaDestino.banco}{ctaDestino.alias ? ` · ${ctaDestino.alias}` : ""} queda en{" "}
            <b className="text-emerald-400">{formatPesos(Number(ctaDestino.saldo || 0) + importe)}</b>
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={saving}>Confirmar pase</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CuentaBancariaDialogInner({
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
  const [tipoCuenta, setTipoCuenta] = useState<string>(initial?.tipo_cuenta ?? "vista");
  const [rescate, setRescate] = useState<string>(initial?.rescate ?? "inmediato");
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
      tipo_cuenta: tipoCuenta,
      rescate: tipoCuenta === "fondo" ? rescate : null,
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
        <DialogDescription>
          Poné el saldo que hoy figura en el banco (antes de acreditar echeqs). Después, cada echeq
          cobrado se suma solo a esta cuenta.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <FormField label="Banco *">
          <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej: BANCO NACION" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Alias / Titular">
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
          </FormField>
          <FormField label="Saldo actual en el banco">
            <Input type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tipo de cuenta">
            <Select value={tipoCuenta} onValueChange={setTipoCuenta}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vista">Caja a la vista (para transferir)</SelectItem>
                <SelectItem value="fondo">Fondo de inversión</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {tipoCuenta === "fondo" && (
            <FormField label="Plazo de rescate">
              <Select value={rescate} onValueChange={setRescate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inmediato">Rescate inmediato</SelectItem>
                  <SelectItem value="24hs">Rescate en 24 hs</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
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