import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Package, TrendingUp, Activity } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: cpCount } = useQuery({
    queryKey: ["cp-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clientes_proveedores").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });
  const { data: facturasCount } = useQuery({
    queryKey: ["facturas-count"],
    queryFn: async () => {
      const { count } = await supabase.from("facturas").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const stats = [
    { label: "Clientes / Proveedores", value: cpCount ?? "—", icon: Users, accent: "text-primary" },
    { label: "Facturas", value: facturasCount ?? "—", icon: Package, accent: "text-primary" },
    { label: "Operaciones", value: 0, icon: Activity, accent: "text-primary" },
    { label: "Crecimiento", value: "—", icon: TrendingUp, accent: "text-primary" },
  ];

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Hola, {user?.email}. Bienvenido al Sistema de Gestión FEMA.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.accent}`} />
            </div>
            <div className="mt-3 text-3xl font-bold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-sm)]">
        <h2 className="text-lg font-semibold">Empieza por aquí</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra tus primeros clientes y proveedores, luego carga facturas con IVA, retenciones y percepciones.
        </p>
      </div>
    </div>
  );
}