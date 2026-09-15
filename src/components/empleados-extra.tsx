import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const MODALIDAD_EXTRA = "extra";

type Empleado = { id: string; nombre: string };

/**
 * Carga un pago extraordinario (trabajo puntual, adelanto de tarea, premio).
 * Queda pendiente y se suma al cupón del período del empleado.
 */
export function ExtraDialog({
  empleados,
  empleadoId,
  fecha,
  trigger,
}: {
  empleados: Empleado[];
  empleadoId?: string;
  fecha: string;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [emp, setEmp] = useState(empleadoId ?? "");
  const [dia, setDia] = useState(fecha);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const abrir = (v: boolean) => {
    if (v) {
      setEmp(empleadoId ?? "");
      setDia(fecha);
      setConcepto("");
      setMonto("");
    }
    setOpen(v);
  };

  const guardar = async () => {
    if (!emp) return toast.error("Elegí el empleado");
    const importe = Number(monto);
    if (!importe || importe <= 0) return toast.error("Ingresá el importe del pago extra");
    setGuardando(true);
    try {
      const d = new Date(dia + "T00:00:00");
      const { error } = await supabase.from("fema_pagos_empleado").insert({
        user_id: user!.id,
        empleado_id: emp,
        fecha: dia,
        modalidad: MODALIDAD_EXTRA,
        periodo_desde: dia,
        periodo_hasta: dia,
        horas: 0,
        monto: Math.round(importe * 100) / 100,
        tareas: concepto || "Trabajo extraordinario",
        estado: "pendiente",
        observaciones: "Pago extraordinario",
        anio: d.getFullYear(),
        mes: d.getMonth() + 1,
      });
      if (error) throw error;
      toast.success(`Pago extra de ${formatPesos(importe)} agregado`);
      qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
      qc.invalidateQueries({ queryKey: ["fema_extras_cupon"] });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el pago extra");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
        <span onClick={() => abrir(true)} role="button">
          {trigger ?? (<><Plus className="size-3 mr-1" /> Extra</>)}
        </span>
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pago extraordinario</DialogTitle>
          <DialogDescription>Un trabajo puntual que se suma al cupón del período.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={emp} onValueChange={setEmp}>
              <SelectTrigger><SelectValue placeholder="Elegir empleado..." /></SelectTrigger>
              <SelectContent>
                {empleados.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Concepto</Label>
            <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: descarga de camión domingo" />
          </div>
          <div className="space-y-1.5">
            <Label>Importe ($)</Label>
            <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
