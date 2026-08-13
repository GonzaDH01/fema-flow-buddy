import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES } from "@/lib/format";
import { esComprobanteInformativo } from "@/lib/finanzas";

export const Route = createFileRoute("/app/cashflow")({ component: Page });

type Row = {
  label: string;
  sub?: string;
  badge?: string;
  cat?: string;
  values: number[];
  sign: "+" | "-";
  tooltips?: (string | undefined)[];
};

const empty12 = () => Array(12).fill(0) as number[];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function placeAt(mes: number, total: number) {
  const v = empty12();
  if (mes >= 1 && mes <= 12) v[mes - 1] = total;
  return v;
}

async function loadCashflow(userId: string, anio: number) {
  const [ventas, compras, sueldos, impuestos, combustible, movs, imputaciones, estimaciones, gFijos, gFijosMov, cuotasCred, cajaMov] = await Promise.all([
    supabase.from("fema_facturas_venta")
      .select("id,mes,total,estado,numero,condicion_pago,cliente:fema_clientes(nombre)")
      .eq("anio", anio),
    supabase.from("fema_facturas_compra")
      .select("id,mes,total,estado,numero,categoria,tipo_comprobante,proveedor:fema_proveedores(nombre)")
      .eq("anio", anio),
    supabase.from("fema_sueldos")
      .select("periodo,sueldo_bruto,cargas_sociales,empleado:fema_empleados(nombre)")
      .like("periodo", `${anio}-%`),
    supabase.from("fema_impuestos")
      .select("mes,periodo,iva_debito,iva_credito,ingresos_brutos,ganancias_estimadas")
      .eq("anio", anio),
    supabase.from("fema_combustible")
      .select("fecha,total")
      .gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`),
    supabase.from("fema_movimientos_pago")
      .select("id,instrumento,direccion,estado,monto,vencimiento,fecha_emision,mes,anio,factura_venta_id,factura_compra_id,contraparte,numero,banco")
      ,
    supabase.from("fema_imputaciones")
      .select("monto,fecha,factura_venta_id,factura_compra_id,movimiento_pago_id"),
    supabase.from("fema_estimaciones")
      .select("fecha_estimada,monto,descripcion,estado,cliente:fema_clientes(nombre)")
      .gte("fecha_estimada", `${anio}-01-01`).lte("fecha_estimada", `${anio}-12-31`),
    supabase.from("fema_gastos_fijos" as any)
      .select("id,concepto,categoria,monto_mensual,mes_inicio,mes_fin,activo,proveedor:fema_proveedores(nombre)"),
    supabase.from("fema_gastos_fijos_mov" as any)
      .select("gasto_fijo_id,anio,mes,monto,pagado").eq("anio", anio),
    supabase.from("fema_creditos_cuotas" as any)
      .select("numero_cuota,fecha_vencimiento,monto,estado,credito:fema_creditos(acreedor,descripcion,cantidad_cuotas)")
      .gte("fecha_vencimiento", `${anio}-01-01`).lte("fecha_vencimiento", `${anio}-12-31`),
    supabase.from("fema_caja_mov" as any)
      .select("fecha,cuenta_id,tipo,monto,concepto,saldo_resultante,cuenta:fema_cuentas_bancarias(banco,alias)")
      .gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`),
  ]);

  const ACTIVOS = new Set(["en_cartera", "cobrado", "pagado", "cedido"]);
  const movsByFV = new Map<string, any[]>();
  const movsByFC = new Map<string, any[]>();
  const movsSueltos: any[] = [];
  const movsById = new Map<string, any>();
  // Movimientos que se reparten vía imputaciones: se toman desde ahí y no
  // por el vínculo directo, para no duplicar importes.
  const conImputacion = new Set<string>();
  for (const i of (imputaciones.data ?? []) as any[]) {
    if (i.movimiento_pago_id) conImputacion.add(i.movimiento_pago_id);
  }
  for (const m of (movs.data ?? []) as any[]) {
    movsById.set((m as any).id, m);
    if (!ACTIVOS.has(m.estado)) continue;
    if (m.direccion === "cobro" && m.factura_venta_id && !conImputacion.has((m as any).id)) {
      if (!movsByFV.has(m.factura_venta_id)) movsByFV.set(m.factura_venta_id, []);
      movsByFV.get(m.factura_venta_id)!.push(m);
    }
    if (m.direccion === "pago" && m.factura_compra_id && !conImputacion.has((m as any).id)) {
      if (!movsByFC.has(m.factura_compra_id)) movsByFC.set(m.factura_compra_id, []);
      movsByFC.get(m.factura_compra_id)!.push(m);
    }
    if (
      (m.direccion === "cobro" && !m.factura_venta_id) ||
      (m.direccion === "pago" && !m.factura_compra_id)
    ) {
      if (!conImputacion.has((m as any).id)) movsSueltos.push(m);
    }
  }

  // Pagos/cobros distribuidos entre varias facturas (conciliación automática).
  for (const i of (imputaciones.data ?? []) as any[]) {
    const base = i.movimiento_pago_id ? movsById.get(i.movimiento_pago_id) : null;
    if (base && !ACTIVOS.has(base.estado)) continue;
    const item = {
      instrumento: base?.instrumento ?? "imputacion",
      direccion: base?.direccion,
      estado: base?.estado ?? "pagado",
      monto: Number(i.monto),
      vencimiento: base?.vencimiento ?? i.fecha,
      fecha_emision: i.fecha ?? base?.fecha_emision,
      mes: base?.mes,
      numero: base?.numero ?? null,
      banco: base?.banco ?? null,
    };
    if (i.factura_compra_id) {
      if (!movsByFC.has(i.factura_compra_id)) movsByFC.set(i.factura_compra_id, []);
      movsByFC.get(i.factura_compra_id)!.push(item);
    }
    if (i.factura_venta_id) {
      if (!movsByFV.has(i.factura_venta_id)) movsByFV.set(i.factura_venta_id, []);
      movsByFV.get(i.factura_venta_id)!.push(item);
    }
  }

  function mesDe(m: any): number {
    const fecha = m.vencimiento ?? m.fecha_emision;
    if (fecha) {
      const [y, mo] = String(fecha).split("-").map(Number);
      if (y === anio && mo >= 1 && mo <= 12) return mo;
      if (y !== anio) return 0; // fuera del año en vista
    }
    return Number(m.mes) || 0;
  }
  function instrLabel(ins: string) {
    return ins === "echeq" ? "Echeq propio" : ins === "cheque_fisico" ? "Cheque físico" : ins === "cesion" ? "Echeq cedido" : ins === "transferencia" ? "Transferencia" : ins === "imputacion" ? "Imputación" : ins;
  }
  function distribuirMovs(linked: any[], total: number, facturaMes: number) {
    const values = empty12();
    const tooltips: string[][] = Array.from({ length: 12 }, () => []);
    let cubierto = 0;
    const detalle: string[] = [];
    for (const m of linked) {
      const mes = mesDe(m);
      const monto = Number(m.monto);
      cubierto += monto;
      const extra = [m.numero ? `Nº ${m.numero}` : null, m.banco].filter(Boolean).join(" · ");
      const tipMes = `${instrLabel(m.instrumento)}${extra ? ` (${extra})` : ""}: ${formatPesos(monto)}`;
      if (mes >= 1 && mes <= 12) {
        values[mes - 1] += monto;
        tooltips[mes - 1].push(tipMes);
        detalle.push(`${instrLabel(m.instrumento)} ${MESES[mes - 1]} ${formatPesos(monto)}`);
      } else {
        detalle.push(`${instrLabel(m.instrumento)} fuera de ${anio} ${formatPesos(monto)}`);
      }
    }
    const resto = Math.max(0, total - cubierto);
    if (resto > 0.01 && facturaMes >= 1 && facturaMes <= 12) {
      values[facturaMes - 1] += resto;
      tooltips[facturaMes - 1].push(`Saldo pendiente: ${formatPesos(resto)}`);
      detalle.push(`saldo ${MESES[facturaMes - 1]} ${formatPesos(resto)}`);
    }
    return {
      values,
      cubierto,
      detalle,
      tooltips: tooltips.map((arr) => (arr.length ? arr.join("\n") : undefined)),
    };
  }

  function planBadge(linked: any[], condicionPago: string | null, total: number) {
    if (linked.length === 0) {
      const c = (condicionPago ?? "").toLowerCase();
      if (c.includes("contado")) return "Contado";
      if (c) return condicionPago!;
      return null;
    }
    const cubierto = linked.reduce((a, m) => a + Number(m.monto), 0);
    const completo = cubierto >= total - 0.01;
    if (linked.length === 1) {
      return `${completo ? "Pago único" : "Pago parcial"} · ${instrLabel(linked[0].instrumento)}`;
    }
    const tipos = Array.from(new Set(linked.map((m) => instrLabel(m.instrumento))));
    return `Plan ${linked.length} cuotas · ${tipos.join(" + ")}`;
  }

  const ingCobrados: Row[] = [];
  const ingPendientes: Row[] = [];
  const ingEstimados: Row[] = [];
  // Agrupar estimaciones por cliente (+ descripción) en una sola línea con cuotas por mes
  const estimGroups = new Map<string, { label: string; sub?: string; values: number[]; tooltips: string[][] }>();
  for (const e of (estimaciones.data ?? []) as any[]) {
    if (e.estado === "cobrado") continue;
    const mes = Number((e.fecha_estimada ?? "").slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const label = e.cliente?.nombre ?? "Estimación";
    const desc = (e.descripcion ?? "").replace(/\s*-\s*Cuota\s*\d+\/\d+\s*$/i, "").trim();
    const key = `${label}||${desc}`;
    let g = estimGroups.get(key);
    if (!g) {
      g = { label, sub: desc || undefined, values: empty12(), tooltips: Array.from({ length: 12 }, () => []) };
      estimGroups.set(key, g);
    }
    const monto = Number(e.monto);
    g.values[mes - 1] += monto;
    g.tooltips[mes - 1].push(`${e.descripcion ?? "Cuota"}: ${formatPesos(monto)}`);
  }
  for (const g of estimGroups.values()) {
    ingEstimados.push({
      label: g.label,
      sub: g.sub,
      badge: "Estimado",
      cat: "Estimaciones",
      values: g.values,
      tooltips: g.tooltips.map((t) => (t.length ? t.join("\n") : undefined)),
      sign: "+",
    });
  }
  for (const v of (ventas.data ?? []) as any[]) {
    const linked = movsByFV.get(v.id) ?? [];
    const total = Number(v.total);
    const facturaMes = Number(v.mes);
    let values: number[];
    let sub: string;
    let tooltips: (string | undefined)[] | undefined;
    let cobrada: boolean;
    if (linked.length > 0) {
      const d = distribuirMovs(linked, total, facturaMes);
      values = d.values;
      tooltips = d.tooltips;
      // El plan de cuotas registrado en la factura no implica cobro:
      // sólo se considera cobrada cuando Medios de Pago confirma el cobro.
      cobrada = v.estado === "cobrada";
      sub = `Factura ${v.numero ?? "—"}`;
    } else {
      values = placeAt(facturaMes, total);
      cobrada = v.estado === "cobrada";
      sub = `Factura ${v.numero ?? "—"}`;
    }
    const r: Row = {
      label: v.cliente?.nombre ?? "Sin cliente",
      sub,
      badge: planBadge(linked, v.condicion_pago, total) ?? undefined,
      cat: "Facturas de venta",
      values,
      tooltips,
      sign: "+",
    };
    (cobrada ? ingCobrados : ingPendientes).push(r);
  }

  const egPagados: Row[] = [];
  const egPendientes: Row[] = [];
  for (const c of (compras.data ?? []) as any[]) {
    // Franco paga con tarjeta personal: no impacta en caja de la empresa.
    if (c.categoria === "Franco_Particular") continue;
    // Notas de crédito/débito: informativas, no mueven caja.
    if (esComprobanteInformativo(c.tipo_comprobante)) continue;
    const linked = movsByFC.get(c.id) ?? [];
    const total = Number(c.total);
    const facturaMes = Number(c.mes);
    let values: number[];
    let sub: string;
    let tooltips: (string | undefined)[] | undefined;
    let pagada: boolean;
    if (linked.length > 0) {
      const d = distribuirMovs(linked, total, facturaMes);
      values = d.values;
      tooltips = d.tooltips;
      // Igual criterio para compras: sólo el módulo de Pagos marca pagada.
      pagada = c.estado === "pagada";
      sub = `Comprobante ${c.numero ?? "—"}`;
    } else {
      values = placeAt(facturaMes, total);
      pagada = c.estado === "pagada";
      sub = c.numero ? `Comprobante ${c.numero}` : undefined as any;
    }
    const r: Row = {
      label: `${c.proveedor?.nombre ?? "Sin proveedor"}${c.categoria ? " · " + c.categoria : ""}`,
      sub,
      badge: planBadge(linked, null, total) ?? undefined,
      cat: c.categoria ? String(c.categoria).replace(/_/g, " ") : "Sin categoría",
      values,
      tooltips,
      sign: "-",
    };
    (pagada ? egPagados : egPendientes).push(r);
  }

  for (const s of (sueldos.data ?? []) as any[]) {
    const mes = Number((s.periodo ?? "").split("-")[1] ?? 0);
    const total = Number(s.sueldo_bruto ?? 0) + Number(s.cargas_sociales ?? 0);
    egPagados.push({
      label: `${s.empleado?.nombre ?? "Empleado"} · Sueldo`,
      cat: "Sueldos",
      values: placeAt(mes, total),
      sign: "-",
    });
  }

  for (const i of (impuestos.data ?? []) as any[]) {
    const ivaSaldo = Math.max(0, Number(i.iva_debito ?? 0) - Number(i.iva_credito ?? 0));
    const total = ivaSaldo + Number(i.ingresos_brutos ?? 0) + Number(i.ganancias_estimadas ?? 0);
    if (total === 0) continue;
    egPendientes.push({
      label: `AFIP · ${i.periodo ?? ""}`,
      sub: "Impuestos",
      badge: "Impuesto",
      cat: "Impuestos",
      values: placeAt(Number(i.mes), total),
      sign: "-",
    });
  }

  // Gastos fijos proyectados / pagados
  const movsMap = new Map<string, { monto: number; pagado: boolean }>();
  for (const m of (gFijosMov.data ?? []) as any[]) {
    movsMap.set(`${m.gasto_fijo_id}|${m.mes}`, { monto: Number(m.monto), pagado: !!m.pagado });
  }
  for (const g of (gFijos.data ?? []) as any[]) {
    if (!g.activo) continue;
    const mIni = new Date(g.mes_inicio);
    const mFin = g.mes_fin ? new Date(g.mes_fin) : null;
    const valsPag = empty12();
    const valsProy = empty12();
    const tipsPag: (string | undefined)[] = empty12().map(() => undefined);
    const tipsProy: (string | undefined)[] = empty12().map(() => undefined);
    let hasPag = false, hasProy = false;
    for (let mes = 1; mes <= 12; mes++) {
      const d = new Date(anio, mes - 1, 1);
      if (d < new Date(mIni.getFullYear(), mIni.getMonth(), 1)) continue;
      if (mFin && d > new Date(mFin.getFullYear(), mFin.getMonth(), 1)) continue;
      const ov = movsMap.get(`${g.id}|${mes}`);
      const monto = ov ? ov.monto : Number(g.monto_mensual);
      const pagado = ov?.pagado ?? false;
      if (monto <= 0) continue;
      if (pagado) {
        valsPag[mes - 1] = monto;
        tipsPag[mes - 1] = `${g.concepto} · pagado: ${formatPesos(monto)}`;
        hasPag = true;
      } else {
        valsProy[mes - 1] = monto;
        tipsProy[mes - 1] = `${g.concepto} · estimado: ${formatPesos(monto)}`;
        hasProy = true;
      }
    }
    const label = `${g.concepto}${g.proveedor?.nombre ? " · " + g.proveedor.nombre : ""}`;
    if (hasPag) egPagados.push({ label, sub: `${g.categoria} (gasto fijo)`, badge: "Fijo", cat: "Gastos fijos", values: valsPag, tooltips: tipsPag, sign: "-" });
    if (hasProy) egPendientes.push({ label, sub: `${g.categoria} (gasto fijo)`, badge: "Fijo proyectado", cat: "Gastos fijos", values: valsProy, tooltips: tipsProy, sign: "-" });
  }

  // Cuotas de créditos
  const credGroups = new Map<string, { label: string; sub?: string; values: number[]; tooltips: (string | undefined)[]; pagado: boolean[] }>();
  for (const q of (cuotasCred.data ?? []) as any[]) {
    const mes = Number((q.fecha_vencimiento ?? "").slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const acreedor = q.credito?.acreedor ?? "Crédito";
    const desc = q.credito?.descripcion ?? "";
    const key = `${acreedor}||${desc}`;
    let g = credGroups.get(key);
    if (!g) {
      g = {
        label: acreedor,
        sub: desc ? `${desc} (crédito)` : "Crédito",
        values: empty12(),
        tooltips: empty12().map(() => undefined),
        pagado: Array(12).fill(false),
      };
      credGroups.set(key, g);
    }
    const monto = Number(q.monto);
    g.values[mes - 1] += monto;
    const tip = `Cuota ${q.numero_cuota}/${q.credito?.cantidad_cuotas ?? "?"}: ${formatPesos(monto)} (${q.estado})`;
    g.tooltips[mes - 1] = g.tooltips[mes - 1] ? `${g.tooltips[mes - 1]}\n${tip}` : tip;
    if (q.estado === "pagada") g.pagado[mes - 1] = true;
  }
  for (const g of credGroups.values()) {
    // Si todas las cuotas del año están pagadas, va a pagados; si no, pendientes
    const allPag = g.values.every((v, i) => v === 0 || g.pagado[i]);
    const row: Row = { label: g.label, sub: g.sub, badge: "Cuota crédito", cat: "Créditos / financiación", values: g.values, tooltips: g.tooltips, sign: "-" };
    if (allPag) egPagados.push(row); else egPendientes.push(row);
  }

  // Agrupar combustible por mes
  const combPorMes = empty12();
  for (const k of (combustible.data ?? []) as any[]) {
    const mes = Number((k.fecha ?? "").slice(5, 7));
    if (mes >= 1 && mes <= 12) combPorMes[mes - 1] += Number(k.total);
  }
  if (sum(combPorMes) > 0) {
    egPagados.push({ label: "Combustible", cat: "Combustible", values: combPorMes, sign: "-" });
  }

  // Movimientos de cobro/pago sin factura asociada (echeqs de cartera, transferencias sueltas)
  type Grp = { label: string; sub: string; values: number[]; tooltips: string[][] };
  const agrupar = (lista: any[]) => {
    const map = new Map<string, Grp>();
    for (const m of lista) {
      const mes = mesDe(m);
      if (mes < 1 || mes > 12) continue;
      const label = m.contraparte || instrLabel(m.instrumento);
      const key = `${label}||${m.instrumento}`;
      let g = map.get(key);
      if (!g) {
        g = { label, sub: instrLabel(m.instrumento), values: empty12(), tooltips: Array.from({ length: 12 }, () => []) };
        map.set(key, g);
      }
      const monto = Number(m.monto);
      g.values[mes - 1] += monto;
      const extra = [m.numero ? `Nº ${m.numero}` : null, m.banco].filter(Boolean).join(" · ");
      g.tooltips[mes - 1].push(`${extra ? extra + ": " : ""}${formatPesos(monto)} (${m.estado})`);
    }
    return Array.from(map.values());
  };
  const toRow = (g: Grp, badge: string, sign: "+" | "-"): Row => ({
    label: g.label,
    sub: `${g.sub} (sin factura)`,
    badge,
    cat: `${g.sub} (sin factura)`,
    values: g.values,
    tooltips: g.tooltips.map((t) => (t.length ? t.join("\n") : undefined)),
    sign,
  });
  for (const g of agrupar(movsSueltos.filter((m) => m.direccion === "cobro" && (m.estado === "cobrado" || m.estado === "cedido")))) {
    ingCobrados.push(toRow(g, "Cobrado", "+"));
  }
  for (const g of agrupar(movsSueltos.filter((m) => m.direccion === "cobro" && m.estado === "en_cartera"))) {
    ingPendientes.push(toRow(g, "En cartera", "+"));
  }
  for (const g of agrupar(movsSueltos.filter((m) => m.direccion === "pago" && m.estado === "pagado"))) {
    egPagados.push(toRow(g, "Pagado", "-"));
  }
  // Los echeqs propios emitidos ya están imputados a las facturas de compra
  // (vínculo directo o imputaciones), así que se reflejan en la fila de cada
  // factura. Solo se agregan aquí los que no tienen ninguna factura asociada.
  const echeqsSinFactura = movsSueltos.filter(
    (m) => m.direccion === "pago" && m.estado === "en_cartera" && !m.factura_compra_id,
  );
  for (const g of agrupar(echeqsSinFactura)) {
    egPendientes.push(toRow(g, "A debitar (sin factura)", "-"));
  }

  // Ajustes de caja puros (los que crea el botón "Ajuste de caja" en Medios de Pago).
  // Se excluyen movimientos vinculados a pagos o pases de fondos para no duplicar.
  const ajustesPos = empty12();
  const ajustesNeg = empty12();
  const tipsPos: string[][] = Array.from({ length: 12 }, () => []);
  const tipsNeg: string[][] = Array.from({ length: 12 }, () => []);
  for (const cm of (cajaMov.data ?? []) as any[]) {
    const concepto = String(cm.concepto ?? "");
    if (!concepto.startsWith("Ajuste de caja")) continue;
    if (cm.movimiento_pago_id || cm.mov_fondo_id) continue;
    const mes = Number((cm.fecha ?? "").slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const monto = Number(cm.monto || 0);
    if (monto === 0) continue;
    const cuenta = cm.cuenta ? `${cm.cuenta.banco}${cm.cuenta.alias ? ` · ${cm.cuenta.alias}` : ""}` : "Cuenta";
    const motivo = concepto.replace(/^Ajuste de caja\s*[-—]?\s*/, "").trim() || "Sin motivo";
    const tip = `${cuenta}: ${motivo} · ${formatPesos(monto)}`;
    if (cm.tipo === "ingreso") {
      ajustesPos[mes - 1] += monto;
      tipsPos[mes - 1].push(tip);
    } else {
      ajustesNeg[mes - 1] += monto;
      tipsNeg[mes - 1].push(tip);
    }
  }
  const ajustesRows: Row[] = [];
  if (sum(ajustesPos) > 0) {
    ajustesRows.push({
      label: "Ajustes de caja (+)",
      sub: "Correcciones que suman saldo",
      badge: "Ajuste +",
      cat: "Ajustes",
      values: ajustesPos,
      tooltips: tipsPos.map((t) => (t.length ? t.join("\n") : undefined)),
      sign: "+",
    });
  }
  if (sum(ajustesNeg) > 0) {
    ajustesRows.push({
      label: "Ajustes de caja (−)",
      sub: "Correcciones que restan saldo",
      badge: "Ajuste −",
      cat: "Ajustes",
      values: ajustesNeg,
      tooltips: tipsNeg.map((t) => (t.length ? t.join("\n") : undefined)),
      sign: "-",
    });
  }
  const ajustesNeto = empty12().map((_, i) => ajustesPos[i] - ajustesNeg[i]);

  const totalIng = empty12().map((_, i) => sum([...ingCobrados, ...ingPendientes, ...ingEstimados].map((r) => r.values[i])));
  const totalEg = empty12().map((_, i) => sum([...egPagados, ...egPendientes].map((r) => r.values[i])));
  const neto = totalIng.map((v, i) => v - totalEg[i] + ajustesNeto[i]);
  const acumulado: number[] = [];
  neto.reduce((acc, v) => { const next = acc + v; acumulado.push(next); return next; }, 0);

  return { ingCobrados, ingPendientes, ingEstimados, egPagados, egPendientes, ajustesRows, totalIng, totalEg, neto, acumulado };
}

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["cashflow-matrix", user?.id, year],
    enabled: !!user,
    queryFn: () => loadCashflow(user!.id, year),
  });

  return (
    <div className="p-4 md:p-6">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">Cash Flow General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen mensual generado automáticamente desde todos los módulos · {year}
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <table className="w-full min-w-[1200px] border-collapse text-xs [&_td]:border-r [&_td]:border-border/40 [&_th]:border-r [&_th]:border-border/60 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_tbody_tr:not(.no-stripe)_td:nth-child(2n+3)]:bg-muted/10">
          <colgroup>
            <col style={{ width: "220px" }} />
            {MESES.map((m) => <col key={m} style={{ width: "78px" }} />)}
            <col style={{ width: "100px" }} />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="border-b-2 border-border bg-muted/70 text-[10px] uppercase tracking-wide text-foreground">
              <th className="sticky left-0 z-30 bg-muted/70 px-3 py-2 text-left">Concepto</th>
              {MESES.map((m, i) => (
                <th
                  key={m}
                  className={`px-2 py-2 text-right font-semibold ${i % 2 === 1 ? "bg-muted/40" : ""}`}
                >
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || !data ? (
              <tr><td colSpan={14} className="py-10 text-center text-muted-foreground">Cargando…</td></tr>
            ) : (
              <>
                <Section id="ic" title="INGRESOS COBRADOS (por cliente / plan)" rows={data.ingCobrados} />
                <Section id="ip" title="INGRESOS PENDIENTES DE COBRO (facturados)" rows={data.ingPendientes} />
                <Section id="ie" title="INGRESOS ESTIMADOS (proyección)" rows={data.ingEstimados} />

                <TotalRow label="TOTAL INGRESOS" values={data.totalIng} positive />

                <Section id="ep" title="EGRESOS PAGADOS (por categoría)" rows={data.egPagados} />
                <Section id="epp" title="EGRESOS PENDIENTES (estim.)" rows={data.egPendientes} />

                <TotalRow label="TOTAL EGRESOS" values={data.totalEg} positive={false} />

                <Section id="aj" title="AJUSTES DE CAJA" rows={data.ajustesRows} />

                <TotalRow label="NETO (I − G + Ajustes)" values={data.neto} signed />
                <TotalRow label="ACUMULADO" values={data.acumulado} signed bold totalMode="last" />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cell(n: number) {
  return n === 0 ? <span className="text-muted-foreground/50">—</span> : formatPesos(n);
}

/** Sección colapsable, agrupada por categoría con subtotales desplegables. */
function Section({ id, title, rows }: { id: string; title: string; rows: Row[] }) {
  const [open, setOpen] = useState(true);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  const grupos = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.cat ?? "Otros";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries())
      .map(([cat, rs]) => ({
        cat,
        rows: rs,
        values: empty12().map((_, i) => sum(rs.map((r) => r.values[i]))),
        sign: rs[0]?.sign ?? "+",
      }))
      .sort((a, b) => sum(b.values) - sum(a.values));
  }, [rows]);

  const totales = empty12().map((_, i) => sum(rows.map((r) => r.values[i])));

  return (
    <>
      <tr className="no-stripe cursor-pointer border-t border-border bg-muted/40" onClick={() => setOpen((v) => !v)}>
        <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
          <span className="inline-flex items-center gap-1">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {title}
            <span className="ml-1 font-normal normal-case text-muted-foreground">
              {grupos.length} categoría(s) · {rows.length} registro(s)
            </span>
          </span>
        </td>
        {totales.map((v, i) => (
          <td key={i} className="px-2 py-2 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
            {cell(v)}
          </td>
        ))}
        <td className="px-3 py-2 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
          {cell(sum(totales))}
        </td>
      </tr>

      {open && rows.length === 0 ? <EmptyRow /> : null}

      {open
        ? grupos.map((g) => {
            const abierta = !!abiertas[g.cat];
            const color = g.sign === "+" ? "text-primary" : "text-destructive";
            return (
              <Fragment key={`${id}-${g.cat}`}>
                <tr
                  className="no-stripe cursor-pointer border-t border-border/50 bg-muted/15 hover:bg-muted/30"
                  onClick={() => setAbiertas((s) => ({ ...s, [g.cat]: !s[g.cat] }))}
                >
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                      {abierta ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {g.cat}
                      <span className="text-[10px] text-muted-foreground">({g.rows.length})</span>
                    </span>
                  </td>
                  {g.values.map((v, i) => (
                    <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${v === 0 ? "" : color}`}>{cell(v)}</td>
                  ))}
                  <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${color}`}>{cell(sum(g.values))}</td>
                </tr>
                {abierta ? g.rows.map((r, i) => <DataRow key={`${id}-${g.cat}-${i}`} row={r} />) : null}
              </Fragment>
            );
          })
        : null}
    </>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={14} className="px-3 py-2 text-xs italic text-muted-foreground">Sin registros.</td>
    </tr>
  );
}

function DataRow({ row }: { row: Row }) {
  const color = row.sign === "+" ? "text-primary" : "text-destructive";
  const total = sum(row.values);
  return (
    <tr className="border-t border-border/40 hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-card px-3 py-2">
        <div className="font-medium">{row.label}</div>
        {row.badge && (
          <div className="mt-0.5">
            <span className="inline-block rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              {row.badge}
            </span>
          </div>
        )}
        {row.sub && <div className="text-[10px] text-muted-foreground">{row.sub}</div>}
      </td>
      {row.values.map((v, i) => {
        const tip = row.tooltips?.[i];
        return (
          <td
            key={i}
            title={tip}
            className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "" : color} ${tip ? "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}
          >
            {cell(v)}
          </td>
        );
      })}
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${color}`}>{cell(total)}</td>
    </tr>
  );
}

function TotalRow({
  label, values, positive, signed, bold, totalMode = "sum",
}: { label: string; values: number[]; positive?: boolean; signed?: boolean; bold?: boolean; totalMode?: "sum" | "last" }) {
  // El acumulado no se suma: la columna Total es el saldo de cierre del año.
  const total = totalMode === "last" ? (values[values.length - 1] ?? 0) : sum(values);
  const baseColor = signed
    ? ""
    : positive ? "text-primary" : "text-destructive";
  const colorFor = (n: number) => signed ? (n >= 0 ? "text-primary" : "text-destructive") : baseColor;
  return (
    <tr className={`border-t border-border bg-muted/30 ${bold ? "font-bold" : "font-semibold"}`}>
      <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "" : colorFor(v)}`}>{cell(v)}</td>
      ))}
      <td className={`px-3 py-2 text-right tabular-nums ${colorFor(total)}`}>{cell(total)}</td>
    </tr>
  );
}