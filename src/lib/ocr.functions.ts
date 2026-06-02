import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExtractedFactura = {
  tipo: string | null;
  punto_venta: number | null;
  numero: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  razon_social: string | null;
  cuit: string | null;
  condicion_iva: string | null;
  concepto: string | null;
  neto: number | null;
  iva_total: number | null;
  percepciones_total: number | null;
  retenciones_total: number | null;
  total: number | null;
  iva_lineas: { alicuota: number; base_imponible: number; importe: number }[];
  confianza: number | null;
};

const inputSchema = z.object({
  imageBase64: z.string().min(20).max(15_000_000),
  mimeType: z.string().min(3).max(64),
});

const SYSTEM_PROMPT = `Sos un asistente que extrae datos de comprobantes fiscales argentinos (facturas A/B/C/E/M, notas de débito/crédito, recibos).
Devolvé SOLO un JSON válido con esta forma exacta (sin markdown, sin comentarios):
{
  "tipo": "A" | "B" | "C" | "E" | "M" | null,
  "punto_venta": number | null,
  "numero": number | null,
  "fecha_emision": "YYYY-MM-DD" | null,
  "fecha_vencimiento": "YYYY-MM-DD" | null,
  "razon_social": string | null,
  "cuit": string | null,
  "condicion_iva": "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable" | null,
  "concepto": string | null,
  "neto": number | null,
  "iva_total": number | null,
  "percepciones_total": number | null,
  "retenciones_total": number | null,
  "total": number | null,
  "iva_lineas": [{ "alicuota": number, "base_imponible": number, "importe": number }],
  "confianza": number
}
Usá punto como separador decimal. "confianza" entre 0 y 1. Si un campo no aparece, devolvé null.`;

export const extractFactura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraé los datos de este comprobante y devolvé únicamente el JSON solicitado." },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Límite de uso alcanzado. Intentá más tarde.");
      if (res.status === 402) throw new Error("Sin créditos de IA disponibles.");
      throw new Error(`Error AI Gateway (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<ExtractedFactura> = {};
    try {
      parsed = JSON.parse(content) as Partial<ExtractedFactura>;
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]) as Partial<ExtractedFactura>;
    }
    const result: ExtractedFactura = {
      tipo: parsed.tipo ?? null,
      punto_venta: parsed.punto_venta ?? null,
      numero: parsed.numero ?? null,
      fecha_emision: parsed.fecha_emision ?? null,
      fecha_vencimiento: parsed.fecha_vencimiento ?? null,
      razon_social: parsed.razon_social ?? null,
      cuit: parsed.cuit ?? null,
      condicion_iva: parsed.condicion_iva ?? null,
      concepto: parsed.concepto ?? null,
      neto: parsed.neto ?? null,
      iva_total: parsed.iva_total ?? null,
      percepciones_total: parsed.percepciones_total ?? null,
      retenciones_total: parsed.retenciones_total ?? null,
      total: parsed.total ?? null,
      iva_lineas: Array.isArray(parsed.iva_lineas) ? parsed.iva_lineas : [],
      confianza: parsed.confianza ?? null,
    };
    return result;
  });