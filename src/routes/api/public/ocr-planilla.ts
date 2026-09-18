import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseModelJson } from "@/lib/ocr-parse.server";

const HEADERS = { "Content-Type": "application/json" };

const InputSchema = z.object({
  image: z.string().min(100).max(7_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const SYSTEM_PROMPT = `Sos un lector de planillas de papel de FEMA AGRONEGOCIOS S.A.S.
El formulario se llama "PLANILLA DIARIA DE PICADO Y EMBOLSADO" y está manuscrito.
Devolvé SOLO un JSON con estos campos exactos, sin texto adicional:

{
  "fecha": "YYYY-MM-DD|null",
  "cliente": "string|null",
  "establecimiento": "string|null",
  "lote": "string|null",
  "zona": "string|null",
  "cultivo": "string|null",
  "bolsero": "string|null",
  "bolsas": [0,0,0,0,0,0,0],
  "total_metros": 0,
  "equipos": [
    { "equipo": "string", "chofer": "string|null", "dominio": "string|null", "viajes": 0, "metros": 0, "es_tercero": false }
  ],
  "observaciones": "string|null"
}

Reglas:
- "bolsas": los metros escritos en cada casilla Bolsa 1 a Bolsa 7, en orden. Si una casilla está vacía poné 0.
- En la sección "2. Registro de viajes": contá las casillas marcadas con X o tilde de cada fila y usá ese número en "viajes". Si el total de viajes está escrito a mano en la última casilla, priorizá ese número.
- Las filas bajo "EQUIPOS PROPIOS DE LA EMPRESA" (Ford 700, Chevrolet 600, Carro Fontanini, Zanello, Embolsadora, etc.) llevan es_tercero=false. Las filas bajo "CONTRATISTAS / TERCEROS" llevan es_tercero=true.
- No inventes filas: devolvé solo las que tienen algún dato escrito.
- Las fechas van en formato YYYY-MM-DD (la planilla usa día/mes/año).
- Todos los números en número, no string. Si no podés leer un dato usá null o 0.`;

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

export const Route = createFileRoute("/api/public/ocr-planilla")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: HEADERS }),
      POST: async ({ request }) => {
        try {
          const authHeader =
            request.headers.get("authorization") ?? request.headers.get("Authorization");
          const token = authHeader?.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : null;
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
                    { type: "text", text: "Leé esta planilla de picado y embolsado." },
                  ],
                },
              ],
            }),
          });

          if (ai.status === 429)
            return json(429, { error: "Límite de lecturas alcanzado. Esperá unos segundos." });
          if (ai.status === 402)
            return json(402, { error: "Sin créditos de IA. Contactá al administrador." });
          if (!ai.ok) return json(500, { error: "No se pudo leer la planilla." });

          const payload = await ai.json();
          const content = payload?.choices?.[0]?.message?.content;
          if (!content) return json(500, { error: "Respuesta vacía del lector." });

          const data = parseModelJson(String(content));
          if (!data) return json(502, { error: "No se pudo leer el documento. Probá con una foto más nítida o un PDF de una sola página." }););
          }
          return json(200, { data });
        } catch (e: any) {
          return json(500, { error: e?.message ?? "Error interno" });
        }
      },
    },
  },
});
