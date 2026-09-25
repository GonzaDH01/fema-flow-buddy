import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const FORMAS = ["Transferencia", "Efectivo", "Cheque", "Echeq", "Otro"];

type EmpleadoHa = {
  id: string; nombre: string; valor_hectarea: number | null;
  banco: string | null; cbu: string | null; alias_cbu: string | null;
};

type FacturaHa = {
  id: string; fecha: string; numero: string | null; tipo: string | null;
  tipo_comprobante: string | null; cultivo: string | null; trabajo: string | null;
  hectareas: number | null; cliente_id: string | null;
  fema_clientes: { nombre: string } | null;
};

type LiqRow = { factura_venta_id: string | null; hectareas: number; empleado_id: string | null };

function useEmpleadosHa() {
  return useQuery({
    queryKey: ["fema_empleados_ha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_empleados")
        .select("id,nombre,valor_hectarea,banco,cbu,alias_cbu")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as EmpleadoHa[];
    },
  });
}

function useFacturasHa() {
  return useQuery({
    queryKey: ["facturas_venta_hectareas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_venta")
        .select("id,fecha,numero,tipo,tipo_comprobante,cultivo,trabajo,hectareas,cliente_id,fema_clientes(nombre)")
        .gt("hectareas", 0)
        .order("fecha", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as unknown as FacturaHa[]).filter((f) => f.tipo_comprobante !== "Estimado");
    },
  });
}

function useLiquidado() {
  return useQuery({
    queryKey: ["fema_liquidacion_ha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_liquidacion_ha")
        .select("factura_venta_id,hectareas,empleado_id");
      if (error) throw error;
      return (data ?? []) as LiqRow[];
    },
  });
}

