import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatNumero, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Bono = {
  id: string; empleado_id: string | null; campana: string; anio: number;
  hectareas: number; metros_bolsa: number; criterio: string;
  valor_ha: number; valor_metro: number; porcentaje: number;
  base_facturado: number; monto_fijo: number; monto_total: number;
  estado: string; observaciones: string | null;
};

type PagoBono = { id: string; bono_id: string | null; empleado_id: string | null; fecha: string; monto: number; forma_pago: string | null; observaciones: string | null };

const CRITERIOS = [
  { v: "por_hectarea", l: "$ por hectárea picada" },
  { v: "por_metro", l: "$ por metro de bolsa" },
  { v: "mixto", l: "Mixto (ha + metros)" },
  { v: "porcentaje", l: "% sobre lo facturado" },
  { v: "fijo", l: "Monto fijo" },
];
const FORMAS = ["Efectivo", "Transferencia", "Cheque", "Echeq", "Otro"];

export function calcularBono(v: {
  criterio: string; hectareas: number; metros_bolsa: number;
  valor_ha: number; valor_metro: number; porcentaje: number;
  base_facturado: number; monto_fijo: number;
}) {
  switch (v.criterio) {
    case "por_hectarea": return v.hectareas * v.valor_ha;
    case "por_metro": return v.metros_bolsa * v.valor_metro;
    case "mixto": return v.hectareas * v.valor_ha + v.metros_bolsa * v.valor_metro;
    case "porcentaje": return (v.base_facturado * v.porcentaje) / 100;
    default: return v.monto_fijo;
  }
}

function defaultCampana() {
  const hoy = new Date();
  const y = hoy.getMonth() + 1 >= 7 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  return { label: `${y}/${y + 1}`, desde: `${y}-07-01`, hasta: `${y + 1}-06-30`, anio: y + 1 };
}

