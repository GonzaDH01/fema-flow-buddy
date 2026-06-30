import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES } from "@/lib/format";

export const Route = createFileRoute("/app/cashflow")({ component: Page });

type Row = {
  label: string;
  sub?: string;
  badge?: string;
  values: number[];
  sign: "+" | "-";
  tooltips?: (string | undefined)[];
};

const empty12 = () => Array(12).fill(0) as number[];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function placeAt(mes: number, total: number) {
  const v = empty12();
  if (mes >= 1 && mes <= 12) v[mes - 1] = total;
  return v;
}

async function loadCashflow(userId: string, anio: number) {
  const [ventas, compras, sueldos, impuestos, combustible, movs, estimaciones] = await Promise.all([
    supabase.from("fema_facturas_venta")
      .select("id,mes,total,estado,numero,condicion_pago,cliente:fema_clientes(nombre)")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_facturas_compra")
      .select("id,mes,total,estado,numero,categoria,proveedor:fema_proveedores(nombre)")
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
    supabase.from("fema_movimientos_pago")
      .select("instrumento,direccion,estado,monto,vencimiento,fecha_emision,mes,anio,factura_venta_id,factura_compra_id,contraparte,numero,banco")
      .eq("user_id", userId),
    supabase.from("fema_estimaciones")
      .select("fecha_estimada,monto,descripcion,estado,cliente:fema_clientes(nombre)")
      .gte("fecha_estimada", `${anio}-01-01`).lte("fecha_estimada", `${anio}-12-31`),
  ]);

  const ACTIVOS = new Set(["en_cartera", "cobrado", "pagado", "cedido"]);
  const movsByFV = new Map<string, any[]>();
  const movsByFC = new Map<string, any[]>();
  for (const m of (movs.data ?? []) as any[]) {
    if (!ACTIVOS.has(m.estado)) continue;
    if (m.direccion === "cobro" && m.factura_venta_id) {
      if (!movsByFV.has(m.factura_venta_id)) movsByFV.set(m.factura_venta_id, []);
      movsByFV.get(m.factura_venta_id)!.push(m);
    }
    if (m.direccion === "pago" && m.factura_compra_id) {
      if (!movsByFC.has(m.factura_compra_id)) movsByFC.set(m.factura_compra_id, []);
      movsByFC.get(m.factura_compra_id)!.push(m);
    }
  }

  function mesDe(m: any): number {
    const fecha = m.vencimiento ?? m.fecha_emision;
    if (fecha) {
      const [y, mo] = String(fecha).split("-").map(Number);
      if (y === anio && mo >= 1 && mo <= 12) return mo;
      if (y !== anio) return 0; // fuera del año en vista
    }
    return Number(m.mes) || 0;
  }
  function instrLabel(ins: string) {
    return ins === "echeq" ? "Echeq propio" : ins === "cheque_fisico" ? "Cheque físico" : ins === "cesion" ? "Echeq cedido" : ins === "transferencia" ? "Transferencia" : ins;
  }
  function distribuirMovs(linked: any[], total: number, facturaMes: number) {
    const values = empty12();
    const tooltips: string[][] = Array.from({ length: 12 }, () => []);
    let cubierto = 0;
    const detalle: string[] = [];
    for (const m of linked) {
      const mes = mesDe(m);
      const monto = Number(m.monto);
      cubierto += monto;
      const extra = [m.numero ? `Nº ${m.numero}` : null, m.banco].filter(Boolean).join(" · ");
      const tipMes = `${instrLabel(m.instrumento)}${extra ? ` (${extra})` : ""}: ${formatPesos(monto)}`;
      if (mes >= 1 && mes <= 12) {
        values[mes - 1] += monto;
        tooltips[mes - 1].push(tipMes);
        detalle.push(`${instrLabel(m.instrumento)} ${MESES[mes - 1]} ${formatPesos(monto)}`);
      } else {
        detalle.push(`${instrLabel(m.instrumento)} fuera de ${anio} ${formatPesos(monto)}`);
      }
    }
    const resto = Math.max(0, total - cubierto);
    if (resto > 0.01 && facturaMes >= 1 && facturaMes <= 12) {
      values[facturaMes - 1] += resto;
      tooltips[facturaMes - 1].push(`Saldo pendiente: ${formatPesos(resto)}`);
      detalle.push(`saldo ${MESES[facturaMes - 1]} ${formatPesos(resto)}`);
    }
    return {
      values,
      cubierto,
      detalle,
      tooltips: tooltips.map((arr) => (arr.length ? arr.join("\n") : undefined)),
    };
  }

  function planBadge(linked: any[], condicionPago: string | null, total: number) {
    if (linked.length === 0) {
      const c = (condicionPago ?? "").toLowerCase();
      if (c.includes("contado")) return "Contado";
      if (c) return condicionPago!;
      return null;
    }
    const cubierto = linked.reduce((a, m) => a + Number(m.monto), 0);
    const completo = cubierto >= total - 0.01;
    if (linked.length === 1) {
      return `${completo ? "Pago único" : "Pago parcial"} · ${instrLabel(linked[0].instrumento)}`;
    }
    const tipos = Array.from(new Set(linked.map((m) => instrLabel(m.instrumento))));
    return `Plan ${linked.length} cuotas · ${tipos.join(" + ")}`;
  }

  const ingCobrados: Row[] = [];
  const ingPendientes: Row[] = [];
  const ingEstimados: Row[] = [];
  // Agrupar estimaciones por cliente (+ descripción) en una sola línea con cuotas por mes
  const estimGroups = new Map<string, { label: string; sub?: string; values: number[]; tooltips: string[][] }>();
  for (const e of (estimaciones.data ?? []) as any[]) {
    if (e.estado === "cobrado") continue;
    const mes = Number((e.fecha_estimada ?? "").slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const label = e.cliente?.nombre ?? "Estimación";
    const desc = (e.descripcion ?? "").replace(/\s*-\s*Cuota\s*\d+\/\d+\s*$/i, "").trim();
    const key = `${label}||${desc}`;
    let g = estimGroups.get(key);
    if (!g) {
      g = { label, sub: desc || undefined, values: empty12(), tooltips: Array.from({ length: 12 }, () => []) };
      estimGroups.set(key, g);
    }
    const monto = Number(e.monto);
    g.values[mes - 1] += monto;
    g.tooltips[mes - 1].push(`${e.descripcion ?? "Cuota"}: ${formatPesos(monto)}`);
  }
  for (const g of estimGroups.values()) {
    ingEstimados.push({
      label: g.label,
      sub: g.sub,
      badge: "Estimado",
      values: g.values,
      tooltips: g.tooltips.map((t) => (t.length ? t.join("\n") : undefined)),
      sign: "+",
    });
  }
  for (const v of (ventas.data ?? []) as any[]) {
    const linked = movsByFV.get(v.id) ?? [];
    const total = Number(v.total);
    const facturaMes = Number(v.mes);
    let values: number[];
    let sub: string;
    let tooltips: (string | undefined)[] | undefined;
    let cobrada: boolean;
    if (linked.length > 0) {
      const d = distribuirMovs(linked, total, facturaMes);
      values = d.values;
      tooltips = d.tooltips;
      // El plan de cuotas registrado en la factura no implica cobro:
      // sólo se considera cobrada cuando Medios de Pago confirma el cobro.
      cobrada = v.estado === "cobrada";
      sub = `Factura ${v.numero ?? "—"}`;
    } else {
      values = placeAt(facturaMes, total);
      cobrada = v.estado === "cobrada";
      sub = `Factura ${v.numero ?? "—"}`;
    }
    const r: Row = {
      label: v.cliente?.nombre ?? "Sin cliente",
      sub,
      badge: planBadge(linked, v.condicion_pago, total) ?? undefined,
      values,
      tooltips,
      sign: "+",
    };
    (cobrada ? ingCobrados : ingPendientes).push(r);
  }

  const egPagados: Row[] = [];
  const egPendientes: Row[] = [];
  for (const c of (compras.data ?? []) as any[]) {
    const linked = movsByFC.get(c.id) ?? [];
    const total = Number(c.total);
    const facturaMes = Number(c.mes);
    let values: number[];
    let sub: string;
    let tooltips: (string | undefined)[] | undefined;
    let pagada: boolean;
    if (linked.length > 0) {
      const d = distribuirMovs(linked, total, facturaMes);
      values = d.values;
      tooltips = d.tooltips;
      // Igual criterio para compras: sólo el módulo de Pagos marca pagada.
      pagada = c.estado === "pagada";
      sub = `Comprobante ${c.numero ?? "—"}`;
    } else {
      values = placeAt(facturaMes, total);
      pagada = c.estado === "pagada";
      sub = c.numero ? `Comprobante ${c.numero}` : undefined as any;
    }
    const r: Row = {
      label: `${c.proveedor?.nombre ?? "Sin proveedor"}${c.categoria ? " · " + c.categoria : ""}`,
      sub,
      badge: planBadge(linked, null, total) ?? undefined,
      values,
      tooltips,
      sign: "-",
    };
    (pagada ? egPagados : egPendientes).push(r);
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

  const totalIng = empty12().map((_, i) => sum([...ingCobrados, ...ingPendientes, ...ingEstimados].map((r) => r.values[i])));
  const totalEg = empty12().map((_, i) => sum([...egPagados, ...egPendientes].map((r) => r.values[i])));
  const neto = totalIng.map((v, i) => v - totalEg[i]);
  const acumulado: number[] = [];
  neto.reduce((acc, v) => { const next = acc + v; acumulado.push(next); return next; }, 0);

  return { ingCobrados, ingPendientes, ingEstimados, egPagados, egPendientes, totalIng, totalEg, neto, acumulado };
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
    <div className="p-4 md:p-6">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">Cash Flow General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen mensual generado automáticamente desde todos los módulos · {year}
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <table className="w-full min-w-[1200px] border-collapse text-xs [&_td]:border-r [&_td]:border-border/40 [&_th]:border-r [&_th]:border-border/60 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_tbody_tr:not(.no-stripe)_td:nth-child(2n+3)]:bg-muted/10">
          <colgroup>
            <col style={{ width: "220px" }} />
            {MESES.map((m) => <col key={m} style={{ width: "78px" }} />)}
            <col style={{ width: "100px" }} />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="border-b-2 border-border bg-muted/70 text-[10px] uppercase tracking-wide text-foreground">
              <th className="sticky left-0 z-30 bg-muted/70 px-3 py-2 text-left">Concepto</th>
              {MESES.map((m, i) => (
                <th
                  key={m}
                  className={`px-2 py-2 text-right font-semibold ${i % 2 === 1 ? "bg-muted/40" : ""}`}
                >
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-bold">Total</th>
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

                <SectionHeader title="INGRESOS PENDIENTES DE COBRO (facturados)" />
                {data.ingPendientes.map((r, i) => <DataRow key={`ip-${i}`} row={r} />)}
                {data.ingPendientes.length === 0 && <EmptyRow />}

                <SectionHeader title="INGRESOS ESTIMADOS (proyección)" />
                {data.ingEstimados.map((r, i) => <DataRow key={`ie-${i}`} row={r} />)}
                {data.ingEstimados.length === 0 && <EmptyRow />}

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
        {row.badge && (
          <div className="mt-0.5">
            <span className="inline-block rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              {row.badge}
            </span>
          </div>
        )}
        {row.sub && <div className="text-[10px] text-muted-foreground">{row.sub}</div>}
      </td>
      {row.values.map((v, i) => {
        const tip = row.tooltips?.[i];
        return (
          <td
            key={i}
            title={tip}
            className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "" : color} ${tip ? "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}
          >
            {cell(v)}
          </td>
        );
      })}
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