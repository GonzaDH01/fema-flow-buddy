import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Receipt, Wallet } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES } from "@/lib/format";

export const Route = createFileRoute("/app/")({ component: Dashboard });

type FV = { mes: number; total: number; iva_21: number; iva_105: number; estado: string; fecha: string; numero: string | null };
type FC = { mes: number; total: number; iva_21: number; iva_105: number };

async function loadKPIs(userId: string, anio: number) {
  const [ventas, compras] = await Promise.all([
    supabase.from("fema_facturas_venta")
      .select("mes,total,iva_21,iva_105,estado,fecha,numero")
      .eq("user_id", userId).eq("anio", anio),
    supabase.from("fema_facturas_compra")
      .select("mes,total,iva_21,iva_105")
      .eq("user_id", userId).eq("anio", anio),
  ]);
  if (ventas.error) throw ventas.error;
  if (compras.error) throw compras.error;
  const vs = (ventas.data ?? []) as FV[];
  const cs = (compras.data ?? []) as FC[];
  const totalVentas = vs.reduce((a, x) => a + Number(x.total), 0);
  const totalCompras = cs.reduce((a, x) => a + Number(x.total), 0);
  const ivaDebito = vs.reduce((a, x) => a + Number(x.iva_21) + Number(x.iva_105), 0);
  const ivaCredito = cs.reduce((a, x) => a + Number(x.iva_21) + Number(x.iva_105), 0);
  const mensual = Array.from({ length: 12 }, (_, i) => ({
    mes: MESES[i],
    Ingresos: vs.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.total), 0),
    Egresos: cs.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.total), 0),
  }));
  const pendientes = vs.filter((x) => x.estado === "pendiente").slice(0, 5);
  return { totalVentas, totalCompras, ivaDebito, ivaCredito, mensual, pendientes };
}

function Dashboard() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id, year],
    enabled: !!user,
    queryFn: () => loadKPIs(user!.id, year),
  });

  const saldoIva = (data?.ivaDebito ?? 0) - (data?.ivaCredito ?? 0);
  const resultadoBruto = (data?.totalVentas ?? 0) - (data?.totalCompras ?? 0);

  const kpis = [
    { label: "Total Ventas", value: data?.totalVentas ?? 0, icon: TrendingUp, color: "text-primary" },
    { label: "Total Compras", value: data?.totalCompras ?? 0, icon: TrendingDown, color: "text-destructive" },
    { label: "IVA Débito", value: data?.ivaDebito ?? 0, icon: Receipt, color: "text-accent" },
    { label: "IVA Crédito", value: data?.ivaCredito ?? 0, icon: Receipt, color: "text-accent" },
    { label: "Saldo IVA", value: saldoIva, icon: Wallet, color: saldoIva >= 0 ? "text-primary" : "text-destructive" },
    { label: "Resultado Bruto", value: resultadoBruto, icon: Wallet, color: resultadoBruto >= 0 ? "text-primary" : "text-destructive" },
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
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{k.label}</span>
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <div className={`mt-2 text-xl font-bold ${k.color}`}>
              {isLoading ? "—" : formatPesos(k.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h3 className="mb-4 text-sm font-semibold">Cash flow mensual</h3>
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
              <Bar dataKey="Ingresos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Egresos" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h3 className="mb-3 text-sm font-semibold">Últimas facturas pendientes de cobro</h3>
        {data?.pendientes && data.pendientes.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.pendientes.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{p.fecha} {p.numero ? `· ${p.numero}` : ""}</span>
                <span className="font-medium">{formatPesos(Number(p.total))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin facturas pendientes.</p>
        )}
      </div>
    </div>
  );
}