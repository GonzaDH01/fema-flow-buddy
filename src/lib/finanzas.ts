// Núcleo financiero puro (sin acceso a red ni a React).
// Toda la aritmética de pagos, saldos, echeqs y estados de factura vive acá
// para poder testearla y reutilizarla desde cualquier módulo.

export const TOL = 0.01;

export type EstadoMov =
  | "en_cartera" | "cobrado" | "pagado" | "cedido" | "vencido" | "anulado";

export type MovLite = {
  monto: number | string | null;
  estado: EstadoMov | string;
  direccion?: "cobro" | "pago";
  instrumento?: string;
  vencimiento?: string | null;
  factura_venta_id?: string | null;
  factura_compra_id?: string | null;
  echeq_origen_id?: string | null;
};

export const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const redondear = (n: number) => Math.round(n * 100) / 100;

/** Estados que cuentan como dinero efectivamente aplicado a la factura. */
export function estadosConfirmados(tipo: "venta" | "compra"): string[] {
  return tipo === "venta" ? ["cobrado"] : ["pagado", "cedido"];
}

/** Estados que comprometen fondos: confirmados + documentos en cartera (plan de pago). */
export function estadosComprometidos(tipo: "venta" | "compra"): string[] {
  return [...estadosConfirmados(tipo), "en_cartera"];
}

/** Suma confirmada aplicada a una factura. */
export function totalConfirmado(movs: MovLite[], tipo: "venta" | "compra"): number {
  const ok = estadosConfirmados(tipo);
  return redondear(movs.filter(m => ok.includes(m.estado)).reduce((s, m) => s + num(m.monto), 0));
}

/** Suma programada (documentos emitidos/recibidos aún en cartera). */
export function totalProgramado(movs: MovLite[]): number {
  return redondear(movs.filter(m => m.estado === "en_cartera").reduce((s, m) => s + num(m.monto), 0));
}

/** Saldo pendiente real de una factura (nunca negativo). */
export function saldoFactura(total: unknown, pagado: number, programado = 0): number {
  return Math.max(0, redondear(num(total) - pagado - programado));
}

/** Estado que debería tener la factura según los movimientos asociados. */
export function estadoFactura(
  total: unknown,
  movs: MovLite[],
  tipo: "venta" | "compra",
): "cobrada" | "pagada" | "pendiente" {
  const t = num(total);
  const cubierto = totalConfirmado(movs, tipo);
  const ok = tipo === "venta" ? "cobrada" : "pagada";
  return cubierto >= t - TOL && t > 0 ? ok : "pendiente";
}

export type Objetivo = { id: string; restante: number };

/** Construye los objetivos de imputación (factura → saldo restante). */
export function construirObjetivos(
  facturas: { id: string; total: unknown }[],
  previos: MovLite[],
  tipo: "venta" | "compra",
): Objetivo[] {
  const col = tipo === "venta" ? "factura_venta_id" : "factura_compra_id";
  const validos = estadosComprometidos(tipo);
  const aplicado = new Map<string, number>();
  for (const p of previos) {
    if (!validos.includes(p.estado)) continue;
    const fid = (p as Record<string, unknown>)[col] as string | null;
    if (!fid) continue;
    aplicado.set(fid, (aplicado.get(fid) ?? 0) + num(p.monto));
  }
  return facturas.map(f => ({
    id: f.id,
    restante: Math.max(0, redondear(num(f.total) - (aplicado.get(f.id) ?? 0))),
  }));
}

/**
 * Reparte un importe entre varias facturas en orden, consumiendo el saldo de
 * cada una. El excedente se imputa a la última. Muta `objetivos.restante`.
 */
export function repartirImporte(
  objetivos: Objetivo[],
  importe: number,
  fallbackId: string | null = null,
): { facturaId: string | null; monto: number }[] {
  if (objetivos.length === 0) return [{ facturaId: fallbackId, monto: redondear(importe) }];
  if (objetivos.length === 1) {
    objetivos[0].restante = Math.max(0, redondear(objetivos[0].restante - importe));
    return [{ facturaId: objetivos[0].id, monto: redondear(importe) }];
  }
  const chunks: { facturaId: string | null; monto: number }[] = [];
  let resto = importe;
  for (const o of objetivos) {
    if (resto <= 0) break;
    if (o.restante <= 0) continue;
    const usar = Math.min(o.restante, resto);
    chunks.push({ facturaId: o.id, monto: redondear(usar) });
    o.restante = redondear(o.restante - usar);
    resto = redondear(resto - usar);
  }
  if (resto > TOL - 0.001) {
    const ult = objetivos[objetivos.length - 1];
    chunks.push({ facturaId: ult.id, monto: redondear(resto) });
  }
  return chunks.length > 0 ? chunks : [{ facturaId: objetivos[0].id, monto: redondear(importe) }];
}