export function LiquidarHectareasDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const hoyIso = new Date().toISOString().slice(0, 10);

  const [empleadoId, setEmpleadoId] = useState("");
  const [valorHa, setValorHa] = useState("");
  const [dias, setDias] = useState("");
  const [valorDia, setValorDia] = useState("");
  const [fecha, setFecha] = useState(hoyIso);
  const [formaPago, setFormaPago] = useState("Transferencia");
  const [detalle, setDetalle] = useState("");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({}); // facturaId -> hectáreas del empleado

  const { data: empleados } = useEmpleadosHa();
  const { data: facturas } = useFacturasHa();
  const { data: liquidado } = useLiquidado();

  const emp = (empleados ?? []).find((e) => e.id === empleadoId);

  const liqPorFactura = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of liquidado ?? []) {
      if (!l.factura_venta_id) continue;
      m[l.factura_venta_id] = (m[l.factura_venta_id] ?? 0) + Number(l.hectareas ?? 0);
    }
    return m;
  }, [liquidado]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let l = facturas ?? [];
    if (q) {
      l = l.filter((f) =>
        [f.numero, f.cultivo, f.trabajo, f.fema_clientes?.nombre, f.fecha]
          .some((x) => (x ?? "").toString().toLowerCase().includes(q)),
      );
    }
    return l;
  }, [facturas, busca]);

  const elegirEmpleado = (id: string) => {
    setEmpleadoId(id);
    const e = (empleados ?? []).find((x) => x.id === id);
    const v = Number(e?.valor_hectarea ?? 0);
    if (v > 0) setValorHa(String(v));
  };

  const toggle = (f: FacturaHa) => {
    setSel((s) => {
      if (s[f.id] !== undefined) {
        const { [f.id]: _drop, ...rest } = s;
        return rest;
      }
      const total = Number(f.hectareas ?? 0);
      const rest = Math.max(0, total - (liqPorFactura[f.id] ?? 0));
      return { ...s, [f.id]: String(rest || total) };
    });
  };

  const vHa = Number(valorHa || 0);
  const haTotal = Object.values(sel).reduce((a, x) => a + Number(x || 0), 0);
  const montoHa = Math.round(haTotal * vHa * 100) / 100;
  const montoDias = Math.round(Number(dias || 0) * Number(valorDia || 0) * 100) / 100;
  const total = Math.round((montoHa + montoDias) * 100) / 100;

  const limpiar = () => {
    setSel({}); setDias(""); setValorDia(""); setDetalle(""); setBusca("");
  };

  const guardar = async () => {
    if (!empleadoId) return toast.error("Seleccioná un empleado");
    if (Object.keys(sel).length === 0 && montoDias <= 0) return toast.error("Elegí al menos una factura o cargá días trabajados");
    if (total <= 0) return toast.error("El total a pagar debe ser mayor a cero");

    const facMap = Object.fromEntries((facturas ?? []).map((f) => [f.id, f]));
    const lineas = Object.entries(sel).map(([id, ha]) => {
      const f = facMap[id];
      const cli = f?.fema_clientes?.nombre ?? "Cliente";
      const cultivo = f?.cultivo ? ` ${f.cultivo}` : "";
      return `Factura ${f?.numero ?? "s/n"} (${cli}) — ${Number(ha || 0)} ha${cultivo} @ ${formatPesos(vHa)}/ha`;
    });
    if (montoDias > 0) lineas.push(`${Number(dias)} día(s) @ ${formatPesos(Number(valorDia || 0))}`);
    const texto = ["Liquidación por hectáreas:", ...lineas, detalle].filter(Boolean).join(" · ");

    const d = new Date(fecha + "T00:00:00");
    const { data: pago, error } = await supabase
      .from("fema_pagos_empleado")
      .insert({
        user_id: user!.id,
        empleado_id: empleadoId,
        fecha,
        tipo_pago: "hectareas",
        modalidad: "hectareas",
        periodo_desde: fecha,
        periodo_hasta: fecha,
        monto: total,
        horas: 0,
        estado: "pagado",
        tareas: texto,
        forma_pago: formaPago,
        anio: d.getFullYear(),
        mes: d.getMonth() + 1,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);

    const filas = Object.entries(sel).map(([id, ha]) => ({
      user_id: user!.id,
      pago_id: pago!.id,
      factura_venta_id: id,
      empleado_id: empleadoId,
      hectareas: Number(ha || 0),
      valor_ha: vHa,
      importe: Math.round(Number(ha || 0) * vHa * 100) / 100,
      detalle: facMap[id]?.cultivo ?? null,
    }));
    if (filas.length > 0) {
      const { error: e2 } = await supabase.from("fema_liquidacion_ha").insert(filas);
      if (e2) toast.error("El pago se guardó pero no se registró el detalle: " + e2.message);
    }
    if (vHa > 0 && vHa !== Number(emp?.valor_hectarea ?? 0)) {
      await supabase.from("fema_empleados").update({ valor_hectarea: vHa }).eq("id", empleadoId);
    }

    toast.success(`Liquidación registrada por ${formatPesos(total)}`);
    for (const k of ["fema_pagos_empleado", "fema_liquidacion_ha", "fema_empleados_ha", "fema_empleados_min", "dashboard", "cashflow-matrix"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
    limpiar();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><Ruler className="size-4 mr-1" /> Liquidar por hectáreas</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Liquidar hectáreas trabajadas</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Empleado</Label>
              <Select value={empleadoId} onValueChange={elegirEmpleado}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
                <SelectContent>
                  {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {emp && (emp.alias_cbu || emp.cbu) && (
                <p className="text-xs text-muted-foreground">{emp.banco ? `${emp.banco} · ` : ""}{emp.alias_cbu ?? emp.cbu}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Valor por hectárea ($)</Label>
              <Input type="number" step="0.01" min="0" value={valorHa} placeholder="0,00"
                onChange={(e) => setValorHa(e.target.value)} />
              <p className="text-xs text-muted-foreground">Se guarda como tarifa sugerida del empleado.</p>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div>
                <p className="text-sm font-medium">Trabajos facturados a clientes</p>
                <p className="text-xs text-muted-foreground">Tildá una o varias facturas y ajustá las hectáreas que le corresponden.</p>
              </div>
              <Input className="w-56" placeholder="Buscar cliente, cultivo o número..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto p-3">
              {lista.length === 0 && <p className="p-2 text-sm text-muted-foreground">No hay facturas con hectáreas cargadas.</p>}
              {lista.map((f) => {
                const total = Number(f.hectareas ?? 0);
                const yaLiq = liqPorFactura[f.id] ?? 0;
                const marcada = sel[f.id] !== undefined;
                return (
                  <div key={f.id} className={`rounded-md border p-2 ${marcada ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox checked={marcada} onCheckedChange={() => toggle(f)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {f.fema_clientes?.nombre ?? "Sin cliente"} · {f.tipo ?? ""}-{f.numero ?? "s/n"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFecha(f.fecha)} · {total} ha{f.cultivo ? ` · ${f.cultivo}` : ""}{f.trabajo ? ` · ${f.trabajo}` : ""}
                        </p>
                        {yaLiq > 0 && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {yaLiq} ha ya liquidadas
                          </Badge>
                        )}
                      </div>
                      {marcada && (
                        <div className="w-28 shrink-0">
                          <Label className="text-[11px]">Ha del empleado</Label>
                          <Input type="number" step="0.01" min="0" value={sel[f.id]}
                            onChange={(e) => setSel((s) => ({ ...s, [f.id]: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Días trabajados</Label>
              <Input type="number" step="1" min="0" value={dias} placeholder="0" onChange={(e) => setDias(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor por día ($)</Label>
              <Input type="number" step="0.01" min="0" value={valorDia} placeholder="0,00" onChange={(e) => setValorDia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de pago</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={formaPago} onValueChange={setFormaPago}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Detalle (opcional)</Label>
            <Textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)}
              placeholder="Picado lote 4, campaña septiembre..." />
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span>{haTotal} ha × {formatPesos(vHa)}</span><b>{formatPesos(montoHa)}</b></div>
            {montoDias > 0 && (
              <div className="flex justify-between"><span>{Number(dias)} día(s) × {formatPesos(Number(valorDia || 0))}</span><b>{formatPesos(montoDias)}</b></div>
            )}
            <div className="mt-1 flex justify-between border-t pt-1 text-base">
              <span className="font-medium">Total a pagar</span><b>{formatPesos(total)}</b>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={guardar}>Guardar liquidación</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
