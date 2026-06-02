import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatFecha } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/auditoria")({ component: Page });

type Row = { id: string; tabla: string; operacion: string; registro_id: string | null; created_at: string };

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["fema_auditoria"],
    queryFn: async () => (await supabase.from("fema_auditoria").select("id,tabla,operacion,registro_id,created_at").order("created_at", { ascending: false }).limit(200)).data as Row[],
  });

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">Auditoría</h2>
        <p className="mt-1 text-sm text-muted-foreground">Últimas 200 operaciones registradas en el sistema.</p>
      </header>
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tabla</TableHead>
              <TableHead>Operación</TableHead>
              <TableHead>Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Cargando…</TableCell></TableRow>
              : !data || data.length === 0
              ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Sin actividad.</TableCell></TableRow>
              : data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatFecha(r.created_at)}</TableCell>
                  <TableCell className="font-medium">{r.tabla}</TableCell>
                  <TableCell>
                    <Badge variant={r.operacion === "DELETE" ? "destructive" : r.operacion === "INSERT" ? "default" : "secondary"}>
                      {r.operacion}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.registro_id?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}