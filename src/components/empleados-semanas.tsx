import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type EmpleadoMin = {
  id: string; nombre: string; tipo_contratacion: string | null;
  valor_hora: number | null; sueldo_bruto: number | null; activo: boolean | null;
};
type HoraRow = {
  id: string; empleado_id: string | null; fecha: string; horas: number;
  referencia: string | null; tarea: string | null;
};

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function lunesDe(fechaIso: string) {
  const d = new Date(fechaIso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return iso(d);
}
function sumarDias(fechaIso: string, n: number) {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** Registro semanal de asistencia: se marca si el empleado trabajó cada día y se calcula el sueldo. */
export function SemanasTrabajadasTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [semana, setSemana] = useState(() => lunesDe(iso(new Date())));
  const [jornada, setJornada] = useState("8");
  const [draft, setDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [guardando, setGuardando] = useState(false);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(semana, i)), [semana]);
  const finSemana = dias[6];

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_semanas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,valor_hora,sueldo_bruto,activo")
        .order("nombre");
      return (data ?? []) as EmpleadoMin[];
    },
  });

  const { data: registros } = useQuery({
    queryKey: ["fema_horas_semana", semana],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_horas_trabajadas")
        .select("id,empleado_id,fecha,horas,referencia,tarea")
        .gte("fecha", semana)
        .lte("fecha", finSemana);
      if (error) throw error;
      return (data ?? []) as HoraRow[];
    },
  });

  const activos = (empleados ?? []).filter((e) => e.activo !== false);

  // Estado guardado en base
  const guardado = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    (registros ?? []).forEach((r) => {
      if (!r.empleado_id) return;
      map[r.empleado_id] ??= {};
      map[r.empleado_id][r.fecha] = Number(r.horas);
    });
    return map;
  }, [registros]);

  const marcado = (empId: string, fecha: string) =>
    draft[empId]?.[fecha] ?? (guardado[empId]?.[fecha] ?? 0) > 0;

  const toggle = (empId: string, fecha: string, val: boolean) =>
    setDraft((s) => ({ ...s, [empId]: { ...(s[empId] ?? {}), [fecha]: val } }));

  const marcarSemana = (empId: string, val: boolean) =>
    setDraft((s) => ({
      ...s,
      [empId]: Object.fromEntries(dias.slice(0, val ? 6 : 7).map((f) => [f, val])),
    }));

  const horasJornada = Number(jornada || 0);

  const calcular = (e: EmpleadoMin) => {
    const diasTrabajados = dias.filter((f) => marcado(e.id, f)).length;
    const horas = dias.reduce((a, f) => {
      if (!marcado(e.id, f)) return a;
      const h = draft[e.id]?.[f] !== undefined ? horasJornada : (guardado[e.id]?.[f] || horasJornada);
      return a + h;
    }, 0);
    const esMensual = (e.tipo_contratacion ?? "").toLowerCase().startsWith("mensual");
    const importe = esMensual
      ? (Number(e.sueldo_bruto ?? 0) / 4.33) * (diasTrabajados / 6)
      : horas * Number(e.valor_hora ?? 0);
    return { diasTrabajados, horas, importe, esMensual };
  };

  const totales = activos.reduce(
    (a, e) => {
      const c = calcular(e);
      return { dias: a.dias + c.diasTrabajados, horas: a.horas + c.horas, importe: a.importe + c.importe };
    },
    { dias: 0, horas: 0, importe: 0 },
  );

  const guardar = async () => {
    if (Object.keys(draft).length === 0) return toast.info("No hay cambios para guardar");
    setGuardando(true);
    try {
      for (const [empId, cambios] of Object.entries(draft)) {
        for (const [fecha, trabajo] of Object.entries(cambios)) {
          const existente = (registros ?? []).find((r) => r.empleado_id === empId && r.fecha === fecha);
          if (trabajo && !existente) {
            const d = new Date(fecha + "T00:00:00");
            const { error } = await supabase.from("fema_horas_trabajadas").insert({
              user_id: user!.id,
              empleado_id: empId,
              fecha,
              horas: horasJornada,
              referencia: `Semana ${formatFecha(semana)}`,
              tarea: "Jornada trabajada",
              mes: d.getMonth() + 1,
              anio: d.getFullYear(),
            });
            if (error) throw error;
          } else if (trabajo && existente) {
            const { error } = await supabase
              .from("fema_horas_trabajadas").update({ horas: horasJornada }).eq("id", existente.id);
            if (error) throw error;
          } else if (!trabajo && existente) {
            const { error } = await supabase.from("fema_horas_trabajadas").delete().eq("id", existente.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Semana guardada");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["fema_horas_semana"] });
      qc.invalidateQueries({ queryKey: ["fema_horas"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la semana");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 p-4 border-b flex-wrap">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSemana(sumarDias(semana, -7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm">
              <div className="font-medium">Semana del {formatFecha(semana)} al {formatFecha(finSemana)}</div>
              <div className="text-xs text-muted-foreground">Marcá los días trabajados de cada empleado</div>
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSemana(sumarDias(semana, 7))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ir a la semana de</Label>
              <Input type="date" className="h-9 w-40" value={semana} onChange={(e) => { setSemana(lunesDe(e.target.value)); setDraft({}); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horas por jornada</Label>
              <Input type="number" step="0.5" className="h-9 w-28" value={jornada} onChange={(e) => setJornada(e.target.value)} />
            </div>
            <Button onClick={guardar} disabled={guardando}>
              <Save className="size-4 mr-1" /> Guardar semana
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-44">Empleado</TableHead>
                {dias.map((f, i) => (
                  <TableHead key={f} className="text-center">
                    <div>{DIAS[i]}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">{formatFecha(f).slice(0, 5)}</div>
                  </TableHead>
                ))}
                <TableHead className="text-center">Todos</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Sueldo estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activos.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Sin empleados activos</TableCell></TableRow>
              )}
              {activos.map((e) => {
                const c = calcular(e);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.nombre}
                      <div className="text-xs text-muted-foreground">
                        {c.esMensual
                          ? `Mensualizado · ${formatPesos(Number(e.sueldo_bruto ?? 0))}`
                          : `Por hora · ${formatPesos(Number(e.valor_hora ?? 0))}/h`}
                      </div>
                    </TableCell>
                    {dias.map((f) => (
                      <TableCell key={f} className="text-center">
                        <Checkbox checked={marcado(e.id, f)} onCheckedChange={(v) => toggle(e.id, f, Boolean(v))} />
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => marcarSemana(e.id, true)}>Sí</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => marcarSemana(e.id, false)}>No</Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.diasTrabajados}</TableCell>
                    <TableCell className="text-right font-mono">{c.horas.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatPesos(c.importe)}</TableCell>
                  </TableRow>
                );
              })}
              {activos.length > 0 && (
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={8} className="font-medium">Totales de la semana</TableCell>
                  <TableCell className="text-right font-mono">{totales.dias}</TableCell>
                  <TableCell className="text-right font-mono">{totales.horas.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(totales.importe)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        El sueldo estimado surge de las horas marcadas por el valor hora del empleado. Para los mensualizados se prorratea
        el sueldo bruto según los días trabajados de la semana. El importe definitivo se registra en la pestaña Pagos.
      </p>
    </div>
  );
}
