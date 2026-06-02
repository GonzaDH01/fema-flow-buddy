import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES_LARGOS } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/cashflow")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["cashflow", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const [v, c] = await Promise.all([
        supabase.from("fema_facturas_venta").select("mes,total").eq("user_id", user!.id).eq("anio", year),
        supabase.from("fema_facturas_compra").select("mes,total").eq("user_id", user!.id).eq("anio", year),
      ]);
      let acc = 0;
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const ing = (v.data ?? []).filter((r) => r.mes === m).reduce((a, x) => a + Number(x.total), 0);
        const eg = (c.data ?? []).filter((r) => r.mes === m).reduce((a, x) => a + Number(x.total), 0);
        const dif = ing - eg;
        acc += dif;
        return { mes: m, ingresos: ing, egresos: eg, diferencia: dif, acumulado: acc };
      });
    },
  });

  const totIng = data?.reduce((a, x) => a + x.ingresos, 0) ?? 0;
  const totEg = data?.reduce((a, x) => a + x.egresos, 0) ?? 0;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">Cash Flow {year}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Detalle mensual de ingresos y egresos.</p>
      </header>
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead className="text-right">Egresos</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              : data?.map((r) => (
                <TableRow key={r.mes} className={r.diferencia < 0 ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{MESES_LARGOS[r.mes - 1]}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.ingresos)}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.egresos)}</TableCell>
                  <TableCell className={`text-right font-medium ${r.diferencia >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatPesos(r.diferencia)}
                  </TableCell>
                  <TableCell className={`text-right ${r.acumulado >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatPesos(r.acumulado)}
                  </TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-muted/30 font-bold">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{formatPesos(totIng)}</TableCell>
              <TableCell className="text-right">{formatPesos(totEg)}</TableCell>
              <TableCell className={`text-right ${totIng - totEg >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatPesos(totIng - totEg)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}