import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseModelJson } from "@/lib/ocr-parse.server";

const HEADERS = { "Content-Type": "application/json" };

const InputSchema = z.object({
  image: z.string().min(100).max(7_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const SYSTEM_PROMPT = `Sos un sistema de lectura de documentos de compra a plazo argentinos:
pagarés, boletos de compraventa, convenios de pago, mutuos y contratos prendarios de maquinaria y rodados.
Devolvé SOLO un JSON con estos campos exactos, sin texto adicional:
{
  "tipo_documento": "string|null",      // Uno de: "Pagaré", "Boleto de compraventa", "Convenio de pago", "Mutuo", "Prenda", "Otro"
  "numero": "string|null",              // Número del documento o del pagaré
  "numero_cuota": "number|null",        // Si dice "cuota N de M", el N
  "cantidad_cuotas": "number|null",     // La M de "cuota N de M", si figura
  "moneda": "ARS|USD|null",             // USD si dice dólares / U$S / USD; ARS si pesos / $
  "monto": "number|null",               // Importe en números, sin separadores de miles ni símbolo
  "monto_en_letras": "string|null",     // Importe escrito en letras, tal cual figura
  "fecha_emision": "YYYY-MM-DD|null",
  "fecha_vencimiento": "YYYY-MM-DD|null",
  "beneficiario": "string|null",        // A la orden de quién / vendedor / acreedor
  "firmante": "string|null",            // Quién firma como deudor
  "bien": "string|null",                // Bien o implemento comprado, si figura
  "lugar": "string|null"                // Lugar de pago o de firma
}
Reglas:
- Las fechas suelen estar en DD/MM/AAAA: convertilas a YYYY-MM-DD.
- Si el importe está en letras y en números y difieren, priorizá el escrito en letras para "monto".
- Devolvé "monto" como número decimal con punto (ej 1250000.50).
- Si no podés leer un campo, devolvé null. Nunca inventes datos.`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

export const Route = createFileRoute("/api/public/ocr-pagare")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: HEADERS }),
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
          const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
          if (!token) return json(401, { error: "No autenticado" });

          const { createClient } = await import("@supabase/supabase-js");
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseAnon = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !supabaseAnon) return json(500, { error: "Servicio no configurado." });
          const sb = createClient(supabaseUrl, supabaseAnon, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userRes, error: userErr } = await sb.auth.getUser();
          if (userErr || !userRes?.user) return json(401, { error: "Sesión inválida" });

          const raw = await request.json().catch(() => null);
          const parsed = InputSchema.safeParse(raw);
          if (!parsed.success) return json(400, { error: "Datos inválidos" });
          const { image, mimeType } = parsed.data;
          if (image.length > 5_000_000) return json(413, { error: "Imagen demasiado grande. Máximo 3MB." });

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return json(500, { error: "Servicio de IA no configurado." });

          const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 8000,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } },
                    { type: "text", text: "Extraé los datos de este documento de compra a plazo." },
                  ],
                },
              ],
            }),
          });

          if (ai.status === 429) return json(429, { error: "Límite de requests alcanzado. Esperá unos segundos." });
          if (ai.status === 402) return json(402, { error: "Sin créditos de IA. Contactá al administrador." });
          if (!ai.ok) return json(500, { error: "Error al procesar la imagen." });

          const payload = await ai.json();
          const content = payload?.choices?.[0]?.message?.content;
          if (!content) return json(500, { error: "Respuesta vacía del modelo." });
          const data = parseModelJson(String(content));
          if (!data) return json(502, { error: "No se pudo leer el documento. Probá con una foto más nítida o un PDF de una sola página." });
          return json(200, { data });
        } catch (e) {
          return json(500, { error: e instanceof Error ? e.message : "Error interno" });
        }
      },
    },
  },
});
