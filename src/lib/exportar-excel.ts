import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";

const sb = supabase as any;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ModuloExport =
  | "cashflow"
  | "facturas_venta"
  | "facturas_compra"
  | "medios_pago"
  | "clientes"
  | "proveedores"
  | "combustible"
  | "empleados"
  | "sueldos"
  | "impuestos"
  | "cuentas_bancarias"
  | "creditos"
  | "gastos_fijos";

export interface OpcionesExport {
  anio?: number;
  desde?: string;
  hasta?: string;
  modulos: ModuloExport[];
  formato: "xlsx" | "zip_csv";
}

function betweenDates(col: string, desde?: string, hasta?: string) {
  const parts: string[] = [];
  if (desde) parts.push(`${col}.gte.${desde}`);
  if (hasta) parts.push(`${col}.lte.${hasta}`);
  return parts;
}

async function fetchRows(tabla: string, opts: OpcionesExport, cols: string, dateCol = "fecha") {
  let q = sb.from(tabla).select(cols);
  if (opts.anio && tabla !== "fema_empleados" && tabla !== "fema_sueldos") {
    q = q.eq("anio", opts.anio);
  }
  const filters = betweenDates(dateCol, opts.desde, opts.hasta);
  for (const f of filters) q = q.or(f);
  const { data, error } = await q.order(dateCol, { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function sheetName(name: string) {
  return name.slice(0, 31);
}

function cleanRows(rows: any[]) {
  return rows.map((r) => {
    const out: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) {
        out[k] = "";
      } else if (typeof v === "object" && !(v instanceof Date)) {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const lines = rows.map((r) =>
    cols
      .map((c) => {
        const v = r[c];
        const s = String(v ?? "").replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export async function exportarSeleccion(userId: string, opts: OpcionesExport) {
  const wb = XLSX.utils.book_new();
  const zip = opts.formato === "zip_csv" ? new JSZip() : null;
  const add = (name: string, rows: any[]) => {
    const cleaned = cleanRows(rows);
    if (opts.formato === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(cleaned);
      XLSX.utils.book_append_sheet(wb, ws, sheetName(name));
    } else if (zip) {
      zip.file(`${name}.csv`, toCsv(cleaned));
    }
  };

  for (const modulo of opts.modulos) {
    switch (modulo) {
      case "cashflow": {
        const [fv, fc] = await Promise.all([
          sb.from("fema_facturas_venta").select("mes,total").eq("user_id", userId).eq("anio", opts.anio ?? new Date().getFullYear()),
          sb.from("fema_facturas_compra").select("mes,total").eq("user_id", userId).eq("anio", opts.anio ?? new Date().getFullYear()),
        ]);
        const cashflow = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const ing = (fv.data ?? []).filter((r: any) => r.mes === m).reduce((a: number, x: any) => a + Number(x.total), 0);
          const eg = (fc.data ?? []).filter((r: any) => r.mes === m).reduce((a: number, x: any) => a + Number(x.total), 0);
          return { mes: m, ingresos: ing, egresos: eg, diferencia: ing - eg };
        });
        add("Cash Flow", cashflow);
        break;
      }
      case "facturas_venta": {
        const rows = await fetchRows("fema_facturas_venta", opts, "*");
        add("Facturas Venta", rows);
        break;
      }
      case "facturas_compra": {
        const rows = await fetchRows("fema_facturas_compra", opts, "*");
        add("Facturas Compra", rows);
        break;
      }
      case "medios_pago": {
        const rows = await fetchRows("fema_movimientos_pago", opts, "*", "fecha_emision");
        add("Medios de Pago", rows);
        break;
      }
      case "clientes": {
        const { data, error } = await sb.from("fema_clientes").select("*").order("nombre");
        if (error) throw error;
        add("Clientes", data ?? []);
        break;
      }
      case "proveedores": {
        const { data, error } = await sb.from("fema_proveedores").select("*").order("nombre");
        if (error) throw error;
        add("Proveedores", data ?? []);
        break;
      }
      case "combustible": {
        const rows = await fetchRows("fema_combustible", opts, "*");
        add("Combustible", rows);
        break;
      }
      case "empleados": {
        const { data, error } = await sb.from("fema_empleados").select("*").order("nombre");
        if (error) throw error;
        add("Empleados", data ?? []);
        break;
      }
      case "sueldos": {
        const rows = await fetchRows("fema_sueldos", opts, "*", "periodo");
        add("Sueldos", rows);
        break;
      }
      case "impuestos": {
        const rows = await fetchRows("fema_impuestos", opts, "*");
        add("Impuestos", rows);
        break;
      }
      case "cuentas_bancarias": {
        const { data, error } = await sb.from("fema_cuentas_bancarias").select("*").order("banco");
        if (error) throw error;
        add("Cuentas Bancarias", data ?? []);
        break;
      }
      case "creditos": {
        const { data, error } = await sb.from("fema_creditos").select("*,fema_creditos_cuotas(*)").order("created_at", { ascending: false });
        if (error) throw error;
        add("Creditos", data ?? []);
        break;
      }
      case "gastos_fijos": {
        const rows = await fetchRows("fema_gastos_fijos", opts, "*", "mes_inicio");
        add("Gastos Fijos", rows);
        break;
      }
    }
  }

  const dateSuffix = new Date().toISOString().split("T")[0];
  if (opts.formato === "xlsx") {
    const fname = `FEMA_export_${dateSuffix}.xlsx`;
    XLSX.writeFile(wb, fname);
  } else if (zip) {
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `FEMA_export_${dateSuffix}.zip`);
  }
}

export async function exportarExcelCompleto(anio: number, userId: string) {
  await exportarSeleccion(userId, {
    anio,
    modulos: [
      "cashflow",
      "facturas_venta",
      "facturas_compra",
      "medios_pago",
      "clientes",
      "proveedores",
      "combustible",
      "empleados",
      "sueldos",
      "impuestos",
      "cuentas_bancarias",
    ],
    formato: "xlsx",
  });
}
