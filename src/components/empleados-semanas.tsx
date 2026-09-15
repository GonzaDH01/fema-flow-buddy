import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExtraDialog } from "@/components/empleados-extra";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
/** Jornada estándar: el registro solo marca presente / ausente. */
const JORNADA = 8;
/** Prefijo para guardar el borrador de la semana en el navegador. */
const BORRADOR_KEY = "fema_semana_draft_";

export type EmpleadoPago = {
  id: string; nombre: string; tipo_contratacion: string | null;
  frecuencia_pago?: string | null; importe_periodo?: number | null; forma_pago?: string | null;
  valor_hora: number | null; sueldo_bruto: number | null; activo: boolean | null;
};
type EmpleadoMin = EmpleadoPago;

/** Días laborables que cubre el importe acordado según cada cuánto cobra el empleado. */
export function DIAS_BASE(frecuencia?: string | null) {
  const f = (frecuencia ?? "Mensual").toLowerCase();
  if (f.startsWith("semanal")) return 6;
  if (f.startsWith("quincenal")) return 13;
  if (f.startsWith("por jornal") || f.startsWith("jornal")) return 1;
  return 26; // mensual y otras
}

/** Importe a cobrar por los días (u horas) trabajados de un período. */
export function importePorDias(e: EmpleadoPago, dias: number, horas: number) {
  const frec = (e.frecuencia_pago ?? "").toLowerCase();
  if (frec.startsWith("por hora")) return horas * Number(e.valor_hora ?? 0);
  const importe = Number(e.importe_periodo ?? 0) || Number(e.sueldo_bruto ?? 0);
  if (!importe) return horas * Number(e.valor_hora ?? 0);
  return (importe / DIAS_BASE(e.frecuencia_pago)) * dias;
}

/** Modalidad con la que se registra el pago generado. */
export function modalidadDe(e: EmpleadoPago, tramo: string) {
  if (tramo === "q1" || tramo === "q2") return "quincenal";
  const f = (e.frecuencia_pago ?? "").toLowerCase();
  if (f.startsWith("semanal")) return "semanal";
  if (f.startsWith("quincenal")) return "quincenal";
  return "mensual";
}

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

/** Registro semanal simple: solo se marca si el empleado trabajó cada día. */
export function SemanasTrabajadasTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [semana, setSemana] = useState(() => lunesDe(iso(new Date())));
  const [draft, setDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [guardando, setGuardando] = useState(false);

  // Los tildes sin guardar sobreviven al cambio de solapa o de pantalla.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BORRADOR_KEY + semana);
      setDraft(raw ? JSON.parse(raw) : {});
    } catch {
      setDraft({});
    }
  }, [semana]);

  useEffect(() => {
    try {
      if (Object.keys(draft).length > 0) localStorage.setItem(BORRADOR_KEY + semana, JSON.stringify(draft));
      else localStorage.removeItem(BORRADOR_KEY + semana);
    } catch { /* almacenamiento no disponible */ }
  }, [draft, semana]);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(semana, i)), [semana]);
  const finSemana = dias[6];

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_semanas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,frecuencia_pago,importe_periodo,forma_pago,valor_hora,sueldo_bruto,activo")
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

  const diasDe = (empId: string) => dias.filter((f) => marcado(empId, f)).length;
  const totalDias = activos.reduce((a, e) => a + diasDe(e.id), 0);
  const hayCambios = Object.keys(draft).length > 0;

  const guardar = async () => {
    if (!hayCambios) return toast.info("No hay cambios para guardar");
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
              horas: JORNADA,
              referencia: `Semana ${formatFecha(semana)}`,
              tarea: "Jornada trabajada",
              mes: d.getMonth() + 1,
              anio: d.getFullYear(),
            });
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
      qc.invalidateQueries({ queryKey: ["fema_horas_cupon"] });
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
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setSemana(sumarDias(semana, -7)); }}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm">
              <div className="font-medium">Semana del {formatFecha(semana)} al {formatFecha(finSemana)}</div>
              <div className="text-xs text-muted-foreground">Tildá los días que trabajó cada empleado</div>
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setSemana(sumarDias(semana, 7)); }}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ir a la semana de</Label>
              <Input type="date" className="h-9 w-40" value={semana} onChange={(e) => { setSemana(lunesDe(e.target.value)); }} />
            </div>
            <ExtraDialog
              empleados={activos.map((e) => ({ id: e.id, nombre: e.nombre }))}
              fecha={finSemana}
              trigger={<span>+ Pago extra</span>}
            />
            <Button onClick={guardar} disabled={guardando || !hayCambios}>
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
                  <TableHead key={f} className="w-14 min-w-14 text-center align-middle">
                    <div className="leading-tight">{DIAS[i]}</div>
                    <div className="text-[10px] font-normal leading-tight text-muted-foreground">{formatFecha(f).slice(0, 5)}</div>
                  </TableHead>
                ))}
                <TableHead className="text-center">Semana completa</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-center">Extra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activos.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sin empleados activos</TableCell></TableRow>
              )}
              {activos.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.nombre}
                    <div className="text-xs text-muted-foreground">{e.frecuencia_pago ?? "Mensual"}</div>
                  </TableCell>
                  {dias.map((f) => (
                    <TableCell key={f} className="w-14 min-w-14 text-center align-middle">
                      <div className="flex justify-center">
                        <Checkbox checked={marcado(e.id, f)} onCheckedChange={(v) => toggle(e.id, f, Boolean(v))} />
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => marcarSemana(e.id, true)}>Trabajó</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => marcarSemana(e.id, false)}>Ninguno</Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{diasDe(e.id)}</TableCell>
                  <TableCell className="text-center">
                    <ExtraDialog
                      empleados={activos.map((x) => ({ id: x.id, nombre: x.nombre }))}
                      empleadoId={e.id}
                      fecha={finSemana}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {activos.length > 0 && (
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={9} className="font-medium">Total de jornadas de la semana</TableCell>
                  <TableCell className="text-right font-mono">{totalDias}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Acá solo se marcan las jornadas. Los importes se calculan después, en Cupones de pago, según lo acordado con cada
        empleado. Los pagos extra quedan pendientes y se suman al cupón del período.
      </p>
    </div>
  );
}
