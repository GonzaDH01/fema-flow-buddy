// Rentabilidad operativa: reglas puras (sin red ni React).

export type ClaseCosto = "directo" | "indirecto" | "no_operativo";

/** Clasificación de las categorías de compra para el cálculo de márgenes. */
const DIRECTOS = new Set([
  "Gasoil_Combustible",
  "Repuestos_JD",
  "Repuestos",
  "Mecanicos",
  "Gomeria",
  "Inoculante",
  "Transportistas",
  "Mano_de_Obra",
]);

const NO_OPERATIVOS = new Set([
  "Pago_Creditos",
  "Inversiones",
  "Maquinaria_Rodados",
]);

export function clasificarCosto(categoria: string | null | undefined): ClaseCosto {
  const c = (categoria ?? "").trim();
  if (NO_OPERATIVOS.has(c)) return "no_operativo";
  if (DIRECTOS.has(c)) return "directo";
  return "indirecto";
}

export const etiquetaCategoria = (c: string | null | undefined) =>
  (c ?? "Sin categoría").replace(/_/g, " ");

export type VentaLinea = {
  clienteId: string | null;
  cliente: string;
  fecha: string;
  neto: number;
  trabajo?: string | null;
  hectareas?: number | null;
  metrosBolsa?: number | null;
};

export type CompraLinea = {
  fecha: string;
  neto: number;
  categoria: string | null;
};

export type Resultado = {
  ingresos: number;
  costosDirectos: number;
  costosIndirectos: number;
  noOperativos: number;
  margenBruto: number;
  margenBrutoPct: number;
  resultadoOperativo: number;
  resultadoOperativoPct: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (parte: number, total: number) => (total ? r2((parte / total) * 100) : 0);

export function calcularResultado(ventas: VentaLinea[], compras: CompraLinea[]): Resultado {
  const ingresos = ventas.reduce((s, v) => s + (Number(v.neto) || 0), 0);
  let directos = 0, indirectos = 0, noOp = 0;
  for (const c of compras) {
    const m = Number(c.neto) || 0;
    const clase = clasificarCosto(c.categoria);
    if (clase === "directo") directos += m;
    else if (clase === "indirecto") indirectos += m;
    else noOp += m;
  }
  const margenBruto = ingresos - directos;
  const operativo = margenBruto - indirectos;
  return {
    ingresos: r2(ingresos),
    costosDirectos: r2(directos),
    costosIndirectos: r2(indirectos),
    noOperativos: r2(noOp),
    margenBruto: r2(margenBruto),
    margenBrutoPct: pct(margenBruto, ingresos),
    resultadoOperativo: r2(operativo),
    resultadoOperativoPct: pct(operativo, ingresos),
  };
}

export type CostoPorCategoria = {
  categoria: string;
  clase: ClaseCosto;
  monto: number;
  participacion: number; // % sobre el total de costos operativos
};

export function costosPorCategoria(compras: CompraLinea[]): CostoPorCategoria[] {
  const map = new Map<string, { clase: ClaseCosto; monto: number }>();
  for (const c of compras) {
    const key = c.categoria ?? "Sin categoría";
    const clase = clasificarCosto(c.categoria);
    const prev = map.get(key) ?? { clase, monto: 0 };
    prev.monto += Number(c.neto) || 0;
    map.set(key, prev);
  }
  const totalOperativo = [...map.values()]
    .filter((v) => v.clase !== "no_operativo")
    .reduce((s, v) => s + v.monto, 0);
  return [...map.entries()]
    .map(([categoria, v]) => ({
      categoria,
      clase: v.clase,
      monto: r2(v.monto),
      participacion: v.clase === "no_operativo" ? 0 : pct(v.monto, totalOperativo),
    }))
    .sort((a, b) => b.monto - a.monto);
}

export type FilaCliente = {
  clienteId: string | null;
  cliente: string;
  ingresos: number;
  participacion: number;
  hectareas: number;
  metrosBolsa: number;
  facturas: number;
  /** Costos directos imputados por participación de facturación. */
  costoImputado: number;
  margen: number;
  margenPct: number;
};

/** Reparte los costos directos entre clientes según su peso en la facturación. */
export function rentabilidadPorCliente(ventas: VentaLinea[], costosDirectos: number): FilaCliente[] {
  const total = ventas.reduce((s, v) => s + (Number(v.neto) || 0), 0);
  const map = new Map<string, FilaCliente>();
  for (const v of ventas) {
    const key = v.clienteId ?? v.cliente ?? "s/d";
    const f = map.get(key) ?? {
      clienteId: v.clienteId ?? null, cliente: v.cliente || "Sin cliente",
      ingresos: 0, participacion: 0, hectareas: 0, metrosBolsa: 0,
      facturas: 0, costoImputado: 0, margen: 0, margenPct: 0,
    };
    f.ingresos += Number(v.neto) || 0;
    f.hectareas += Number(v.hectareas) || 0;
    f.metrosBolsa += Number(v.metrosBolsa) || 0;
    f.facturas += 1;
    map.set(key, f);
  }
  return [...map.values()]
    .map((f) => {
      const part = total ? f.ingresos / total : 0;
      const costo = costosDirectos * part;
      const margen = f.ingresos - costo;
      return {
        ...f,
        ingresos: r2(f.ingresos),
        participacion: r2(part * 100),
        costoImputado: r2(costo),
        margen: r2(margen),
        margenPct: pct(margen, f.ingresos),
      };
    })
    .sort((a, b) => b.ingresos - a.ingresos);
}

export type Unitarios = {
  hectareas: number;
  metrosBolsa: number;
  ingresoPorHa: number;
  costoPorHa: number;
  margenPorHa: number;
  ingresoPorMetro: number;
};

/** Indicadores por unidad de trabajo (hectárea picada / metro de bolsa). */
export function unitarios(ventas: VentaLinea[], costosDirectos: number): Unitarios {
  const ha = ventas.reduce((s, v) => s + (Number(v.hectareas) || 0), 0);
  const mb = ventas.reduce((s, v) => s + (Number(v.metrosBolsa) || 0), 0);
  const ingresos = ventas.reduce((s, v) => s + (Number(v.neto) || 0), 0);
  return {
    hectareas: r2(ha),
    metrosBolsa: r2(mb),
    ingresoPorHa: ha ? r2(ingresos / ha) : 0,
    costoPorHa: ha ? r2(costosDirectos / ha) : 0,
    margenPorHa: ha ? r2((ingresos - costosDirectos) / ha) : 0,
    ingresoPorMetro: mb ? r2(ingresos / mb) : 0,
  };
}

export type FilaMes = { mes: number; ingresos: number; costos: number; resultado: number };

export function evolucionMensual(ventas: VentaLinea[], compras: CompraLinea[]): FilaMes[] {
  const filas: FilaMes[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1, ingresos: 0, costos: 0, resultado: 0,
  }));
  const mesDe = (f: string) => Number((f ?? "").slice(5, 7)) || 0;
  for (const v of ventas) {
    const m = mesDe(v.fecha);
    if (m >= 1 && m <= 12) filas[m - 1]!.ingresos += Number(v.neto) || 0;
  }
  for (const c of compras) {
    if (clasificarCosto(c.categoria) === "no_operativo") continue;
    const m = mesDe(c.fecha);
    if (m >= 1 && m <= 12) filas[m - 1]!.costos += Number(c.neto) || 0;
  }
  return filas.map((f) => ({
    mes: f.mes,
    ingresos: r2(f.ingresos),
    costos: r2(f.costos),
    resultado: r2(f.ingresos - f.costos),
  }));
}
