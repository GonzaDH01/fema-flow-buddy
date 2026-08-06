// Motor de alertas: reglas puras sobre datos ya cargados.
export type Severidad = "critica" | "alta" | "media" | "info";

export type Alerta = {
  id: string;
  severidad: Severidad;
  categoria: string;
  titulo: string;
  detalle: string;
  monto?: number;
  fecha?: string | null;
  to?: string;
};

export const ORDEN_SEV: Record<Severidad, number> = {
  critica: 0, alta: 1, media: 2, info: 3,
};

export const hoyISO = () => new Date().toISOString().slice(0, 10);

export const diasHasta = (f?: string | null) => {
  if (!f) return null;
  return Math.round((new Date(`${f}T00:00:00`).getTime() - new Date(`${hoyISO()}T00:00:00`).getTime()) / 86_400_000);
};

export function ordenarAlertas(as: Alerta[]) {
  return [...as].sort(
    (a, b) => ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad] || (b.monto ?? 0) - (a.monto ?? 0),
  );
}

export function severidadPorAtraso(dias: number): Severidad {
  if (dias > 60) return "critica";
  if (dias > 30) return "alta";
  return "media";
}
