import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES } from "@/lib/format";

export const Route = createFileRoute("/app/cashflow")({ component: Page });

type Row = { label: string; sub?: string; values: number[]; sign: "+" | "-" };

const empty12 = () => Array(12).fill(0) as number[];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function placeAt(mes: number, total: number) {
  const v = empty12();
  if (mes >= 1 && mes <= 12) v[mes - 1] = total;
  return v;
}

async function loadCashflow(userId: string, anio: number) {
  const [ventas, compras, sueldos, impuestos, combustible] = await Promise.all([
    supabase.from("fema_facturas_venta")
      .select("mes,total,estado,numero,condicion_pago,cliente:fema_clientes(nombre)")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_facturas_compra")
      .select("mes,total,estado,numero,categoria,proveedor:fema_proveedores(nombre)")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_sueldos")
      .select("periodo,sueldo_bruto,cargas_sociales,empleado:fema_empleados(nombre)")
      .eq("user_id", userId).like("periodo", `${anio}-%`),
    supabase.from("fema_impuestos")
      .select("mes,periodo,iva_debito,iva_credito,ingresos_brutos,ganancias_estimadas")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_combustible")
      .select("fecha,total")
      .eq("user_id", userId).gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`),
  ]);

  const ingCobrados: Row[] = [];
  const ingPendientes: Row[] = [];
  for (const v of (ventas.data ?? []) as any[]) {
    const r: Row = {
      label: v.cliente?.nombre ?? "Sin cliente",
      sub: `Factura ${v.numero ?? "—"}${v.condicion_pago ? " · " + v.condicion_pago : ""}`,
      values: placeAt(Number(v.mes), Number(v.total)),
      sign: "+",
    };
    (v.estado === "cobrada" ? ingCobrados : ingPendientes).push(r);
  }

  const egPagados: Row[] = [];
  const egPendientes: Row[] = [];
  for (const c of (compras.data ?? []) as any[]) {
    const r: Row = {
      label: `${c.proveedor?.nombre ?? "Sin proveedor"}${c.categoria ? " · " + c.categoria : ""}`,
      sub: c.numero ? `Comprobante ${c.numero}` : undefined,
      values: placeAt(Number(c.mes), Number(c.total)),
      sign: "-",
    };
    (c.estado === "pagada" ? egPagados : egPendientes).push(r);
  }

  for (const s of (sueldos.data ?? []) as any[]) {
    const mes = Number((s.periodo ?? "").split("-")[1] ?? 0);
    const total = Number(s.sueldo_bruto ?? 0) + Number(s.cargas_sociales ?? 0);
    egPagados.push({
      label: `${s.empleado?.nombre ?? "Empleado"} · Sueldo`,
      values: placeAt(mes, total),
      sign: "-",
    });
  }

  for (const i of (impuestos.data ?? []) as any[]) {
    const ivaSaldo = Math.max(0, Number(i.iva_debito ?? 0) - Number(i.iva_credito ?? 0));
    const total = ivaSaldo + Number(i.ingresos_brutos ?? 0) + Number(i.ganancias_estimadas ?? 0);
    if (total === 0) continue;
    egPagados.push({
      label: `AFIP · ${i.periodo ?? ""}`,
      values: placeAt(Number(i.mes), total),
      sign: "-",
    });
  }

  // Agrupar combustible por mes
  const combPorMes = empty12();
  for (const k of (combustible.data ?? []) as any[]) {
    const mes = Number((k.fecha ?? "").slice(5, 7));
    if (mes >= 1 && mes <= 12) combPorMes[mes - 1] += Number(k.total);
  }
  if (sum(combPorMes) > 0) {
    egPagados.push({ label: "Combustible", values: combPorMes, sign: "-" });
  }

  const totalIng = empty12().map((_, i) => sum([...ingCobrados, ...ingPendientes].map((r) => r.values[i])));
  const totalEg = empty12().map((_, i) => sum([...egPagados, ...egPendientes].map((r) => r.values[i])));
  const neto = totalIng.map((v, i) => v - totalEg[i]);
  const acumulado: number[] = [];
  neto.reduce((acc, v) => { const next = acc + v; acumulado.push(next); return next; }, 0);

  return { ingCobrados, ingPendientes, egPagados, egPendientes, totalIng, totalEg, neto, acumulado };
}

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["cashflow-matrix", user?.id, year],
    enabled: !!user,
    queryFn: () => loadCashflow(user!.id, year),
  });

  return (
    <div className="p-6">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">Cash Flow General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen mensual generado automáticamente desde todos los módulos · {year}
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <table className="w-full min-w-[1100px] text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Concepto</th>
              {MESES.map((m) => <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>)}
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || !data ? (
              <tr><td colSpan={14} className="py-10 text-center text-muted-foreground">Cargando…</td></tr>
            ) : (
              <>
                <SectionHeader title="INGRESOS COBRADOS (por cliente / plan)" />
                {data.ingCobrados.map((r, i) => <DataRow key={`ic-${i}`} row={r} />)}
                {data.ingCobrados.length === 0 && <EmptyRow />}

                <SectionHeader title="INGRESOS PENDIENTES (estim.)" />
                {data.ingPendientes.map((r, i) => <DataRow key={`ip-${i}`} row={r} />)}
                {data.ingPendientes.length === 0 && <EmptyRow />}

                <TotalRow label="TOTAL INGRESOS" values={data.totalIng} positive />

                <SectionHeader title="EGRESOS PAGADOS (por proveedor / concepto)" />
                {data.egPagados.map((r, i) => <DataRow key={`ep-${i}`} row={r} />)}
                {data.egPagados.length === 0 && <EmptyRow />}

                <SectionHeader title="EGRESOS PENDIENTES (estim.)" />
                {data.egPendientes.map((r, i) => <DataRow key={`epp-${i}`} row={r} />)}
                {data.egPendientes.length === 0 && <EmptyRow />}

                <TotalRow label="TOTAL EGRESOS" values={data.totalEg} positive={false} />

                <TotalRow label="NETO (I − G)" values={data.neto} signed />
                <TotalRow label="ACUMULADO" values={data.acumulado} signed bold />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cell(n: number) {
  return n === 0 ? <span className="text-muted-foreground/50">—</span> : formatPesos(n);
}

function SectionHeader({ title }: { title: string }) {
  return (
    <tr className="border-t border-border bg-muted/40">
      <td colSpan={14} className="sticky left-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
        ▾ {title}
      </td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={14} className="px-3 py-2 text-xs italic text-muted-foreground">Sin registros.</td>
    </tr>
  );
}

function DataRow({ row }: { row: Row }) {
  const color = row.sign === "+" ? "text-primary" : "text-destructive";
  const total = sum(row.values);
  return (
    <tr className="border-t border-border/40 hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-card px-3 py-2">
        <div className="font-medium">{row.label}</div>
        {row.sub && <div className="text-[10px] text-muted-foreground">{row.sub}</div>}
      </td>
      {row.values.map((v, i) => (
        <td key={i} className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "" : color}`}>{cell(v)}</td>
      ))}
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${color}`}>{cell(total)}</td>
    </tr>
  );
}

function TotalRow({
  label, values, positive, signed, bold,
}: { label: string; values: number[]; positive?: boolean; signed?: boolean; bold?: boolean }) {
  const total = sum(values);
  const baseColor = signed
    ? ""
    : positive ? "text-primary" : "text-destructive";
  const colorFor = (n: number) => signed ? (n >= 0 ? "text-primary" : "text-destructive") : baseColor;
  return (
    <tr className={`border-t border-border bg-muted/30 ${bold ? "font-bold" : "font-semibold"}`}>
      <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "" : colorFor(v)}`}>{cell(v)}</td>
      ))}
      <td className={`px-3 py-2 text-right tabular-nums ${colorFor(total)}`}>{cell(total)}</td>
    </tr>
  );
}