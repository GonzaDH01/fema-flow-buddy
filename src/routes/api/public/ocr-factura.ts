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
Analizá la imagen y devolvé SOLO un JSON con estos campos exactos (sin texto adicional):
{
  "tipo": "factura|recibo|ticket|otro",
  "letra": "A|B|C|M|E|null",
  "numero": "string|null",
  "fecha": "YYYY-MM-DD|null",
  "emisor": "string|null",
  "receptor": "string|null",
  "descripcion": "string|null",
  "categoria_sugerida": "Repuestos_JD|Mecanicos|Gomeria|Inoculante|Transportistas|Seguros|Servicios|Herramientas|Otro",
  "es_combustible": false,
  "neto": 0, "iva_21": 0, "iva_105": 0,
  "itc_combustible": 0, "co2_combustible": 0,
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