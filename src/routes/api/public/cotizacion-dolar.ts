import { createFileRoute } from "@tanstack/react-router";

// Toma la cotización publicada en dolarhoy.com (tipo de cambio VENDEDOR)
// para Dólar oficial y Dólar blue, y actualiza los productos de la
// categoría "Cotizaciones" del catálogo.

type Cotiz = { compra: number | null; venta: number | null };

const limpiar = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function parseDolarHoy(texto: string, etiqueta: RegExp): Cotiz {
  const m = texto.match(etiqueta);
  if (!m) return { compra: null, venta: null };
  const seg = texto.slice(m.index ?? 0, (m.index ?? 0) + 200);
  const num = (re: RegExp) => {
    const x = seg.match(re);
    if (!x?.[1]) return null;
    const v = Number(x[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    compra: num(/Compra\s*\$\s*([\d.,]+)/i),
    venta: num(/Venta\s*\$\s*([\d.,]+)/i),
  };
}

async function desdeDolarHoy(): Promise<{ oficial: Cotiz; blue: Cotiz }> {
  const res = await fetch("https://dolarhoy.com/", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FemaFlow/1.0)" },
  });
  if (!res.ok) throw new Error(`dolarhoy respondió ${res.status}`);
  const texto = limpiar(await res.text());
  return {
    oficial: parseDolarHoy(texto, /D[oó]lar\s+Oficial\s+Compra/i),
    blue: parseDolarHoy(texto, /D[oó]lar\s+blue\s+Compra/i),
  };
}

async function desdeApi(tipo: "oficial" | "blue"): Promise<Cotiz> {
  const res = await fetch(`https://dolarapi.com/v1/dolares/${tipo}`);
  if (!res.ok) return { compra: null, venta: null };
  const j = (await res.json()) as { compra?: number; venta?: number };
  return { compra: j.compra ?? null, venta: j.venta ?? null };
}

export const Route = createFileRoute("/api/public/cotizacion-dolar")({
  server: {
    handlers: {
      GET: async () => {
        try {
          let oficial: Cotiz = { compra: null, venta: null };
          let blue: Cotiz = { compra: null, venta: null };
          try {
            const r = await desdeDolarHoy();
            oficial = r.oficial;
            blue = r.blue;
          } catch {
            /* se usa el respaldo */
          }
          if (!oficial.venta) oficial = await desdeApi("oficial");
          if (!blue.venta) blue = await desdeApi("blue");

          if (!oficial.venta && !blue.venta) {
            return Response.json({ ok: false, error: "No se pudo leer la cotización" }, { status: 502 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: filas } = await supabaseAdmin
            .from("fema_productos")
            .select("id,nombre")
            .eq("categoria", "Cotizaciones");

          const norm = (s: string) =>
            s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

          let actualizados = 0;
          for (const f of filas ?? []) {
            const n = norm(f.nombre ?? "");
            if (!n.includes("dolar")) continue;
            const c = n.includes("blue") ? blue : n.includes("oficial") ? oficial : null;
            if (!c?.venta) continue;
            const { error } = await supabaseAdmin
              .from("fema_productos")
              .update({
                precio: c.venta,
                precio_venta: c.venta,
                precio_compra: c.compra ?? undefined,
                moneda: "ARS",
              })
              .eq("id", f.id);
            if (!error) actualizados++;
          }

          return Response.json({
            ok: true,
            fuente: "dolarhoy.com",
            oficial,
            blue,
            actualizados,
            fecha: new Date().toISOString(),
          });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
