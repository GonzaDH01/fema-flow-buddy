import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseModelJson } from "@/lib/ocr-parse.server";

const HEADERS = { "Content-Type": "application/json" };

const InputSchema = z.object({
  image: z.string().min(100).max(7_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const SYSTEM_PROMPT = `Sos un sistema de lectura de licencias de conducir y carnets habilitantes argentinos
(licencia nacional de conducir, LiNTI, licencia profesional, cursos de carga peligrosa, libreta sanitaria).
Devolvé SOLO un JSON con estos campos exactos, sin texto adicional:
{
  "tipo": "string|null",             // Uno de: "Licencia de conducir particular", "Licencia nacional de transporte interjurisdiccional (LiNTI)", "Licencia profesional", "Carga general", "Carga peligrosa", "Curso de cargas peligrosas", "Libreta sanitaria", "Otro"
  "categorias": "string|null",       // Categorías habilitadas separadas por coma, ej "B1, C2, E1"
  "numero": "string|null",           // Número del carnet o documento que figura
  "autoridad": "string|null",        // Organismo emisor (municipalidad, CNRT, etc.)
  "fecha_emision": "YYYY-MM-DD|null",
  "fecha_vencimiento": "YYYY-MM-DD|null",
  "nombre": "string|null"            // Titular, si figura
}
Reglas:
- Las fechas suelen estar en DD/MM/AAAA: convertilas a YYYY-MM-DD.
- Las categorías argentinas válidas son A, B1, B2, C1, C2, C3, D1, D2, D3, E1, E2, F, G1, G2, G3.
- Si no podés leer un campo, devolvé null. Nunca inventes datos.`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

export const Route = createFileRoute("/api/public/ocr-carnet")({
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
                    { type: "text", text: "Extraé los datos de este carnet o licencia." },
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