export function CampanaTab() {
  const qc = useQueryClient();
  const inicial = defaultCampana();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [campana, setCampana] = useState(inicial.label);

  const { data: ventas } = useQuery({
    queryKey: ["campana_ventas", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_venta")
        .select("id,fecha,cultivo,trabajo,hectareas,metros_bolsa,neto,total")
        .gte("fecha", desde).lte("fecha", hasta);
      if (error) throw error;
      return data as { fecha: string; cultivo: string | null; trabajo: string | null; hectareas: number | null; metros_bolsa: number | null; neto: number | null; total: number | null }[];
    },
  });

  const porCultivo = useMemo(() => {
    const m = new Map<string, { cultivo: string; ha: number; metros: number; facturado: number; comprobantes: number }>();
    for (const f of ventas ?? []) {
      const k = f.cultivo?.trim() || "Sin cultivo";
      const r = m.get(k) ?? { cultivo: k, ha: 0, metros: 0, facturado: 0, comprobantes: 0 };
      r.ha += Number(f.hectareas ?? 0);
      r.metros += Number(f.metros_bolsa ?? 0);
      r.facturado += Number(f.total ?? 0);
      r.comprobantes += 1;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.ha - a.ha);
  }, [ventas]);

  const tot = useMemo(() => porCultivo.reduce(
    (a, r) => ({ ha: a.ha + r.ha, metros: a.metros + r.metros, facturado: a.facturado + r.facturado }),
    { ha: 0, metros: 0, facturado: 0 },
  ), [porCultivo]);

  const { data: bonos } = useQuery({
    queryKey: ["fema_bonos_campana"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_bonos_campana").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Bono[];
    },
  });

  const { data: pagosBono } = useQuery({
    queryKey: ["fema_pagos_bono"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_pagos_empleado")
        .select("id,bono_id,empleado_id,fecha,monto,forma_pago,observaciones")
        .not("bono_id", "is", null)
        .order("fecha", { ascending: false });
      return (data ?? []) as PagoBono[];
    },
  });

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre,tipo_contratacion,sueldo_bruto,valor_hora").order("nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const empMap = useMemo(() => Object.fromEntries((empleados ?? []).map((e) => [e.id, e.nombre])), [empleados]);

  const pagadoPorBono = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pagosBono ?? []) if (p.bono_id) m[p.bono_id] = (m[p.bono_id] ?? 0) + Number(p.monto ?? 0);
    return m;
  }, [pagosBono]);

  const bonosCampana = useMemo(() => (bonos ?? []).filter((b) => b.campana === campana), [bonos, campana]);

  const eliminar = async (id: string) => {
    const { error } = await supabase.from("fema_bonos_campana").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bono eliminado");
    qc.invalidateQueries({ queryKey: ["fema_bonos_campana"] });
  };

  const totalBonos = bonosCampana.reduce((a, b) => a + Number(b.monto_total ?? 0), 0);
  const totalPagado = bonosCampana.reduce((a, b) => a + (pagadoPorBono[b.id] ?? 0), 0);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>Campaña</Label>
          <Input className="w-32" value={campana} onChange={(e) => setCampana(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="ml-auto">
          <NuevoBonoDialog
            campana={campana} anio={new Date(hasta).getFullYear()}
            hectareas={tot.ha} metros={tot.metros} facturado={tot.facturado}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Hectáreas picadas" value={`${formatNumero(tot.ha, 1)} ha`} />
        <Kpi label="Metros de bolsa" value={`${formatNumero(tot.metros, 0)} m`} />
        <Kpi label="Facturado campaña" value={formatPesos(tot.facturado)} />
        <Kpi label="Bonos / abonado" value={`${formatPesos(totalBonos)} · ${formatPesos(totalPagado)}`} />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Producción por cultivo</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cultivo</TableHead>
              <TableHead className="text-right">Hectáreas</TableHead>
              <TableHead className="text-right">Metros de bolsa</TableHead>
              <TableHead className="text-right">Facturado</TableHead>
              <TableHead className="text-right">Comprobantes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porCultivo.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Sin trabajos facturados en el período</TableCell></TableRow>
            ) : porCultivo.map((r) => (
              <TableRow key={r.cultivo}>
                <TableCell className="font-medium">{r.cultivo}</TableCell>
                <TableCell className="text-right">{formatNumero(r.ha, 1)}</TableCell>
                <TableCell className="text-right">{formatNumero(r.metros, 0)}</TableCell>
                <TableCell className="text-right">{formatPesos(r.facturado)}</TableCell>
                <TableCell className="text-right">{r.comprobantes}</TableCell>
              </TableRow>
            ))}
            {porCultivo.length > 0 && (
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatNumero(tot.ha, 1)}</TableCell>
                <TableCell className="text-right">{formatNumero(tot.metros, 0)}</TableCell>
                <TableCell className="text-right">{formatPesos(tot.facturado)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Bonos de fin de campaña {campana}</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Cálculo</TableHead>
                <TableHead className="text-right">Bono</TableHead>
                <TableHead className="text-right">Abonado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonosCampana.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Todavía no cargaste bonos para esta campaña</TableCell></TableRow>
              ) : bonosCampana.map((b) => {
                const pagado = pagadoPorBono[b.id] ?? 0;
                const saldo = Number(b.monto_total ?? 0) - pagado;
                const estado = saldo <= 0.01 ? "pagado" : pagado > 0 ? "parcial" : "pendiente";
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.empleado_id ? empMap[b.empleado_id] ?? "—" : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{descripcionCriterio(b)}</TableCell>
                    <TableCell className="text-right">{formatPesos(b.monto_total)}</TableCell>
                    <TableCell className="text-right">{formatPesos(pagado)}</TableCell>
                    <TableCell className="text-right">{formatPesos(saldo)}</TableCell>
                    <TableCell>
                      <Badge variant={estado === "pagado" ? "default" : estado === "parcial" ? "secondary" : "outline"}>{estado}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <PagoBonoDialog bono={b} saldo={saldo} />
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => eliminar(b.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {(pagosBono ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Pagos de bonos registrados</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Forma de pago</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pagosBono ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatFecha(p.fecha)}</TableCell>
                  <TableCell>{p.empleado_id ? empMap[p.empleado_id] ?? "—" : "—"}</TableCell>
                  <TableCell>{p.forma_pago ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.observaciones ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatPesos(p.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function descripcionCriterio(b: Bono) {
  switch (b.criterio) {
    case "por_hectarea": return `${formatNumero(b.hectareas, 1)} ha × ${formatPesos(b.valor_ha)}`;
    case "por_metro": return `${formatNumero(b.metros_bolsa, 0)} m × ${formatPesos(b.valor_metro)}`;
    case "mixto": return `${formatNumero(b.hectareas, 1)} ha × ${formatPesos(b.valor_ha)} + ${formatNumero(b.metros_bolsa, 0)} m × ${formatPesos(b.valor_metro)}`;
    case "porcentaje": return `${formatNumero(b.porcentaje, 2)}% de ${formatPesos(b.base_facturado)}`;
    default: return "Monto fijo";
  }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function NuevoBonoDialog({ campana, anio, hectareas, metros, facturado }: {
  campana: string; anio: number; hectareas: number; metros: number; facturado: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    empleado_id: "", criterio: "por_hectarea",
    hectareas: "", metros_bolsa: "", valor_ha: "0", valor_metro: "0",
    porcentaje: "0", base_facturado: "", monto_fijo: "0", observaciones: "",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const { data: empleados } = useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_empleados").select("id,nombre,tipo_contratacion,sueldo_bruto,valor_hora").order("nombre");
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const nums = {
    criterio: v.criterio,
    hectareas: v.hectareas === "" ? hectareas : Number(v.hectareas),
    metros_bolsa: v.metros_bolsa === "" ? metros : Number(v.metros_bolsa),
    valor_ha: Number(v.valor_ha || 0),
    valor_metro: Number(v.valor_metro || 0),
    porcentaje: Number(v.porcentaje || 0),
    base_facturado: v.base_facturado === "" ? facturado : Number(v.base_facturado),
    monto_fijo: Number(v.monto_fijo || 0),
  };
  const total = calcularBono(nums);

  const onSubmit = async () => {
    if (!v.empleado_id) return toast.error("Seleccioná un empleado");
    if (total <= 0) return toast.error("El bono calculado debe ser mayor a cero");
    const { error } = await supabase.from("fema_bonos_campana").insert({
      user_id: user!.id, empleado_id: v.empleado_id, campana, anio,
      ...nums, monto_total: total, estado: "pendiente",
      observaciones: v.observaciones || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Bono de campaña creado");
    qc.invalidateQueries({ queryKey: ["fema_bonos_campana"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Nuevo bono de campaña</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Bono de fin de campaña {campana}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={v.empleado_id} onValueChange={(x) => set("empleado_id", x)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Criterio de cálculo</Label>
            <Select value={v.criterio} onValueChange={(x) => set("criterio", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRITERIOS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(v.criterio === "por_hectarea" || v.criterio === "mixto") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hectáreas</Label>
                <Input type="number" value={v.hectareas} placeholder={String(hectareas)} onChange={(e) => set("hectareas", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>$ por hectárea</Label>
                <Input type="number" value={v.valor_ha} onChange={(e) => set("valor_ha", e.target.value)} />
              </div>
            </div>
          )}
          {(v.criterio === "por_metro" || v.criterio === "mixto") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Metros de bolsa</Label>
                <Input type="number" value={v.metros_bolsa} placeholder={String(metros)} onChange={(e) => set("metros_bolsa", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>$ por metro</Label>
                <Input type="number" value={v.valor_metro} onChange={(e) => set("valor_metro", e.target.value)} />
              </div>
            </div>
          )}
          {v.criterio === "porcentaje" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base facturada</Label>
                <Input type="number" value={v.base_facturado} placeholder={String(facturado)} onChange={(e) => set("base_facturado", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>% del bono</Label>
                <Input type="number" value={v.porcentaje} onChange={(e) => set("porcentaje", e.target.value)} />
              </div>
            </div>
          )}
          {v.criterio === "fijo" && (
            <div className="space-y-1.5">
              <Label>Monto fijo</Label>
              <Input type="number" value={v.monto_fijo} onChange={(e) => set("monto_fijo", e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            Bono calculado: <span className="font-semibold">{formatPesos(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSubmit}>Guardar bono</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagoBonoDialog({ bono, saldo }: { bono: Bono; saldo: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState(String(saldo > 0 ? saldo : 0));
  const [forma, setForma] = useState("Transferencia");
  const [obs, setObs] = useState("");

  const registrar = async () => {
    const m = Number(monto || 0);
    if (m <= 0) return toast.error("Ingresá un importe");
    if (m > saldo + 0.01) return toast.error("El importe supera el saldo del bono");
    const d = new Date(fecha);
    const { error } = await supabase.from("fema_pagos_empleado").insert({
      user_id: user!.id, empleado_id: bono.empleado_id, bono_id: bono.id,
      fecha, modalidad: "bono_campana", monto: m, horas: 0,
      tareas: `Bono fin de campaña ${bono.campana}`,
      estado: "pagado", forma_pago: forma,
      observaciones: obs || (m < saldo ? "Pago parcial del bono" : "Cancelación total del bono"),
      anio: d.getFullYear(), mes: d.getMonth() + 1,
    });
    if (error) return toast.error(error.message);
    const nuevoEstado = m >= saldo - 0.01 ? "pagado" : "parcial";
    await supabase.from("fema_bonos_campana").update({ estado: nuevoEstado }).eq("id", bono.id);
    toast.success("Pago de bono registrado");
    qc.invalidateQueries({ queryKey: ["fema_pagos_bono"] });
    qc.invalidateQueries({ queryKey: ["fema_bonos_campana"] });
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setMonto(String(saldo > 0 ? saldo : 0)); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" disabled={saldo <= 0.01}><Wallet className="size-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pagar bono de campaña</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Saldo pendiente: <span className="font-semibold text-foreground">{formatPesos(saldo)}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Importe</Label>
              <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMonto(String(saldo))}>Total</Button>
            <Button size="sm" variant="outline" onClick={() => setMonto(String(Math.round(saldo / 2)))}>50%</Button>
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={registrar}>Registrar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
