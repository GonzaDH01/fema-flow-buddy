import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, MESES_LARGOS } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/impuestos")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const { data, isLoading } = useQuery({
    queryKey: ["impuestos", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const [v, c] = await Promise.all([
        supabase.from("fema_facturas_venta").select("mes,total,iva_21,iva_105").eq("user_id", user!.id).eq("anio", year),
        supabase.from("fema_facturas_compra").select("mes,iva_21,iva_105").eq("user_id", user!.id).eq("anio", year),
      ]);
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const ventasMes = (v.data ?? []).filter((r) => r.mes === m);
        const comprasMes = (c.data ?? []).filter((r) => r.mes === m);
        const debito = ventasMes.reduce((a, x) => a + Number(x.iva_21) + Number(x.iva_105), 0);
        const credito = comprasMes.reduce((a, x) => a + Number(x.iva_21) + Number(x.iva_105), 0);
        const totalVentas = ventasMes.reduce((a, x) => a + Number(x.total), 0);
        const iibb = totalVentas * 0.025;
        const ganancias = Math.max(0, totalVentas) * 0.35;
        return { mes: m, debito, credito, saldo: debito - credito, iibb, ganancias };
      });
    },
  });

  const tDeb = data?.reduce((a, x) => a + x.debito, 0) ?? 0;
  const tCred = data?.reduce((a, x) => a + x.credito, 0) ?? 0;
  const tSaldo = tDeb - tCred;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">Impuestos {year}</h2>
        <p className="mt-1 text-sm text-muted-foreground">IVA, IIBB y Ganancias estimadas por mes.</p>
      </header>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { l: "IVA Débito anual", v: formatPesos(tDeb) },
          { l: "IVA Crédito anual", v: formatPesos(tCred) },
          { l: "Saldo a pagar", v: formatPesos(tSaldo), color: tSaldo >= 0 ? "text-destructive" : "text-primary" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={`mt-1 text-lg font-bold ${k.color ?? ""}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">IVA Débito</TableHead>
              <TableHead className="text-right">IVA Crédito</TableHead>
              <TableHead className="text-right">Saldo IVA</TableHead>
              <TableHead className="text-right">IIBB (2,5%)</TableHead>
              <TableHead className="text-right">Ganancias (35%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              : data?.map((r) => (
                <TableRow key={r.mes}>
                  <TableCell className="font-medium">{MESES_LARGOS[r.mes - 1]}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.debito)}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.credito)}</TableCell>
                  <TableCell className={`text-right font-medium ${r.saldo >= 0 ? "text-destructive" : "text-primary"}`}>{formatPesos(r.saldo)}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.iibb)}</TableCell>
                  <TableCell className="text-right">{formatPesos(r.ganancias)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}