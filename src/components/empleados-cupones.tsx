import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EmpleadoPago, importePorDias, modalidadDe, DIAS_BASE } from "@/components/empleados-semanas";

type HoraRow = { empleado_id: string | null; fecha: string; horas: number };
type PagoRow = { empleado_id: string | null; periodo_desde: string | null; periodo_hasta: string | null };

function ultimoDia(anio: number, mes: number) {
  return new Date(anio, mes, 0).getDate();
}

/** Arma el cupón de pago de cada empleado con los días trabajados del período elegido. */
export function CuponesPagoTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [tramo, setTramo] = useState("mes");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [generando, setGenerando] = useState(false);

  const a = Number(anio), m = Number(mes);
  const fin = ultimoDia(a, m);
  const p = (d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const desde = tramo === "q2" ? p(16) : p(1);
  const hasta = tramo === "q1" ? p(15) : p(fin);

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_cupones"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,frecuencia_pago,importe_periodo,valor_hora,sueldo_bruto,activo,forma_pago")
        .order("nombre");
      return (data ?? []) as EmpleadoPago[];
    },
  });

  const { data: horas } = useQuery({
    queryKey: ["fema_horas_cupon", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_horas_trabajadas")
        .select("empleado_id,fecha,horas")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return (data ?? []) as HoraRow[];
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["fema_pagos_cupon", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_pagos_empleado")
        .select("empleado_id,periodo_desde,periodo_hasta")
        .eq("periodo_desde", desde)
        .eq("periodo_hasta", hasta);
      if (error) throw error;
      return (data ?? []) as PagoRow[];
    },
  });

  const yaGenerado = useMemo(
    () => new Set((pagos ?? []).map((x) => x.empleado_id ?? "")),
    [pagos],
  );

  const filas = useMemo(() => {
    const activos = (empleados ?? []).filter((e) => e.activo !== false);
    return activos.map((e) => {
      const regs = (horas ?? []).filter((h) => h.empleado_id === e.id);
      const dias = new Set(regs.map((h) => h.fecha)).size;
      const hs = regs.reduce((s, h) => s + Number(h.horas || 0), 0);
      return { emp: e, dias, horas: hs, importe: importePorDias(e, dias, hs), generado: yaGenerado.has(e.id) };
    });
  }, [empleados, horas, yaGenerado]);

  const seleccionadas = filas.filter((f) => sel[f.emp.id] && !f.generado && f.importe > 0);
  const totalSel = seleccionadas.reduce((s, f) => s + f.importe, 0);

  const generar = async () => {
    if (seleccionadas.length === 0) return toast.error("Seleccioná al menos un empleado con días trabajados");
    setGenerando(true);
    try {
      const filasInsert = seleccionadas.map((f) => ({
        user_id: user!.id,
        empleado_id: f.emp.id,
        fecha: hasta,
        modalidad: modalidadDe(f.emp, tramo),
        periodo_desde: desde,
        periodo_hasta: hasta,
        horas: f.horas,
        monto: Math.round(f.importe * 100) / 100,
        tareas: `${f.dias} jornada(s) trabajada(s)`,
        estado: "pendiente",
        forma_pago: f.emp.forma_pago ?? null,
        observaciones: `Cupón ${formatFecha(desde)} → ${formatFecha(hasta)}`,
        anio: a,
        mes: m,
      }));
      const { error } = await supabase.from("fema_pagos_empleado").insert(filasInsert);
      if (error) throw error;
      toast.success(`${filasInsert.length} cupón(es) generado(s) por ${formatPesos(totalSel)}. Ya podés solicitar la factura desde Pagos.`);
      setSel({});
      qc.invalidateQueries({ queryKey: ["fema_pagos_cupon"] });
      qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron generar los cupones");
    } finally {
      setGenerando(false);
    }
  };

  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-medium">Cupones de pago</h3>
            <p className="text-xs text-muted-foreground">
              Suma los días marcados en Semanas trabajadas y arma el pago del período de cada empleado.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <Select value={mes} onValueChange={(x) => { setMes(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_LARGOS.map((x, i) => <SelectItem key={x} value={String(i + 1)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Año</Label>
              <Select value={anio} onValueChange={(x) => { setAnio(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anios.map((x) => <SelectItem key={x} value={String(x)}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={tramo} onValueChange={(x) => { setTramo(x); setSel({}); }}>
                <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">Mes completo</SelectItem>
                  <SelectItem value="q1">1ª quincena (1 al 15)</SelectItem>
                  <SelectItem value="q2">2ª quincena (16 a fin de mes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generar} disabled={generando || seleccionadas.length === 0}>
              <Receipt className="size-4 mr-1" /> Generar cupones ({seleccionadas.length})
              {seleccionadas.length > 0 && <span className="ml-1 font-semibold">· {formatPesos(totalSel)}</span>}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Empleado</TableHead>
                <TableHead>Cobra</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Importe del período</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin empleados activos</TableCell></TableRow>
              )}
              {filas.map((f) => (
                <TableRow key={f.emp.id}>
                  <TableCell>
                    <Checkbox
                      checked={!!sel[f.emp.id]}
                      disabled={f.generado || f.importe <= 0}
                      onCheckedChange={(c) => setSel((s) => ({ ...s, [f.emp.id]: !!c }))}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{f.emp.nombre}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(f.emp.frecuencia_pago ?? "Mensual")} · base {DIAS_BASE(f.emp.frecuencia_pago)} día(s)
                  </TableCell>
                  <TableCell className="text-right font-mono">{f.dias}</TableCell>
                  <TableCell className="text-right font-mono">{f.horas.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(f.importe)}</TableCell>
                  <TableCell>
                    {f.generado
                      ? <Badge variant="secondary">Cupón generado</Badge>
                      : f.importe > 0
                        ? <Badge variant="outline">Listo para generar</Badge>
                        : <span className="text-xs text-muted-foreground">Sin días / sin importe</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        El importe surge del importe acordado del empleado dividido por los días base de su frecuencia y multiplicado por los
        días trabajados. Los cupones generados se registran en la pestaña Pagos como pendientes; desde ahí podés seleccionarlos
        y solicitar la factura correspondiente.
      </p>
    </div>
  );
}
