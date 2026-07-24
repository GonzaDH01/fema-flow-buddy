import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS_HEADERS = {
  // Same-origin only: el frontend propio llama a este endpoint con cookies/session,
  // así que no se necesita CORS permisivo. Sin wildcard se evita que sitios de
  // terceros disparen requests al gateway de IA.
  "Content-Type": "application/json",
};

const InputSchema = z.object({
  image: z.string().min(100).max(7_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

const SYSTEM_PROMPT = `Sos un sistema de extracción de datos de facturas argentinas.
Analizá la imagen y devolvé SOLO un JSON con estos campos exactos (sin texto adicional).

Reglas para EMISOR / RECEPTOR (muy importante):
- "emisor" = razón social de QUIEN EMITE la factura (vendedor / proveedor). Suele estar arriba a la izquierda o al costado del logo, junto al CUIT.
- "receptor" = razón social de A QUIEN se le factura (cliente). Suele decir "Sr./Sra.", "Cliente", "Razón Social" en el bloque de datos del comprador.
- "cuit_emisor" y "cuit_receptor" son los CUIT/CUIL correspondientes (solo dígitos, 11 caracteres). NO confundir con Ingresos Brutos ni con nº de factura.
- Si sólo hay un CUIT visible, asumí que es el del emisor.
- Siempre completá "emisor" si aparece alguna razón social o nombre de fantasía en el encabezado, aunque no encuentres el CUIT.

Reglas para IMPUESTOS (muy importante):
- Buscá etiquetas: "Neto Gravado", "Subtotal", "IVA 21%", "IVA 10,5%", "Percepción IIBB", "Percepción IVA", "ITC", "CO2", "Impuestos Internos", "Otros Tributos", "Total".
- Si la factura es letra "A" o "M": el IVA está discriminado. Cargalo tal cual figura.
- Si la factura es letra "B" o "C" (consumidor final / monotributo): el IVA NO se discrimina. Dejá iva_21=0, iva_105=0 y usá "total" como total final; "neto" = total.
- Si ves "IVA Contenido" en una letra B, no lo cargues como iva_21 salvo que esté claramente discriminado.
- Para tickets de combustible (YPF, Axion, Shell, Puma, etc.): suelen ser letra B con ITC y CO2 discriminados; cargá itc_combustible y co2_combustible, dejá iva_21 en 0 salvo que aparezca literal.

Reglas ESPECÍFICAS para COMBUSTIBLE (muy importante — hoy se pierden estos importes):
- Buscá TODAS estas etiquetas y cargalas por separado, no las sumes al neto:
  * "Imp. Interno ITC nafta", "ITC nafta", "Impuesto s/Naftas" → itc_nafta
  * "Imp. al Gas Oil", "Impuesto al Gasoil", "ITC Gasoil", "Impuesto s/Gasoil" → itc_gasoil
  * "Imp. Interno CO2 nafta", "CO2 nafta", "Impuesto CO2 naftas" → co2_nafta
  * "Imp. Interno CO2 gasoil", "CO2 gasoil", "Impuesto CO2 gasoil" → co2_gasoil
  * "Tasa Vial", "Tasa Hídrica", "Fondo Hídrico", "Impuestos Internos" (genérico), "Otros Tributos" → otros_impuestos
  * "Percepción IIBB", "Percepción IVA", "Percepción Ganancias", "SUSS" → percepciones
- itc_combustible = itc_nafta + itc_gasoil (mantener suma en itc_combustible para compat.)
- co2_combustible = co2_nafta + co2_gasoil (mantener suma en co2_combustible para compat.)
- En tickets B/C de estación de servicio: el precio de pizarra ya incluye IVA. neto = total - (itc + co2 + otros + percepciones). Nunca dejes itc/co2 en 0 si el ticket los discrimina en el pie.
- Verificá coherencia: neto + iva_21 + iva_105 + otros_impuestos + percepciones ≈ total. Si no cierra, ajustá "otros_impuestos" para cuadrar.

Campos exactos:
{
  "tipo": "factura|recibo|ticket|otro",
  "letra": "A|B|C|M|E|null",
  "numero": "string|null",
  "fecha": "YYYY-MM-DD|null",
  "emisor": "string|null",
  "receptor": "string|null",
  "cuit_emisor": "string|null",
  "cuit_receptor": "string|null",
  "descripcion": "string|null",
  "categoria_sugerida": "Gasoil_Combustible|Repuestos_JD|Repuestos|Mecanicos|Gomeria|Inoculante|Transportistas|Seguros|Servicios|Herramientas|Mano_de_Obra|Honorarios|Franco_Particular|Otro",
  // Reglas de categoría:
  // - Si es_combustible=true o el emisor es estación de servicio (YPF, Axion, Shell, Puma, Servicentro, Estación de Servicio, Red Mercosur, FASENA, etc.) o el producto contiene "diesel/gasoil/nafta/v-power/quantium/infinia/euro" → categoria_sugerida="Gasoil_Combustible".
  // - Si el detalle refiere a jornales, trabajo humano, servicios personales, honorarios de operarios → "Mano_de_Obra".
  // - Si el comprobante es de un profesional (contador, abogado, ingeniero, arquitecto, escribano, asesor) o dice "honorarios profesionales" → "Honorarios".
  // - Si son repuestos genéricos (no John Deere) — filtros, aceites, bujías, correas, rodamientos, etc. → "Repuestos". Si son repuestos John Deere u originales JD → "Repuestos_JD".
  // - Si el emisor es un particular (monotributista sin razón social comercial, factura C personal) o el detalle indica gastos personales → "Franco_Particular".
  // - Nunca uses "Otro" si aplica una categoría específica.
  "es_combustible": false,
  "neto": 0, "iva_21": 0, "iva_105": 0,
  "itc_combustible": 0, "co2_combustible": 0,
  "itc_nafta": 0, "itc_gasoil": 0, "co2_nafta": 0, "co2_gasoil": 0,
  "otros_impuestos": 0, "percepciones": 0, "total": 0,
  "litros": null, "producto_combustible": null, "moneda": "ARS"
}
Todos los valores numéricos en número (no string). Si no podés leer un campo, usá null o 0.`;

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });

export const Route = createFileRoute("/api/public/ocr-factura")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          // Auth check: require a valid Supabase session bearer token.
          // This endpoint forwards to a paid AI service, so anonymous access
          // would let anyone burn the LOVABLE_API_KEY credits.
          const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
          const token = authHeader?.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : null;
          if (!token) return json(401, { error: "No autenticado" });

          const { createClient } = await import("@supabase/supabase-js");
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseAnon = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !supabaseAnon) {
            return json(500, { error: "Servicio no configurado." });
          }
          const sb = createClient(supabaseUrl, supabaseAnon, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userRes, error: userErr } = await sb.auth.getUser();
          if (userErr || !userRes?.user) return json(401, { error: "Sesión inválida" });

          const raw = await request.json().catch(() => null);
          const parsed = InputSchema.safeParse(raw);
          if (!parsed.success) return json(400, { error: "Datos inválidos", details: parsed.error.format() });
          const { image, mimeType } = parsed.data;
          if (image.length > 5_000_000) return json(413, { error: "Imagen demasiado grande. Máximo 3MB." });

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return json(500, { error: "Servicio de IA no configurado." });

          const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 1000,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } },
                    { type: "text", text: "Extraé todos los datos de esta factura." },
                  ],
                },
              ],
            }),
          });

          if (ai.status === 429) return json(429, { error: "Límite de requests alcanzado. Esperá unos segundos." });
          if (ai.status === 402) return json(402, { error: "Sin créditos en Lovable AI. Contactá al administrador." });
          if (!ai.ok) {
            const txt = await ai.text();
            return json(500, { error: "Error al procesar la imagen.", detail: txt.slice(0, 300) });
          }

          const payload = await ai.json();
          const content = payload?.choices?.[0]?.message?.content;
          if (!content) return json(500, { error: "Respuesta vacía del modelo." });

          let data: any;
          try { data = JSON.parse(content); } catch { return json(500, { error: "Respuesta no es JSON válido." }); }

          return json(200, { data });
        } catch (e: any) {
          return json(500, { error: e?.message ?? "Error interno" });
        }
      },
    },
  },
});