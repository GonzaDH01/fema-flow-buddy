export const formatPesos = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));

export const formatNumero = (n: number | null | undefined, frac = 2) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: frac }).format(Number(n ?? 0));

export const formatFecha = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
};

export const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];