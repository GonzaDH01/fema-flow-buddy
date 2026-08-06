// Proyección de tesorería: reglas puras (sin red ni React).
export type Flujo = {
  fecha: string;            // ISO yyyy-mm-dd
  concepto: string;
  origen: string;           // categoría
  monto: number;            // + ingreso / - egreso
};

export type Semana = {
  inicio: string;
  fin: string;
  ingresos: number;
  egresos: number;
  neto: number;
  saldoFinal: number;
  detalle: Flujo[];
};

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Lunes de la semana de una fecha. */
export function lunesDe(f: string | Date): string {
  const d = typeof f === "string" ? new Date(`${f}T00:00:00Z`) : new Date(f);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return iso(new Date(d.getTime() - dow * DIA));
}

export function sumarDias(f: string, n: number): string {
  return iso(new Date(new Date(`${f}T00:00:00Z`).getTime() + n * DIA));
}

/** Agrupa flujos en N semanas consecutivas arrancando en la semana de `desde`. */
export function proyectar(flujos: Flujo[], saldoInicial: number, desde: string, semanas = 13): Semana[] {
  const inicio0 = lunesDe(desde);
  const out: Semana[] = [];
  let saldo = saldoInicial;

  for (let i = 0; i < semanas; i++) {
    const inicio = sumarDias(inicio0, i * 7);
    const fin = sumarDias(inicio, 6);
    // Todo lo atrasado cae en la primera semana.
    const detalle = flujos.filter((f) =>
      i === 0 ? f.fecha <= fin : f.fecha >= inicio && f.fecha <= fin,
    );
    const ingresos = detalle.filter((f) => f.monto > 0).reduce((s, f) => s + f.monto, 0);
    const egresos = detalle.filter((f) => f.monto < 0).reduce((s, f) => s - f.monto, 0);
    const neto = ingresos - egresos;
    saldo += neto;
    out.push({
      inicio, fin,
      ingresos: Math.round(ingresos * 100) / 100,
      egresos: Math.round(egresos * 100) / 100,
      neto: Math.round(neto * 100) / 100,
      saldoFinal: Math.round(saldo * 100) / 100,
      detalle: detalle.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    });
  }
  return out;
}

/** Primera semana con saldo proyectado negativo, si existe. */
export function primerDeficit(semanas: Semana[]): Semana | null {
  return semanas.find((s) => s.saldoFinal < 0) ?? null;
}
