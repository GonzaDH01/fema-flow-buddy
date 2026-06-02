import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export async function exportarExcelCompleto(anio: number, userId: string) {
  const [fv, fc, comb, emp, sue, imp] = await Promise.all([
    supabase.from("fema_facturas_venta").select("*").eq("user_id", userId).eq("anio", anio).order("fecha"),
    supabase.from("fema_facturas_compra").select("*").eq("user_id", userId).eq("anio", anio).order("fecha"),
    supabase.from("fema_combustible").select("*").eq("user_id", userId).eq("anio", anio).order("fecha"),
    supabase.from("fema_empleados").select("*").eq("user_id", userId).order("nombre"),
    supabase.from("fema_sueldos").select("*").eq("user_id", userId).order("periodo"),
    supabase.from("fema_impuestos").select("*").eq("user_id", userId).eq("anio", anio).order("mes"),
  ]);

  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: any[] | null | undefined) => {
    const ws = XLSX.utils.json_to_sheet(rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // Cash flow mensual
  const cashflow = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const ing = (fv.data ?? []).filter((r: any) => r.mes === m).reduce((a, x: any) => a + Number(x.total), 0);
    const eg = (fc.data ?? []).filter((r: any) => r.mes === m).reduce((a, x: any) => a + Number(x.total), 0);
    return { mes: m, ingresos: ing, egresos: eg, diferencia: ing - eg };
  });
  add("Cash Flow", cashflow);
  add("Facturas Venta", fv.data ?? []);
  add("Facturas Compra", fc.data ?? []);
  add("Combustible", comb.data ?? []);
  add("Empleados", emp.data ?? []);
  add("Sueldos", sue.data ?? []);
  add("Impuestos", imp.data ?? []);

  const fname = `FEMA_${anio}_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fname);
}