/** Un echeq cedido es indivisible: se imputa entero a la primera factura con saldo. */
export function imputarIndivisible(
  objetivos: Objetivo[],
  importe: number,
  fallbackId: string | null = null,
): string | null {
  if (objetivos.length === 0) return fallbackId;
  const o = objetivos.find(x => x.restante > 0) ?? objetivos[0];
  o.restante = Math.max(0, redondear(o.restante - importe));
  return o.id;
}

export type ImputacionPropuesta = {
  facturaId: string;
  monto: number;
  numero?: string;
  total?: number;
  yaAplicado?: number;
};

export type PropuestaImputacion = {
  imputaciones: ImputacionPropuesta[];
  saldoACuenta: number;
  totalDistribuido: number;
};

/**
 * Propone imputaciones para un pago/cobro sobre un conjunto de facturas.
 * Respeta el saldo pendiente de cada una y deja el excedente como saldo a cuenta.
 * Mantiene la misma semántica de `repartirImporte` (orden cronológico de facturas).
 */
export function proponerImputaciones(
  facturas: { id: string; total: unknown; numero?: string }[],
  previos: MovLite[],
  importe: number,
  tipo: "venta" | "compra",
): PropuestaImputacion {
  const objetivos = construirObjetivos(facturas, previos, tipo);
  const totalPendiente = redondear(objetivos.reduce((s, o) => s + o.restante, 0));
  const aDistribuir = Math.min(importe, totalPendiente);
  const chunks = repartirImporte(objetivos, aDistribuir, null);
  const col = tipo === "venta" ? "factura_venta_id" : "factura_compra_id";
  const validos = estadosComprometidos(tipo);
  const imputaciones = chunks
    .filter(c => c.facturaId)
    .map(c => {
      const f = facturas.find(x => x.id === c.facturaId);
      const yaAplicado = previos
        .filter(p => validos.includes(p.estado) && (p as Record<string, unknown>)[col] === c.facturaId)
        .reduce((s, p) => s + num(p.monto), 0);
      return {
        facturaId: c.facturaId!,
        monto: c.monto,
        numero: f?.numero,
        total: num(f?.total),
        yaAplicado: redondear(yaAplicado),
      };
    });
  const totalDistribuido = imputaciones.reduce((s, i) => s + i.monto, 0);
  const saldoACuenta = redondear(importe - totalDistribuido);
  return { imputaciones, saldoACuenta, totalDistribuido };
}

export const hoyISO = () => new Date().toISOString().split("T")[0];

/** Documento a cobrar cuya fecha de pago ya pasó y sigue en cartera. */
export function esVencidoSinCobrar(m: MovLite, hoy = hoyISO()): boolean {
  return m.estado === "en_cartera"
    && m.direccion !== "pago"
    && !!m.vencimiento
    && m.vencimiento < hoy;
}

/** Echeq/cheque propio emitido cuyo importe todavía no salió de la caja. */
export function esEmitidoPendiente(m: MovLite): boolean {
  return m.direccion === "pago"
    && (m.instrumento === "echeq" || m.instrumento === "cheque_fisico")
    && m.estado === "en_cartera";
}

/** Origen de un documento, para distinguir propios de terceros. */
export function origenDocumento(m: MovLite): "propio" | "cedido" | "tercero" {
  if (m.instrumento === "cesion" || m.echeq_origen_id) return "cedido";
  return m.direccion === "pago" ? "propio" : "tercero";
}

/**
 * Saldo proyectado de la caja: saldo actual menos los documentos propios
 * emitidos que todavía no se debitaron, más los documentos a cobrar en cartera.
 */
export function saldoProyectado(saldoActual: unknown, movs: MovLite[]): number {
  let saldo = num(saldoActual);
  for (const m of movs) {
    if (m.estado !== "en_cartera") continue;
    if (m.direccion === "pago") saldo -= num(m.monto);
    else saldo += num(m.monto);
  }
  return redondear(saldo);
}
/**
 * Notas de crédito / débito: se cargan a modo informativo (impactan en Auditoría
 * por IVA e impuestos) pero NO generan deuda ni acción en Pagos, Cuentas
 * corrientes, Cashflow, Tesorería ni Alertas.
 */
export const COMPROBANTES_INFORMATIVOS = ["Nota de Crédito", "Nota de Débito"] as const;

export function esComprobanteInformativo(tipoComprobante?: string | null): boolean {
  const t = (tipoComprobante ?? "").trim().toLowerCase();
  return t === "nota de crédito" || t === "nota de credito"
    || t === "nota de débito" || t === "nota de debito";
}
