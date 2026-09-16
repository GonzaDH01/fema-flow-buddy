import { supabase } from "@/integrations/supabase/client";

/** Producto de catálogo que representa el gasoil del tanque propio. */
export async function productoCombustible() {
  const { data } = await supabase
    .from("fema_productos")
    .select("id,nombre,stock,unidad_medida,precio_compra")
    .eq("categoria", "Combustible")
    .order("codigo", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { id: string; nombre: string; stock: number; unidad_medida: string; precio_compra: number | null } | null;
}

export type IngresoCombustible = {
  userId: string;
  litros: number;
  precioLitro: number | null;
  fecha: string;
  /** Texto único del movimiento, ej. "Compra A-00026-00002378" */
  referencia: string;
  proveedor?: string | null;
};

/**
 * Suma los litros de una compra al tanque de suministro de la empresa:
 * actualiza el stock del producto Combustible, deja el movimiento de stock
 * y registra la entrada en el tanque propio. Es idempotente por referencia.
 */
export async function ingresarCombustibleAlTanque(i: IngresoCombustible): Promise<{ ok: boolean; motivo?: string }> {
  if (!i.litros || i.litros <= 0) return { ok: false, motivo: "La factura no tiene litros cargados." };

  const prod = await productoCombustible();
  if (!prod) return { ok: false, motivo: 'No hay ningún producto en la categoría "Combustible" del catálogo.' };

  const { data: ya } = await supabase
    .from("fema_stock_mov")
    .select("id")
    .eq("producto_id", prod.id)
    .eq("motivo", i.referencia)
    .limit(1);
  if ((ya ?? []).length) return { ok: false, motivo: "Esa compra ya había sumado litros al tanque." };

  const nuevoStock = Number(prod.stock ?? 0) + i.litros;

  const { error: movErr } = await supabase.from("fema_stock_mov").insert({
    user_id: i.userId,
    producto_id: prod.id,
    fecha: i.fecha,
    tipo: "entrada",
    cantidad: i.litros,
    costo_unitario: i.precioLitro,
    motivo: i.referencia,
    stock_resultante: nuevoStock,
  });
  if (movErr) return { ok: false, motivo: movErr.message };

  const patch: { stock: number; precio_compra?: number } = { stock: nuevoStock };
  if (i.precioLitro && i.precioLitro > 0) patch.precio_compra = Number(i.precioLitro.toFixed(2));
  await supabase.from("fema_productos").update(patch).eq("id", prod.id);

  const d = new Date(`${i.fecha}T00:00:00`);
  await (supabase as any).from("fema_tanque_mov").insert({
    user_id: i.userId,
    fecha: i.fecha,
    tipo: "IN",
    litros: i.litros,
    precio_litro: i.precioLitro,
    proveedor: i.proveedor ?? null,
    observaciones: i.referencia,
    anio: d.getFullYear(),
    mes: d.getMonth() + 1,
  });

  return { ok: true };
}

/** Precio de referencia por litro de una factura de combustible. */
export const precioPorLitro = (litros: number | null, neto: number | null, total: number | null) => {
  const l = Number(litros ?? 0);
  if (!l) return null;
  const base = Number(neto ?? 0) || Number(total ?? 0);
  return base ? Number((base / l).toFixed(2)) : null;
};
