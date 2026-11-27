import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const CODIGOS_ASISTENCIA = {
  P: "Presente", M: "Media jornada", AJ: "Ausencia justificada", AI: "Ausencia injustificada",
  EN: "Enfermedad", VA: "Vacaciones", FE: "Feriado", LL: "Lluvia",
} as const;
export type CodigoAsistencia = keyof typeof CODIGOS_ASISTENCIA;
/** Días pagos que vale cada código. */
export const PAGA_CODIGO: Record<CodigoAsistencia, number> = { P: 1, M: 0.5, AJ: 0, AI: 0, EN: 0, VA: 1, FE: 1, LL: 0 };
/** Códigos que el Liquidador toma como falta (día no pago). */
export const ES_FALTA = (c: string) => c in PAGA_CODIGO && PAGA_CODIGO[c as CodigoAsistencia] === 0;

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const COLOR: Record<string, string> = {
  P: "bg-green-100", M: "bg-lime-100", VA: "bg-sky-100", FE: "bg-sky-100",
  AJ: "bg-amber-100", EN: "bg-amber-100", LL: "bg-slate-200", AI: "bg-red-100",
};

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lunesDe(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

type Asistencia = { id: string; empleado_id: string; fecha: string; codigo: string };

export function ParteDiarioTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const semana = useMemo(() => DIAS.map((_, i) => {
    const d = new Date(lunes); d.setDate(d.getDate() + i); return isoLocal(d);
  }), [lunes]);

  const { data: empleados = [] } = useQuery({
    queryKey: ["fema_empleados_parte"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_empleados").select("id,nombre,activo").order("nombre");
      if (error) throw error;
      return (data ?? []).filter((e) => e.activo !== false);
    },
  });

  const key = ["fema_asistencias", semana[0], semana[5]];
  const { data: asist = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_asistencias")
        .select("id,empleado_id,fecha,codigo").gte("fecha", semana[0]).lte("fecha", semana[5]);
      if (error) throw error;
      return (data ?? []) as Asistencia[];
    },
  });
  const mapa = useMemo(() => new Map(asist.map((a) => [`${a.empleado_id}|${a.fecha}`, a])), [asist]);

  const guardar = async (empleadoId: string, fecha: string, codigo: string) => {
    const prev = mapa.get(`${empleadoId}|${fecha}`);
    const { error } = codigo === ""
      ? (prev ? await supabase.from("fema_asistencias").delete().eq("id", prev.id) : { error: null })
      : await supabase.from("fema_asistencias").upsert(
          { user_id: user!.id, empleado_id: empleadoId, fecha, codigo },
          { onConflict: "empleado_id,fecha" },
        );
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_asistencias"] });
  };

  const mover = (dias: number) => { const d = new Date(lunes); d.setDate(d.getDate() + dias); setLunes(d); };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Parte diario — semana del {formatFecha(semana[0])} al {formatFecha(semana[5])}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mover(-7)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setLunes(lunesDe(new Date()))}>Esta semana</Button>
          <Button variant="outline" size="sm" onClick={() => mover(7)}>Siguiente<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Se guarda al elegir cada código. El Liquidador toma como falta los días marcados AJ, AI, EN o LL.</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Empleado</TableHead>
              {semana.map((f, i) => <TableHead key={f} className="text-center">{DIAS[i]} {f.slice(8, 10)}/{f.slice(5, 7)}</TableHead>)}
              <TableHead className="text-right">Días pagos</TableHead>
              <TableHead className="text-right">Ausencias</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {empleados.map((e) => {
                const cods = semana.map((f) => mapa.get(`${e.id}|${f}`)?.codigo ?? "");
                const pagos = cods.reduce((t, c) => t + (PAGA_CODIGO[c as CodigoAsistencia] ?? 0), 0);
                const aus = cods.filter((c) => c === "AJ" || c === "AI" || c === "EN").length;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium whitespace-nowrap">{e.nombre}</TableCell>
                    {semana.map((f, i) => (
                      <TableCell key={f} className="p-1 text-center">
                        <select
                          aria-label={`${e.nombre} ${formatFecha(f)}`}
                          className={`h-9 rounded-md border px-1 text-sm ${COLOR[cods[i]] ?? "bg-background"}`}
                          value={cods[i]}
                          onChange={(ev) => guardar(e.id, f, ev.target.value)}
                        >
                          <option value="">—</option>
                          {Object.keys(CODIGOS_ASISTENCIA).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{pagos}</TableCell>
                    <TableCell className="text-right tabular-nums">{aus}</TableCell>
                  </TableRow>
                );
              })}
              {empleados.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin empleados activos</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {Object.entries(CODIGOS_ASISTENCIA).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </p>
      </CardContent>
    </Card>
  );
}
