import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Clock, FileText, Landmark } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/")({ component: Dashboard });

type FV = { mes: number; total: number; estado: string; fecha: string; numero: string | null; cliente: { nombre: string } | null };
type FC = { mes: number; total: number; estado: string; fecha: string; numero: string | null; proveedor: { nombre: string } | null };
type SU = { sueldo_bruto: number | null; cargas_sociales: number | null };
type IM = { iva_debito: number | null; iva_credito: number | null; ingresos_brutos: number | null; ganancias_estimadas: number | null };

async function loadKPIs(userId: string, anio: number) {
  const [ventas, compras, sueldos, impuestos] = await Promise.all([
    supabase.from("fema_facturas_venta")
      .select("mes,total,estado,fecha,numero,cliente:fema_clientes(nombre)")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_facturas_compra")
      .select("mes,total,estado,fecha,numero,proveedor:fema_proveedores(nombre)")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_sueldos")
      .select("sueldo_bruto,cargas_sociales,periodo")
      .eq("user_id", userId).like("periodo", `${anio}-%`),
    supabase.from("fema_impuestos")
      .select("iva_debito,iva_credito,ingresos_brutos,ganancias_estimadas")
      .eq("user_id", userId).eq("anio", anio),
  ]);
  if (ventas.error) throw ventas.error;
  if (compras.error) throw compras.error;
  if (sueldos.error) throw sueldos.error;
  if (impuestos.error) throw impuestos.error;
  const vs = (ventas.data ?? []) as unknown as FV[];
  const cs = (compras.data ?? []) as unknown as FC[];
  const su = (sueldos.data ?? []) as SU[];
  const im = (impuestos.data ?? []) as IM[];

  const ventasCobradas = vs.filter((x) => x.estado === "cobrada");
  const ventasPendientes = vs.filter((x) => x.estado === "pendiente");
  const comprasPagadas = cs.filter((x) => x.estado === "pagada");
  const comprasPendientes = cs.filter((x) => x.estado === "pendiente");

  const ingresosCobrados = ventasCobradas.reduce((a, x) => a + Number(x.total), 0);
  const porCobrar = ventasPendientes.reduce((a, x) => a + Number(x.total), 0);
  const totalSueldos = su.reduce((a, x) => a + Number(x.sueldo_bruto ?? 0) + Number(x.cargas_sociales ?? 0), 0);
  const totalImpuestos = im.reduce(
    (a, x) => a + Number(x.ingresos_brutos ?? 0) + Number(x.ganancias_estimadas ?? 0) +
      Math.max(0, Number(x.iva_debito ?? 0) - Number(x.iva_credito ?? 0)),
    0,
  );
  const egresosPagados = comprasPagadas.reduce((a, x) => a + Number(x.total), 0) + totalSueldos + totalImpuestos;
  const deudasPendientes = comprasPendientes.reduce((a, x) => a + Number(x.total), 0);
  const neto = ingresosCobrados - egresosPagados;

  const mensual = Array.from({ length: 12 }, (_, i) => ({
    mes: MESES[i],
    "Ingresos cobrados": ventasCobradas.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.total), 0),
    "Egresos pagados": comprasPagadas.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.total), 0),
  }));

  const pendCobro = [...ventasPendientes].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6);
  const pendPago = [...comprasPendientes].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6);

  return {
    ingresosCobrados, porCobrar, egresosPagados, deudasPendientes, neto,
    countCobradas: ventasCobradas.length, countPendVenta: ventasPendientes.length,
    mensual, pendCobro, pendPago,
  };
}

function Dashboard() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id, year],
    enabled: !!user,
    queryFn: () => loadKPIs(user!.id, year),
  });

  const neto = data?.neto ?? 0;
  const kpis = [
    { label: "Ingresos cobrados", value: data?.ingresosCobrados ?? 0, sub: `${data?.countCobradas ?? 0} facturas`, icon: TrendingUp, color: "text-primary" },
    { label: "Por cobrar", value: data?.porCobrar ?? 0, sub: `${data?.countPendVenta ?? 0} pendientes`, icon: Clock, color: "text-accent" },
    { label: "Echeqs en cartera", value: 0, sub: "próximamente", icon: FileText, color: "text-muted-foreground" },
    { label: "Egresos pagados", value: data?.egresosPagados ?? 0, sub: "compras + sueldos + imp.", icon: TrendingDown, color: "text-destructive" },
    { label: "Neto del año", value: neto, sub: "cobrado − pagado", icon: Wallet, color: neto >= 0 ? "text-primary" : "text-destructive" },
    { label: "Deudas pendientes", value: data?.deudasPendientes ?? 0, sub: "proveedores", icon: Landmark, color: "text-destructive" },
  ];

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Resumen {year}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Indicadores y flujo mensual.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>{k.label}</span>
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <div className={`mt-2 text-xl font-bold ${k.color}`}>
              {isLoading ? "—" : formatPesos(k.value)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h3 className="mb-4 text-sm font-semibold">Ingresos vs Egresos — {year}</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.mensual ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12}
                tickFormatter={(v) => new Intl.NumberFormat("es-AR", { notation: "compact" }).format(v)} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v: any) => formatPesos(Number(v))}
              />
              <Legend />
              <Bar dataKey="Ingresos cobrados" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Egresos pagados" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <h3 className="mb-3 text-sm font-semibold">Facturas pendientes de cobro</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.pendCobro?.length ? (
                <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Sin pendientes.</TableCell></TableRow>
              ) : data.pendCobro.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.cliente?.nombre ?? "—"}</TableCell>
                  <TableCell>{p.fecha}</TableCell>
                  <TableCell className="text-right font-medium text-primary">{formatPesos(Number(p.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <h3 className="mb-3 text-sm font-semibold">Pagos pendientes a proveedores</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.pendPago?.length ? (
                <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Sin pendientes.</TableCell></TableRow>
              ) : data.pendPago.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.proveedor?.nombre ?? "—"}</TableCell>
                  <TableCell>{p.fecha}</TableCell>
                  <TableCell className="text-right font-medium text-destructive">{formatPesos(Number(p.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}