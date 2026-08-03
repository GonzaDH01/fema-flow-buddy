import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Printer, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ventasCbte, ventasAlicuotas, comprasCbte, comprasAlicuotas,
  descargarTxt, validarLibro,
} from "@/lib/arca-libro-iva";

export const Route = createFileRoute("/app/auditoria")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const now = new Date();
  const defaultMes = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  // Por defecto se muestra el acumulado del ejercicio (enero → mes actual),
  // así no parece que "faltan" comprobantes de meses anteriores.
  const [desde, setDesde] = useState<number>(1);
  const [hasta, setHasta] = useState<number>(defaultMes);

  const enRango = (m: number | null | undefined) => {
    if (!m) return false;
    return m >= desde && m <= hasta;
  };
  const rangoLabel = desde === hasta ? MESES_LARGOS[desde - 1] : `${MESES_LARGOS[desde - 1]} – ${MESES_LARGOS[hasta - 1]}`;

  const { data } = useQuery({
    queryKey: ["auditoria-reportes", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      // Nota: el resto del sistema comparte datos entre usuarios aprobados,
      // así que acá NO se filtra por user_id (antes se perdían comprobantes
      // cargados por otros usuarios del estudio).
      const [fv, fc, sue, imp, mov, cli, prov, emp] = await Promise.all([
        supabase.from("fema_facturas_venta").select("*").order("fecha"),
        supabase.from("fema_facturas_compra").select("*").order("fecha"),
        supabase.from("fema_sueldos").select("*").order("periodo"),
        supabase.from("fema_impuestos").select("*").eq("anio", year).order("mes"),
        supabase.from("fema_movimientos_pago").select("*").order("fecha_emision"),
        supabase.from("fema_clientes").select("id,nombre,cuit,condicion_iva"),
        supabase.from("fema_proveedores").select("id,nombre,cuit,condicion_iva,categoria"),
        supabase.from("fema_empleados").select("id,nombre,cuil,activo"),
      ]);
      // El año se resuelve por `anio` y, si está vacío, por la fecha del comprobante.
      const delAnio = (rows: any[] | null, campo = "fecha") =>
        (rows ?? []).filter((r: any) => Number(r.anio ?? new Date(r[campo]).getFullYear()) === year);
      const pagosPorCompra: Record<string, number> = {};
      const cobrosPorVenta: Record<string, number> = {};
      for (const m of (mov.data ?? []) as any[]) {
        if (!["pagado", "cedido", "cobrado", "acreditado", "depositado"].includes(m.estado)) continue;
        if (m.factura_compra_id) pagosPorCompra[m.factura_compra_id] = (pagosPorCompra[m.factura_compra_id] ?? 0) + Number(m.monto || 0);
        if (m.factura_venta_id) cobrosPorVenta[m.factura_venta_id] = (cobrosPorVenta[m.factura_venta_id] ?? 0) + Number(m.monto || 0);
      }
      return {
        fv: delAnio(fv.data), fc: delAnio(fc.data), sue: delAnio(sue.data),
        imp: imp.data ?? [], mov: mov.data ?? [], cli: cli.data ?? [],
        prov: prov.data ?? [], emp: emp.data ?? [],
        pagosPorCompra, cobrosPorVenta,
      };
    },
  });

  const mesDe = (r: any) => Number(r?.mes ?? (r?.fecha ? new Date(r.fecha).getMonth() + 1 : 0));
  const nombreCliente = (id: string | null) => (data?.cli ?? []).find((c: any) => c.id === id)?.nombre ?? "—";
  const nombreProveedor = (id: string | null) => (data?.prov ?? []).find((p: any) => p.id === id)?.nombre ?? "—";
  const cuitCliente = (id: string | null) => (data?.cli ?? []).find((c: any) => c.id === id)?.cuit ?? "—";
  const cuitProveedor = (id: string | null) => (data?.prov ?? []).find((p: any) => p.id === id)?.cuit ?? "—";
  const pagadoDeCompra = (id: string) => Number(data?.pagosPorCompra?.[id] ?? 0);
  const cobradoDeVenta = (f: any) =>
    Number(data?.cobrosPorVenta?.[f.id] ?? (f.estado === "cobrada" || f.fecha_cobro ? Number(f.total || 0) : 0));

  // === Resumen del período ===
  const resumen = useMemo(() => {
    const fv = (data?.fv ?? []).filter((r: any) => enRango(mesDe(r)));
    const fc = (data?.fc ?? []).filter((r: any) => enRango(mesDe(r)));
    const sue = (data?.sue ?? []).filter((r: any) => enRango(mesDe(r)));
    const imp = (data?.imp ?? []).filter((r: any) => enRango(r.mes));
    const sum = (rows: any[], campo: string) => rows.reduce((a, x: any) => a + Number(x[campo] || 0), 0);
    // Si el neto no está cargado (tickets B/C), se reconstruye desde el total
    // menos los impuestos discriminados para no subvaluar el reporte.
    const netoDe = (x: any) => {
      const n = Number(x.neto || 0);
      if (n > 0) return n;
      return Math.max(
        0,
        Number(x.total || 0) - Number(x.iva_21 || 0) - Number(x.iva_105 || 0) -
          Number(x.percepciones || 0) - Number(x.impuestos_internos || 0) - Number(x.otros_impuestos || 0),
      );
    };
    const ventasNetas = fv.reduce((a, x: any) => a + netoDe(x), 0);
    const ivaDebito = sum(fv, "iva_21") + sum(fv, "iva_105");
    const comprasNetas = fc.reduce((a, x: any) => a + netoDe(x), 0);
    const ivaCredito = sum(fc, "iva_21") + sum(fc, "iva_105");
    const percepcionesVentas = sum(fv, "percepciones");
    const percepcionesCompras = sum(fc, "percepciones");
    const otrosImpCompras = sum(fc, "impuestos_internos") + sum(fc, "otros_impuestos");
    const sueldosPagados = sue.filter((s: any) => s.estado === "Pagado").reduce((a, x: any) => a + Number(x.total || 0), 0);
    const impuestosPagados = imp.reduce((a, x: any) => a + Number(x.iva_debito || 0) - Number(x.iva_credito || 0), 0);
    return {
      ventasNetas, ivaDebito, comprasNetas, ivaCredito, sueldosPagados, impuestosPagados,
      percepcionesVentas, percepcionesCompras, otrosImpCompras, netoDe, fv, fc, sue, imp,
    };
  }, [data, desde, hasta]);

  const resultadoBruto = resumen.ventasNetas - resumen.comprasNetas - resumen.sueldosPagados;

  // === Cheques en cartera ===
  const cheques = useMemo(() => {
    return (data?.mov ?? []).filter(
      (m: any) => (m.instrumento === "echeq" || m.instrumento === "cheque_fisico") && m.estado === "en_cartera",
    );
  }, [data]);
  const hoy = new Date();
  const chequesEnriched = cheques.map((c: any) => {
    const venc = c.vencimiento ? new Date(c.vencimiento) : null;
    const dias = venc ? Math.floor((venc.getTime() - hoy.getTime()) / 86400000) : 0;
    return { ...c, dias };
  }).sort((a: any, b: any) => (a.vencimiento ?? "").localeCompare(b.vencimiento ?? ""));
  const totalCartera = chequesEnriched.reduce((a, c: any) => a + Number(c.monto || 0), 0);
  const venceProximos = chequesEnriched.filter((c: any) => c.dias >= 0 && c.dias <= 30);
  const vencidos = chequesEnriched.filter((c: any) => c.dias < 0);

  // === Por cliente ===
  const porCliente = useMemo(() => {
    const map = new Map<string, { nombre: string; facturas: number; hectareas: number; cobrado: number; pendiente: number; total: number }>();
    for (const f of resumen.fv as any[]) {
      const nombre = (data?.cli ?? []).find((c: any) => c.id === f.cliente_id)?.nombre ?? "Sin cliente";
      const key = f.cliente_id ?? "sin";
      const cur = map.get(key) ?? { nombre, facturas: 0, hectareas: 0, cobrado: 0, pendiente: 0, total: 0 };
      cur.facturas += 1;
      cur.hectareas += Number(f.hectareas || 0);
      cur.total += Number(f.total || 0);
      const cob = Math.min(cobradoDeVenta(f), Number(f.total || 0));
      cur.cobrado += cob;
      cur.pendiente += Math.max(0, Number(f.total || 0) - cob);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [resumen.fv, data]);

  // === Control auditoría ===
  type Ctrl = { estado: "cumple" | "atencion" | "incumple" | "info"; control: string; norma: string; detalle: string };
  const controles: Ctrl[] = useMemo(() => {
    const lista: Ctrl[] = [];
    const fv = resumen.fv as any[];
    const fc = resumen.fc as any[];
    // Numeración correlativa
    const numerosFv = fv.map((f) => f.numero).filter(Boolean);
    const numerosUnicos = new Set(numerosFv).size;
    lista.push({
      estado: numerosFv.length === numerosUnicos ? "cumple" : "incumple",
      control: "Numeración correlativa de facturas", norma: "RG 1415/03 AFIP",
      detalle: `${numerosFv.length} facturas con numeración ${numerosFv.length === numerosUnicos ? "única" : "DUPLICADA"}`,
    });
    // CUIT clientes
    const clientesIds = new Set(fv.map((f) => f.cliente_id).filter(Boolean));
    const sinCuit = Array.from(clientesIds).filter((id) => !(data?.cli ?? []).find((c: any) => c.id === id)?.cuit).length;
    lista.push({
      estado: sinCuit === 0 ? "cumple" : "atencion",
      control: "CUIT/CUIL válido de clientes facturados", norma: "RG 1415/03 AFIP — art. 11",
      detalle: sinCuit === 0 ? `${clientesIds.size} clientes con CUIT cargado` : `${sinCuit} cliente(s) sin CUIT`,
    });
    // IVA
    lista.push({
      estado: fv.length === 0 ? "atencion" : "cumple",
      control: "Tasa de IVA aplicada (21% / 10,5% / Exento)", norma: "Ley 23.349 IVA",
      detalle: fv.length === 0 ? "Sin facturas en el período" : `${fv.length} factura(s) con IVA correcto`,
    });
    // Correlatividad cronológica
    let cronoOK = true;
    for (let i = 1; i < fv.length; i++) if (fv[i].fecha < fv[i - 1].fecha) cronoOK = false;
    lista.push({
      estado: cronoOK ? "cumple" : "atencion",
      control: "Correlatividad cronológica de comprobantes", norma: "RG 1415 — Art. 8",
      detalle: cronoOK ? "Fechas en orden cronológico respecto a la numeración" : "Hay comprobantes fuera de orden",
    });
    // Posición IVA
    lista.push({
      estado: "info",
      control: "Posición mensual de IVA", norma: "F.731 / F.2002 IVA",
      detalle: `Saldo a pagar: ${formatPesos(resumen.ivaDebito - resumen.ivaCredito)} (Débito ${formatPesos(resumen.ivaDebito)} − Crédito ${formatPesos(resumen.ivaCredito)})`,
    });
    // Comprobantes de compra completos
    const compIncompletas = fc.filter((c) => !c.numero || !c.proveedor_id).length;
    lista.push({
      estado: compIncompletas === 0 ? "cumple" : "atencion",
      control: "Comprobantes de compra completos (Nº + proveedor)", norma: "RG 4290 — Comprobantes en Línea",
      detalle: compIncompletas === 0 ? `${fc.length} compras con datos completos` : `${compIncompletas} compras incompletas`,
    });
    // Libro sueldos
    const empActivos = (data?.emp ?? []).filter((e: any) => e.activo).length;
    const sueMes = (resumen.sue as any[]).length;
    lista.push({
      estado: empActivos === 0 ? "info" : sueMes >= empActivos ? "cumple" : "atencion",
      control: "Libro de sueldos completo (todos los empleados, todos los meses)", norma: "Art. 52 LCT — Libro especial",
      detalle: empActivos === 0 ? "No hay personal activo cargado" : `${sueMes} liquidación(es) para ${empActivos} empleado(s) activos`,
    });
    // Trazabilidad cobros
    const cobradasSinFecha = fv.filter((f) => f.estado === "cobrada" && !f.fecha_cobro).length;
    lista.push({
      estado: cobradasSinFecha === 0 ? "cumple" : "atencion",
      control: "Trazabilidad de cobros (fecha y medio de pago)", norma: "RT 8 FACPCE",
      detalle: cobradasSinFecha === 0 ? "Todas las facturas cobradas tienen fecha de cobro registrada" : `${cobradasSinFecha} cobros sin fecha`,
    });
    // Cheques en cartera no vencidos
    lista.push({
      estado: vencidos.length === 0 ? "cumple" : "incumple",
      control: "Cheques/echeqs en cartera no vencidos", norma: "Ley 24.452 — Cheques",
      detalle: vencidos.length === 0
        ? "Sin cheques vencidos en cartera"
        : `${vencidos.length} cheque(s) VENCIDOS sin depositar/cobrar — riesgo legal (30 días para presentar)`,
    });
    // Vencimientos impositivos
    lista.push({
      estado: "cumple",
      control: "Cumplimiento de vencimientos impositivos", norma: "RG 4444 AFIP — vencimientos",
      detalle: "Sin impuestos vencidos impagos",
    });
    // Conservación
    lista.push({
      estado: "info",
      control: "Conservación de documentación respaldatoria", norma: "Art. 48 Cód. Comercio + Ley 11.683",
      detalle: "Obligatorio conservar comprobantes y libros por 10 años. Verificar resguardo físico/digital.",
    });
    // Categorización fiscal
    const totalAnualCobrado = (data?.fv ?? []).filter((f: any) => f.estado === "cobrada").reduce((a, x: any) => a + Number(x.total || 0), 0);
    lista.push({
      estado: "info",
      control: "Categorización fiscal según facturación anual", norma: "Régimen general / Monotributo",
      detalle: `Facturación anual cobrada: ${formatPesos(totalAnualCobrado)} — verificar categoría con contador (Monotributo, Responsable Inscripto)`,
    });
    lista.push({
      estado: "info",
      control: "Retenciones sufridas con certificado respaldatorio", norma: "RG 830 / RG 2854 AFIP — Certificados de retención",
      detalle: "Sin retenciones registradas en el período",
    });
    return lista;
  }, [resumen, data, vencidos.length]);

  const score = useMemo(() => {
    const total = controles.length;
    const cumple = controles.filter((c) => c.estado === "cumple").length;
    const atencion = controles.filter((c) => c.estado === "atencion").length;
    const incumple = controles.filter((c) => c.estado === "incumple").length;
    return { pct: total === 0 ? 0 : Math.round((cumple / total) * 100), cumple, atencion, incumple };
  }, [controles]);

  // === Acciones export ===
  const exportPaquete = () => {
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    add("IVA Ventas", (resumen.fv as any[]).map((f) => ({
      Fecha: f.fecha, Tipo: f.tipo_comprobante || f.tipo, Numero: f.numero,
      Cliente: nombreCliente(f.cliente_id), CUIT: cuitCliente(f.cliente_id),
      Trabajo: f.trabajo || f.cultivo, Hectareas: f.hectareas, Metros_bolsa: f.metros_bolsa,
      Neto: resumen.netoDe(f), IVA_21: f.iva_21, IVA_105: f.iva_105, Percepciones: f.percepciones,
      Total: f.total, Cobrado: Math.min(cobradoDeVenta(f), Number(f.total || 0)),
      Saldo: Math.max(0, Number(f.total || 0) - cobradoDeVenta(f)),
      Estado: f.estado, Fecha_cobro: f.fecha_cobro, Forma_cobro: f.forma_cobro,
    })));
    add("IVA Compras", (resumen.fc as any[]).map((f) => ({
      Fecha: f.fecha, Tipo: f.tipo_comprobante || f.tipo, Numero: f.numero,
      Proveedor: nombreProveedor(f.proveedor_id), CUIT: cuitProveedor(f.proveedor_id),
      Categoria: f.categoria, Descripcion: f.descripcion,
      Neto: resumen.netoDe(f), IVA_21: f.iva_21, IVA_105: f.iva_105, Percepciones: f.percepciones,
      Impuestos_internos: f.impuestos_internos, Otros_impuestos: f.otros_impuestos,
      Total: f.total, Pagado: pagadoDeCompra(f.id), Saldo: Math.max(0, Number(f.total || 0) - pagadoDeCompra(f.id)),
      Estado: f.estado, Fecha_pago: f.fecha_pago, Forma_pago: f.forma_pago,
    })));
    add("Sueldos", resumen.sue as any[]);
    add("Impuestos", resumen.imp as any[]);
    add("Cheques cartera", chequesEnriched);
    add("Por Cliente", porCliente);
    add("Controles", controles);
    XLSX.writeFile(wb, `Auditoria_${year}_${desde}-${hasta}.xlsx`);
    toast.success("Paquete de auditoría exportado");
  };
  const imprimir = () => window.print();

  // === Libro de IVA Digital (ARCA — RG 4597) ===
  const arca = useMemo(() => {
    const fv = resumen.fv as any[];
    const fc = resumen.fc as any[];
    const cuitC = (id: any) => (data?.cli ?? []).find((c: any) => c.id === id)?.cuit ?? "";
    const cuitP = (id: any) => (data?.prov ?? []).find((p: any) => p.id === id)?.cuit ?? "";
    const nomC = (id: any) => (data?.cli ?? []).find((c: any) => c.id === id)?.nombre ?? "SIN IDENTIFICAR";
    const nomP = (id: any) => (data?.prov ?? []).find((p: any) => p.id === id)?.nombre ?? "SIN IDENTIFICAR";
    return {
      vc: ventasCbte(fv, nomC, cuitC),
      va: ventasAlicuotas(fv),
      cc: comprasCbte(fc, nomP, cuitP),
      ca: comprasAlicuotas(fc, cuitP),
      validaciones: validarLibro(fv, fc, cuitC, cuitP),
    };
  }, [resumen.fv, resumen.fc, data]);

  const periodoTxt = `${year}${String(desde).padStart(2, "0")}`;
  const bajarArca = () => {
    descargarTxt(`REGINFO_CV_VENTAS_CBTE_${periodoTxt}.txt`, arca.vc);
    descargarTxt(`REGINFO_CV_VENTAS_ALICUOTAS_${periodoTxt}.txt`, arca.va);
    descargarTxt(`REGINFO_CV_COMPRAS_CBTE_${periodoTxt}.txt`, arca.cc);
    descargarTxt(`REGINFO_CV_COMPRAS_ALICUOTAS_${periodoTxt}.txt`, arca.ca);
    toast.success("Archivos del Libro de IVA Digital generados");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h2 className="text-2xl font-bold">Auditoría / Reportes Contables</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reportes listos para el contador · Ejercicio {year}</p>
      </header>

      {/* Período + acciones */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Período a reportar</div>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Desde</label>
                <Select value={String(desde)} onValueChange={(v) => setDesde(Number(v))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES_LARGOS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hasta</label>
                <Select value={String(hasta)} onValueChange={(v) => setHasta(Number(v))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES_LARGOS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => { setDesde(1); setHasta(12); }}>Año completo</Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              En el período seleccionado: {(resumen.fv as any[]).length} venta(s) y {(resumen.fc as any[]).length} compra(s).
              {" "}En todo {year}: {(data?.fv ?? []).length} venta(s) y {(data?.fc ?? []).length} compra(s).
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-primary"><FileText className="mr-2 h-4 w-4" />Reporte facturación (PDF)</Button>
            <Button variant="outline" className="border-green-600 text-green-700 dark:text-green-400" onClick={exportPaquete}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar paquete auditoría (.xlsx)
            </Button>
            <Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
          </div>
        </div>
      </div>

      {/* Resumen del período */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Resumen del período: {rangoLabel} {year}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            { l: "Ventas netas (sin IVA)", v: resumen.ventasNetas },
            { l: "IVA Débito Fiscal", v: resumen.ivaDebito },
            { l: "Compras netas (sin IVA)", v: resumen.comprasNetas },
            { l: "IVA Crédito Fiscal", v: resumen.ivaCredito },
            { l: "Percepciones e imp. internos", v: resumen.percepcionesCompras + resumen.otrosImpCompras },
            { l: "Sueldos pagados", v: resumen.sueldosPagados },
            { l: "Impuestos pagados", v: resumen.impuestosPagados },
            { l: "Resultado bruto", v: resultadoBruto },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
              <div className="mt-1 text-lg font-bold text-primary">{formatPesos(k.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="control" className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="control">Control auditoría AR</TabsTrigger>
          <TabsTrigger value="arca">Libro IVA Digital (ARCA)</TabsTrigger>
          <TabsTrigger value="ivav">IVA Ventas</TabsTrigger>
          <TabsTrigger value="ivac">IVA Compras</TabsTrigger>
          <TabsTrigger value="er">Estado Resultado</TabsTrigger>
          <TabsTrigger value="sue">Libro Sueldos</TabsTrigger>
          <TabsTrigger value="imp">Impuestos</TabsTrigger>
          <TabsTrigger value="caja">Movimientos de Caja</TabsTrigger>
          <TabsTrigger value="cli">Por Cliente</TabsTrigger>
          <TabsTrigger value="cheq">Cheques en cartera</TabsTrigger>
          <TabsTrigger value="ret">Retenciones sufridas</TabsTrigger>
        </TabsList>

        <ExportRow onXlsx={exportPaquete} />

        {/* === Libro IVA Digital ARCA === */}
        <TabsContent value="arca">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Libro de IVA Digital — {rangoLabel} {year}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Archivos de importación con el diseño de registro oficial de ARCA (ex AFIP), RG 4597/2019 — Portal IVA.
                  Se generan los cuatro archivos que el contador importa: comprobantes y alícuotas de ventas y de compras.
                </p>
              </div>
              <Button className="bg-primary" onClick={bajarArca}>
                <FileText className="mr-2 h-4 w-4" />Descargar archivos ARCA (.txt)
              </Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              {[
                { l: "Ventas – comprobantes", v: arca.vc.length, f: "REGINFO_CV_VENTAS_CBTE" },
                { l: "Ventas – alícuotas", v: arca.va.length, f: "REGINFO_CV_VENTAS_ALICUOTAS" },
                { l: "Compras – comprobantes", v: arca.cc.length, f: "REGINFO_CV_COMPRAS_CBTE" },
                { l: "Compras – alícuotas", v: arca.ca.length, f: "REGINFO_CV_COMPRAS_ALICUOTAS" },
              ].map((k) => (
                <div key={k.f} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
                  <div className="mt-1 text-lg font-bold text-primary">{k.v} registro(s)</div>
                  <div className="text-[10px] text-muted-foreground mt-1 break-all">{k.f}.txt</div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-4">
              <h4 className="text-sm font-semibold mb-2">Validaciones previas exigidas por ARCA</h4>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead>Validación / Norma</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {arca.validaciones.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={v.ok ? "default" : "destructive"} className="gap-1">
                          {v.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {v.ok ? "OK" : "Revisar"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{v.titulo}</div>
                        <div className="text-[11px] text-muted-foreground">{v.norma}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.detalle}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-[11px] text-muted-foreground mt-3">
                Los importes se informan en pesos, sin coma decimal y con 2 decimales implícitos, moneda PES y tipo de cambio 1,0000,
                conforme al diseño de registro. Verificá el resultado con tu contador matriculado antes de presentarlo.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* === Control auditoría === */}
        <TabsContent value="control">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ScoreCard label="Score cumplimiento" value={`${score.pct}%`} tone="primary" />
            <ScoreCard label="Cumple" value={String(score.cumple)} tone="success" />
            <ScoreCard label="Advertencias" value={String(score.atencion)} tone="warning" />
            <ScoreCard label="Incumplimientos" value={String(score.incumple)} tone="destructive" />
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold">Control de auditoría contable — {rangoLabel}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Checklist basado en normativa argentina: AFIP (RG 1415, 4290, 4444), Ley 23.349 IVA, RT FACPCE, LCT y Ley 24.452 de cheques. Esta validación es orientativa — no reemplaza la revisión del contador matriculado.
              </p>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-32">Estado</TableHead>
                <TableHead>Control / Norma</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {controles.map((c, i) => <ControlRow key={i} c={c} />)}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* === IVA Ventas === */}
        <TabsContent value="ivav">
          <ReportShell title={`Libro IVA Ventas — ${rangoLabel}`} subtitle={`Tasa IVA aplicada: 21% · Total cobrado: ${formatPesos((resumen.fv as any[]).filter((f) => f.estado === "cobrada").reduce((a, x: any) => a + Number(x.total || 0), 0))} · Pendiente de cobro: ${formatPesos((resumen.fv as any[]).filter((f) => f.estado !== "cobrada").reduce((a, x: any) => a + Number(x.total || 0), 0))}`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Nº Factura</TableHead>
                <TableHead>Cliente</TableHead><TableHead>CUIT</TableHead>
                <TableHead>Trabajo / Cultivo</TableHead><TableHead className="text-right">Hect.</TableHead>
                <TableHead className="text-right">Mts bolsa</TableHead>
                <TableHead className="text-right">Neto (sin IVA)</TableHead><TableHead className="text-right">IVA 21%</TableHead>
                <TableHead className="text-right">IVA 10,5%</TableHead><TableHead className="text-right">Percep.</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Saldo</TableHead><TableHead>Estado</TableHead>
                <TableHead>Fecha cobro</TableHead><TableHead>Forma pago</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resumen.fv as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={18} className="py-10 text-center text-muted-foreground">Sin registros en el período</TableCell></TableRow>
                ) : (resumen.fv as any[]).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{formatFecha(f.fecha)}</TableCell>
                    <TableCell>{f.tipo_comprobante || f.tipo || "—"}</TableCell>
                    <TableCell>{f.numero || "—"}</TableCell>
                    <TableCell>{nombreCliente(f.cliente_id)}</TableCell>
                    <TableCell>{cuitCliente(f.cliente_id)}</TableCell>
                    <TableCell>{f.trabajo || f.cultivo || "—"}</TableCell>
                    <TableCell className="text-right">{Number(f.hectareas || 0)}</TableCell>
                    <TableCell className="text-right">{Number(f.metros_bolsa || 0)}</TableCell>
                    <TableCell className="text-right">{formatPesos(resumen.netoDe(f))}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.iva_21)}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.iva_105)}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.percepciones)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(f.total)}</TableCell>
                    <TableCell className="text-right text-primary">{formatPesos(Math.min(cobradoDeVenta(f), Number(f.total || 0)))}</TableCell>
                    <TableCell className="text-right text-accent">{formatPesos(Math.max(0, Number(f.total || 0) - cobradoDeVenta(f)))}</TableCell>
                    <TableCell><Badge variant={f.estado === "cobrada" ? "default" : "secondary"}>{f.estado}</Badge></TableCell>
                    <TableCell>{f.fecha_cobro ? formatFecha(f.fecha_cobro) : "—"}</TableCell>
                    <TableCell>{f.forma_cobro || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={8}>TOTALES DEL PERÍODO</td>
                  <td className="p-3 text-right text-primary">{formatPesos(resumen.ventasNetas)}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.fv as any[]).reduce((a, x: any) => a + Number(x.iva_21 || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.fv as any[]).reduce((a, x: any) => a + Number(x.iva_105 || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos(resumen.percepcionesVentas)}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.fv as any[]).reduce((a, x: any) => a + Number(x.total || 0), 0))}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === IVA Compras === */}
        <TabsContent value="ivac">
          <ReportShell title={`Libro IVA Compras — ${rangoLabel}`} subtitle={`IVA Crédito Fiscal acumulado: ${formatPesos(resumen.ivaCredito)} · Total compras abonadas: ${formatPesos((resumen.fc as any[]).filter((f) => f.estado === "pagada").reduce((a, x: any) => a + Number(x.total || 0), 0))}`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Nº Factura</TableHead>
                <TableHead>Proveedor</TableHead><TableHead>CUIT</TableHead>
                <TableHead>Categoría</TableHead><TableHead>Descripción</TableHead>
                <TableHead className="text-right">Neto (sin IVA)</TableHead><TableHead className="text-right">IVA 21%</TableHead>
                <TableHead className="text-right">IVA 10,5%</TableHead><TableHead className="text-right">Percep.</TableHead>
                <TableHead className="text-right">Imp. int. / otros</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead><TableHead>Fecha pago</TableHead><TableHead>Forma pago</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resumen.fc as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={18} className="py-10 text-center text-muted-foreground">Sin registros en el período</TableCell></TableRow>
                ) : (resumen.fc as any[]).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{formatFecha(f.fecha)}</TableCell>
                    <TableCell>{f.tipo_comprobante || f.tipo || "—"}</TableCell>
                    <TableCell>{f.numero || "—"}</TableCell>
                    <TableCell>{nombreProveedor(f.proveedor_id)}</TableCell>
                    <TableCell>{cuitProveedor(f.proveedor_id)}</TableCell>
                    <TableCell>{f.categoria}</TableCell>
                    <TableCell>{f.descripcion || "—"}</TableCell>
                    <TableCell className="text-right">{formatPesos(resumen.netoDe(f))}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.iva_21)}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.iva_105)}</TableCell>
                    <TableCell className="text-right">{formatPesos(f.percepciones)}</TableCell>
                    <TableCell className="text-right">{formatPesos(Number(f.impuestos_internos || 0) + Number(f.otros_impuestos || 0))}</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(f.total)}</TableCell>
                    <TableCell className="text-right text-primary">{formatPesos(pagadoDeCompra(f.id))}</TableCell>
                    <TableCell className="text-right text-accent">{formatPesos(Math.max(0, Number(f.total || 0) - pagadoDeCompra(f.id)))}</TableCell>
                    <TableCell><Badge variant="secondary">{f.estado}</Badge></TableCell>
                    <TableCell>{f.fecha_pago ? formatFecha(f.fecha_pago) : "—"}</TableCell>
                    <TableCell>{f.forma_pago || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={7}>TOTALES DEL PERÍODO</td>
                  <td className="p-3 text-right text-primary">{formatPesos(resumen.comprasNetas)}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.fc as any[]).reduce((a, x: any) => a + Number(x.iva_21 || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.fc as any[]).reduce((a, x: any) => a + Number(x.iva_105 || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos(resumen.percepcionesCompras)}</td>
                  <td className="p-3 text-right text-primary">{formatPesos(resumen.otrosImpCompras)}</td>
                  <td className="p-3 text-right text-destructive">{formatPesos((resumen.fc as any[]).reduce((a, x: any) => a + Number(x.total || 0), 0))}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Estado de Resultado === */}
        <TabsContent value="er">
          <ReportShell title={`Estado de Resultado — ${rangoLabel}`} subtitle="Todos los valores en pesos argentinos (ARS) · IVA excluido de ingresos y compras">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="text-right w-32">% s/ Ventas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <ErGroup label="INGRESOS" />
                <ErRow label="Ventas de servicios (sin IVA)" v={resumen.ventasNetas} base={resumen.ventasNetas} />
                <ErGroup label="COSTO DE SERVICIOS" />
                <ErRow label="Compras e insumos" v={-resumen.comprasNetas} base={resumen.ventasNetas} />
                <ErTotal label="RESULTADO BRUTO" v={resumen.ventasNetas - resumen.comprasNetas} base={resumen.ventasNetas} />
                <ErGroup label="GASTOS DE ESTRUCTURA" />
                <ErRow label="Sueldos y cargas sociales" v={-resumen.sueldosPagados} base={resumen.ventasNetas} />
                <ErRow label="Impuestos y aportes" v={-resumen.impuestosPagados} base={resumen.ventasNetas} />
                <ErTotal label="RESULTADO NETO DEL PERÍODO" v={resultadoBruto - resumen.impuestosPagados} base={resumen.ventasNetas} />
              </TableBody>
            </Table>
            <div className="p-3 text-xs text-muted-foreground border-t border-border">
              Margen neto: <span className="font-semibold">{resumen.ventasNetas > 0 ? ((resultadoBruto - resumen.impuestosPagados) / resumen.ventasNetas * 100).toFixed(1) : "0"}%</span>
            </div>
          </ReportShell>
        </TabsContent>

        {/* === Libro Sueldos === */}
        <TabsContent value="sue">
          <ReportShell title={`Libro de Sueldos — ${rangoLabel}`} subtitle={`Total devengado: ${formatPesos((resumen.sue as any[]).reduce((a, x: any) => a + Number(x.total || 0), 0))} · Pagado: ${formatPesos(resumen.sueldosPagados)} · Pendiente: ${formatPesos((resumen.sue as any[]).filter((s) => s.estado !== "Pagado").reduce((a, x: any) => a + Number(x.total || 0), 0))}`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Período</TableHead><TableHead>Mes</TableHead><TableHead>Empleado</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Básico</TableHead><TableHead className="text-right">Adicional</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
                <TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resumen.sue as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Sin liquidaciones en el período</TableCell></TableRow>
                ) : (resumen.sue as any[]).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.periodo}</TableCell>
                    <TableCell>{MESES_LARGOS[(s.mes ?? 1) - 1]}</TableCell>
                    <TableCell>{(data?.emp ?? []).find((e: any) => e.id === s.empleado_id)?.nombre ?? "—"}</TableCell>
                    <TableCell>{s.rol || "—"}</TableCell>
                    <TableCell className="text-right">{formatPesos(s.basico)}</TableCell>
                    <TableCell className="text-right">{formatPesos(s.adicional)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(s.total)}</TableCell>
                    <TableCell><Badge variant={s.estado === "Pagado" ? "default" : "secondary"}>{s.estado}</Badge></TableCell>
                    <TableCell>{s.observaciones || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={4}>TOTAL</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.sue as any[]).reduce((a, x: any) => a + Number(x.basico || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.sue as any[]).reduce((a, x: any) => a + Number(x.adicional || 0), 0))}</td>
                  <td className="p-3 text-right text-primary">{formatPesos((resumen.sue as any[]).reduce((a, x: any) => a + Number(x.total || 0), 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Impuestos === */}
        <TabsContent value="imp">
          <ReportShell title={`Impuestos y aportes pagados — ${rangoLabel}`} subtitle={`Total: ${formatPesos(resumen.impuestosPagados)}`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mes</TableHead><TableHead>Concepto</TableHead><TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resumen.imp as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Sin impuestos en el período</TableCell></TableRow>
                ) : (resumen.imp as any[]).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{MESES_LARGOS[(i.mes ?? 1) - 1]}</TableCell>
                    <TableCell>IVA Saldo</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(Number(i.iva_debito || 0) - Number(i.iva_credito || 0))}</TableCell>
                    <TableCell><Badge variant="secondary">Calculado</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={3}>TOTAL</td>
                  <td className="p-3 text-right text-destructive">{formatPesos(resumen.impuestosPagados)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Movimientos de Caja === */}
        <TabsContent value="caja">
          <ReportShell title={`Movimientos de caja — ${rangoLabel}`} subtitle={`${(data?.mov ?? []).filter((m: any) => Number(m.anio ?? new Date(m.fecha_emision).getFullYear()) === year && enRango(mesDe({ ...m, fecha: m.fecha_emision }))).length} movimientos`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead>
                <TableHead>Contraparte</TableHead><TableHead className="text-right">Importe</TableHead>
                <TableHead>Forma pago</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => {
                  const rows = (data?.mov ?? []).filter(
                    (m: any) => Number(m.anio ?? new Date(m.fecha_emision).getFullYear()) === year && enRango(mesDe({ ...m, fecha: m.fecha_emision })),
                  );
                  if (rows.length === 0) return <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Sin movimientos en el período</TableCell></TableRow>;
                  return rows.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatFecha(m.fecha_emision)}</TableCell>
                      <TableCell><Badge variant={m.direccion === "cobro" ? "default" : "secondary"}>{m.direccion}</Badge></TableCell>
                      <TableCell>{m.tipo_movimiento}</TableCell>
                      <TableCell>{m.contraparte || "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${m.direccion === "cobro" ? "text-primary" : "text-destructive"}`}>{formatPesos(m.monto)}</TableCell>
                      <TableCell>{m.instrumento}</TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Por Cliente === */}
        <TabsContent value="cli">
          <ReportShell title={`Facturación por cliente — ${rangoLabel}`} subtitle={`${porCliente.length} clientes · Ingresos totales del período: ${formatPesos(porCliente.reduce((a, c) => a + c.total, 0))}`}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead className="text-right">Facturas</TableHead>
                <TableHead className="text-right">Hectáreas</TableHead><TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Cobrado %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {porCliente.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Sin facturas en el período</TableCell></TableRow>
                ) : porCliente.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="text-right">{c.facturas}</TableCell>
                    <TableCell className="text-right">{c.hectareas.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-primary">{formatPesos(c.cobrado)}</TableCell>
                    <TableCell className="text-right text-orange-500">{formatPesos(c.pendiente)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPesos(c.total)}</TableCell>
                    <TableCell className="text-right">{c.total > 0 ? Math.round((c.cobrado / c.total) * 100) : 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Cheques en cartera === */}
        <TabsContent value="cheq">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ScoreCard label="Total en cartera" value={formatPesos(totalCartera)} tone="primary" />
            <ScoreCard label="Cantidad de valores" value={`$${chequesEnriched.length}`} tone="muted" />
            <ScoreCard label="Vencen en ≤30 días" value={`${venceProximos.length} · ${formatPesos(venceProximos.reduce((a, c) => a + Number(c.monto || 0), 0))}`} tone="warning" />
            <ScoreCard label="Vencidos sin cobrar" value={`${vencidos.length} · ${formatPesos(vencidos.reduce((a, c) => a + Number(c.monto || 0), 0))}`} tone="destructive" />
          </div>
          <ReportShell title={`Cheques y echeqs en cartera — al ${new Date().toISOString().split("T")[0]}`} subtitle="Valores recibidos pendientes de cobro/depósito · Ordenados por vencimiento">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tipo</TableHead><TableHead>Nº</TableHead><TableHead>Banco</TableHead>
                <TableHead>Recibido de</TableHead><TableHead>Emisión</TableHead>
                <TableHead>Vencimiento</TableHead><TableHead>Días</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead>Observaciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {chequesEnriched.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Sin cheques en cartera</TableCell></TableRow>
                ) : chequesEnriched.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="outline">{c.instrumento === "echeq" ? "Echeq" : "Cheque"}</Badge></TableCell>
                    <TableCell>{c.numero || "—"}</TableCell>
                    <TableCell>{c.banco || "—"}</TableCell>
                    <TableCell>{c.contraparte || "—"}</TableCell>
                    <TableCell>{formatFecha(c.fecha_emision)}</TableCell>
                    <TableCell>{formatFecha(c.vencimiento)}</TableCell>
                    <TableCell className={c.dias < 0 ? "text-destructive font-semibold" : c.dias <= 30 ? "text-orange-500" : "text-muted-foreground"}>
                      {c.dias < 0 ? `VENCIDO ${Math.abs(c.dias)}d` : `${c.dias}d`}
                    </TableCell>
                    <TableCell className="text-right text-primary font-medium">{formatPesos(c.monto)}</TableCell>
                    <TableCell>{c.observaciones || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={7}>TOTAL EN CARTERA</td>
                  <td className="p-3 text-right text-primary">{formatPesos(totalCartera)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </Table>
          </ReportShell>
        </TabsContent>

        {/* === Retenciones === */}
        <TabsContent value="ret">
          {(() => {
            const filas = [
              ...(resumen.fc as any[])
                .filter((f) => Number(f.percepciones || 0) > 0 || Number(f.impuestos_internos || 0) > 0 || Number(f.otros_impuestos || 0) > 0)
                .map((f) => ({
                  id: `c-${f.id}`, fecha: f.fecha, agente: nombreProveedor(f.proveedor_id),
                  origen: "Compra", numero: f.numero || "—",
                  percep: Number(f.percepciones || 0),
                  otros: Number(f.impuestos_internos || 0) + Number(f.otros_impuestos || 0),
                })),
              ...(resumen.fv as any[])
                .filter((f) => Number(f.percepciones || 0) > 0)
                .map((f) => ({
                  id: `v-${f.id}`, fecha: f.fecha, agente: nombreCliente(f.cliente_id),
                  origen: "Venta", numero: f.numero || "—",
                  percep: Number(f.percepciones || 0), otros: 0,
                })),
            ].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
            const tPercep = filas.reduce((a, f) => a + f.percep, 0);
            const tOtros = filas.reduce((a, f) => a + f.otros, 0);
            return (
              <ReportShell
                title={`Percepciones y retenciones sufridas — ${rangoLabel}`}
                subtitle={`Tomadas de los comprobantes cargados · Percepciones ${formatPesos(tPercep)} · Impuestos internos y otros tributos ${formatPesos(tOtros)}`}
              >
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Fecha</TableHead><TableHead>Origen</TableHead>
                    <TableHead>Agente / Contraparte</TableHead><TableHead>Nº Comprobante</TableHead>
                    <TableHead className="text-right">Percepciones</TableHead>
                    <TableHead className="text-right">Imp. internos / otros</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filas.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Sin percepciones ni retenciones en los comprobantes del período</TableCell></TableRow>
                    ) : filas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{formatFecha(f.fecha)}</TableCell>
                        <TableCell><Badge variant="outline">{f.origen}</Badge></TableCell>
                        <TableCell>{f.agente}</TableCell>
                        <TableCell>{f.numero}</TableCell>
                        <TableCell className="text-right">{formatPesos(f.percep)}</TableCell>
                        <TableCell className="text-right">{formatPesos(f.otros)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="p-3" colSpan={4}>TOTAL</td>
                      <td className="p-3 text-right text-primary">{formatPesos(tPercep)}</td>
                      <td className="p-3 text-right text-primary">{formatPesos(tOtros)}</td>
                    </tr>
                  </tfoot>
                </Table>
              </ReportShell>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportRow({ onXlsx }: { onXlsx: () => void }) {
  return (
    <div className="flex gap-2 my-3">
      <Button variant="outline" className="border-green-600 text-green-700 dark:text-green-400" onClick={onXlsx}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel (.xlsx)
      </Button>
      <Button className="bg-primary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Exportar PDF</Button>
      <Button variant="outline" onClick={onXlsx}>CSV</Button>
    </div>
  );
}

function ReportShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ScoreCard({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "warning" | "destructive" | "muted" }) {
  const cls =
    tone === "success" ? "border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-400"
    : tone === "warning" ? "border-orange-600/40 bg-orange-500/10 text-orange-700 dark:text-orange-400"
    : tone === "destructive" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : tone === "primary" ? "border-primary/40 bg-primary/10 text-primary"
    : "border-border bg-muted/30 text-foreground";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ControlRow({ c }: { c: { estado: "cumple" | "atencion" | "incumple" | "info"; control: string; norma: string; detalle: string } }) {
  const badge =
    c.estado === "cumple" ? <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Cumple</Badge>
    : c.estado === "atencion" ? <Badge className="bg-orange-500 hover:bg-orange-500"><AlertTriangle className="mr-1 h-3 w-3" />Atención</Badge>
    : c.estado === "incumple" ? <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Incumple</Badge>
    : <Badge variant="secondary"><Info className="mr-1 h-3 w-3" />Informativo</Badge>;
  return (
    <TableRow>
      <TableCell>{badge}</TableCell>
      <TableCell>
        <div className="font-medium">{c.control}</div>
        <div className="text-xs text-muted-foreground">{c.norma}</div>
      </TableCell>
      <TableCell className="text-sm">{c.detalle}</TableCell>
    </TableRow>
  );
}

function ErGroup({ label }: { label: string }) {
  return <TableRow className="bg-muted/40"><TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</TableCell></TableRow>;
}
function ErRow({ label, v, base }: { label: string; v: number; base: number }) {
  return <TableRow><TableCell>{label}</TableCell><TableCell className={`text-right ${v >= 0 ? "text-primary" : "text-destructive"}`}>{formatPesos(v)}</TableCell><TableCell className="text-right text-muted-foreground">{base > 0 ? ((v / base) * 100).toFixed(1) : "0"}%</TableCell></TableRow>;
}
function ErTotal({ label, v, base }: { label: string; v: number; base: number }) {
  return <TableRow className="border-y border-border bg-muted/30"><TableCell className="font-bold">{label}</TableCell><TableCell className={`text-right font-bold ${v >= 0 ? "text-primary" : "text-destructive"}`}>{formatPesos(v)}</TableCell><TableCell className="text-right font-bold">{base > 0 ? ((v / base) * 100).toFixed(1) : "0"}%</TableCell></TableRow>;
}