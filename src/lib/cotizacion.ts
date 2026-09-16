// Cotización del dólar oficial cargada como producto en el catálogo
// (categoría "Cotizaciones", nombre que contiene "oficial").

export type ProductoPrecio = {
  nombre?: string | null;
  categoria?: string | null;
  precio?: number | null;
  precio_venta?: number | null;
  precio_compra?: number | null;
  moneda?: string | null;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Valor del dólar oficial tomado del catálogo de productos (0 si no está cargado). */
export function cotizacionOficial(productos: ProductoPrecio[] | undefined | null): number {
  const p = (productos ?? []).find(
    (x) => norm(x.nombre ?? "").includes("dolar") && norm(x.nombre ?? "").includes("oficial"),
  );
  return Number(p?.precio_venta ?? p?.precio ?? 0) || 0;
}

/** Precio base del producto en su moneda: venta, o precio, o compra. */
export function precioBase(p: ProductoPrecio): number {
  return (
    (Number(p.precio_venta ?? 0) || 0) ||
    (Number(p.precio ?? 0) || 0) ||
    (Number(p.precio_compra ?? 0) || 0)
  );
}

/** Precio de venta del producto expresado siempre en pesos. */
export function precioEnPesos(p: ProductoPrecio, dolar: number): number {
  const base = precioBase(p);
  if ((p.moneda ?? "ARS") === "USD") return dolar > 0 ? base * dolar : base;
  return base;
}
