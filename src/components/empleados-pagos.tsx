import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Check, FileText, Link2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import {
  femaPrintCSS, femaHeaderHTML, femaClientHTML, femaWatermarkHTML,
  absoluteAssetUrl, femaLogoUrl, femaWatermarkUrl,
} from "@/lib/fema-doc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type PagoEmpleado = {
  id: string; empleado_id: string | null; fecha: string;
  periodo_desde: string | null; periodo_hasta: string | null;
  modalidad: string; tareas: string | null; horas: number; monto: number;
  estado: string; forma_pago: string | null; observaciones: string | null;
  solicitud_id: string | null; anio: number | null; mes: number | null;
  tipo_pago: string; factura_compra_id: string | null;
};

export type SolicitudFactura = {
  id: string; empleado_id: string | null; fecha: string;
  periodo_desde: string | null; periodo_hasta: string | null;
  total: number; estado: string; factura_compra_id: string | null;
  observaciones: string | null;
};

const FORMAS = ["Transferencia", "Efectivo", "Cheque", "Echeq", "Otro"];

const TIPOS = [
  { v: "sueldo", label: "Sueldo / Período" },
  { v: "adelanto", label: "Adelanto" },
  { v: "extra", label: "Extra / Bono" },
];
const TIPO_LABEL: Record<string, string> = {
  sueldo: "Sueldo", adelanto: "Adelanto", extra: "Extra",
};

const PERIODOS = [
  { v: "mes", label: "Mes completo" },
  { v: "q1", label: "1ª quincena" },
  { v: "q2", label: "2ª quincena" },
];

type EmpleadoMin = {
  id: string; nombre: string; tipo_contratacion: string | null;
  sueldo_bruto: number; valor_hora: number; importe_periodo: number | null;
  frecuencia_pago: string | null; banco: string | null; cbu: string | null; alias_cbu: string | null;
};

function useEmpleadosMin() {
  return useQuery({
    queryKey: ["fema_empleados_min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fema_empleados")
        .select("id,nombre,tipo_contratacion,sueldo_bruto,valor_hora,importe_periodo,frecuencia_pago,banco,cbu,alias_cbu")
        .order("nombre");
      return (data ?? []) as EmpleadoMin[];
    },
  });
}

export type FacturaCompraMin = {
  id: string; fecha: string; numero: string | null; total: number;
  estado: string | null; categoria: string | null; empleado_id: string | null;
  descripcion: string | null; proveedor_id: string | null;
  fema_proveedores: { nombre: string } | null;
};

/** Todas las facturas de compra (con proveedor y detalle) para asociar al pago. */
function useFacturasCompraAsociar() {
  return useQuery({
    queryKey: ["facturas_compra_asociar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_compra")
        .select("id,fecha,numero,total,estado,categoria,empleado_id,descripcion,proveedor_id,fema_proveedores(nombre)")
        .order("fecha", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as FacturaCompraMin[];
    },
  });
}


function rangoPeriodo(anio: number, mes: number, tramo: string) {
  const ultimo = new Date(anio, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  if (tramo === "q1") return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-15` };
  if (tramo === "q2") return { desde: `${anio}-${mm}-16`, hasta: `${anio}-${mm}-${ultimo}` };
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

function imprimirRecibo(p: {
  empleado: string; fecha: string; tipo: string; detalle: string;
  periodo: string; monto: number; forma: string;
}) {
  const logo = absoluteAssetUrl(femaLogoUrl);
  const wm = absoluteAssetUrl(femaWatermarkUrl);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orden de pago ${p.empleado}</title>
<style>${femaPrintCSS}</style></head><body>
<div class="fema-page">
  ${femaWatermarkHTML(wm)}
  <div class="fema-content">
    ${femaHeaderHTML("ORDEN DE PAGO", [
      { label: "Fecha:", value: formatFecha(p.fecha) },
      { label: "Concepto:", value: p.tipo },
    ], logo)}
    ${femaClientHTML([
      { label: "Empleado:", value: p.empleado },
      { label: "Período:", value: p.periodo || "—" },
      { label: "Forma de pago:", value: p.forma || "—" },
    ])}
    <table class="fema">
      <thead><tr><th>Detalle</th><th class="right">Importe</th></tr></thead>
      <tbody><tr><td>${p.detalle || p.tipo}</td><td class="right">${formatPesos(p.monto)}</td></tr></tbody>
    </table>
    <div class="fema-spacer"></div>
    <div class="fema-bottom">
      <div class="fema-obs"><div class="t">OBSERVACIONES:</div>Pago registrado desde el módulo Empleados.</div>
      <div class="fema-tot"><div class="row total"><span>Total abonado</span><span>${formatPesos(p.monto)}</span></div></div>
    </div>
    <div class="fema-sign"><div>Firma de la empresa</div><div>Firma del empleado</div></div>
  </div>
</div>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return toast.error("El navegador bloqueó la ventana de impresión");
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}

// ============ NUEVO PAGO (rápido) ============
export function NuevoPagoDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);
  const [v, setV] = useState({
    empleado_id: "", tipo: "sueldo", fecha: hoyIso,
    mes: String(hoy.getMonth() + 1), anio: String(hoy.getFullYear()), tramo: "mes",
    monto: "", detalle: "", forma_pago: "Transferencia",
    factura_id: "none",
  });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const { data: empleados } = useEmpleadosMin();
  const { data: facturas } = useFacturasCompraAsociar();

  const emp = (empleados ?? []).find((e) => e.id === v.empleado_id);
  const facturasEmp = useMemo(
    () => (facturas ?? []).filter((f) => !f.empleado_id || f.empleado_id === v.empleado_id),
    [facturas, v.empleado_id],
  );

  const elegirEmpleado = (id: string) => {
    const e = (empleados ?? []).find((x) => x.id === id);
    const base = Number(e?.importe_periodo ?? 0) || Number(e?.sueldo_bruto ?? 0);
    setV((s) => ({
      ...s,
      empleado_id: id,
      monto: s.tipo === "sueldo" && base > 0 ? String(base) : s.monto,
      factura_id: "none",
    }));
  };

  const onSubmit = async () => {
    if (!v.empleado_id) return toast.error("Seleccioná un empleado");
    const monto = Number(v.monto || 0);
    if (monto <= 0) return toast.error("Ingresá el importe del pago");
    const per = v.tipo === "sueldo"
      ? rangoPeriodo(Number(v.anio), Number(v.mes), v.tramo)
      : { desde: v.fecha, hasta: v.fecha };
    const d = new Date(v.fecha + "T00:00:00");
    const { error } = await supabase.from("fema_pagos_empleado").insert({
      user_id: user!.id,
      empleado_id: v.empleado_id,
      fecha: v.fecha,
      tipo_pago: v.tipo,
      modalidad: v.tipo === "sueldo" ? (v.tramo === "mes" ? "mensual" : "quincenal") : v.tipo,
      periodo_desde: per.desde,
      periodo_hasta: per.hasta,
      horas: 0,
      monto,
      tareas: v.detalle || null,
      estado: "pagado",
      forma_pago: v.forma_pago || null,
      factura_compra_id: v.factura_id === "none" ? null : v.factura_id,
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
    });
    if (error) return toast.error(error.message);
    if (v.factura_id !== "none") {
      await supabase.from("fema_facturas_compra").update({ empleado_id: v.empleado_id }).eq("id", v.factura_id);
    }
    toast.success(`${TIPO_LABEL[v.tipo]} registrado por ${formatPesos(monto)}`);
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
    qc.invalidateQueries({ queryKey: ["facturas_empleado"] });
    setOpen(false);
    setV((s) => ({ ...s, monto: "", detalle: "", factura_id: "none" }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> Registrar pago</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar pago a empleado</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={v.empleado_id} onValueChange={elegirEmpleado}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado..." /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}{e.tipo_contratacion ? ` — ${e.tipo_contratacion}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {emp && (emp.cbu || emp.alias_cbu) && (
              <p className="text-xs text-muted-foreground">
                {emp.banco ? `${emp.banco} · ` : ""}{emp.alias_cbu ?? emp.cbu}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de pago</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <Button
                  key={t.v}
                  type="button"
                  variant={v.tipo === t.v ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => setV((s) => ({
                    ...s,
                    tipo: t.v,
                    monto: t.v === "sueldo" && emp
                      ? String(Number(emp.importe_periodo ?? 0) || Number(emp.sueldo_bruto ?? 0) || "")
                      : s.monto,
                  }))}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {v.tipo === "sueldo" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Mes</Label>
                <Select value={v.mes} onValueChange={(x) => set("mes", x)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Año</Label>
                <Input value={v.anio} onChange={(e) => set("anio", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Período</Label>
                <Select value={v.tramo} onValueChange={(x) => set("tramo", x)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importe ($)</Label>
              <Input type="number" step="0.01" value={v.monto} placeholder="0,00" onChange={(e) => set("monto", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de pago</Label>
              <Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={v.forma_pago} onValueChange={(x) => set("forma_pago", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Factura del empleado</Label>
              <Select value={v.factura_id} onValueChange={(x) => set("factura_id", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pendiente de factura</SelectItem>
                  {facturasEmp.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {(f.numero ?? "s/n")} · {formatFecha(f.fecha)} · {formatPesos(f.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Detalle (opcional)</Label>
            <Textarea rows={2} value={v.detalle} onChange={(e) => set("detalle", e.target.value)} placeholder="Adelanto campaña, horas extra picado lote 4..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSubmit}>Guardar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ PAGOS ============
export function PagosEmpleadoTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { year } = useYear();
  const [empF, setEmpF] = useState("all");
  const [mesF, setMesF] = useState("all");
  const [tipoF, setTipoF] = useState("all");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [asociar, setAsociar] = useState<PagoEmpleado | null>(null);

  const { data: pagos } = useQuery({
    queryKey: ["fema_pagos_empleado", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_pagos_empleado").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PagoEmpleado[];
    },
  });
  const { data: empleados } = useEmpleadosMin();
  const empMap = useMemo(() => Object.fromEntries((empleados ?? []).map((e) => [e.id, e.nombre])), [empleados]);
  const { data: facturas } = useFacturasEmpleado();
  const facMap = useMemo(() => Object.fromEntries((facturas ?? []).map((f) => [f.id, f])), [facturas]);

  const rows = useMemo(() => {
    let list = (pagos ?? []).filter((p) => (p.anio ?? new Date(p.fecha).getFullYear()) === year);
    if (empF !== "all") list = list.filter((p) => p.empleado_id === empF);
    if (mesF !== "all") list = list.filter((p) => String(p.mes ?? new Date(p.fecha).getMonth() + 1) === mesF);
    if (tipoF !== "all") list = list.filter((p) => (p.tipo_pago ?? "sueldo") === tipoF);
    return list;
  }, [pagos, empF, mesF, tipoF, year]);

  const totalRows = rows.reduce((a, r) => a + Number(r.monto), 0);
  const sinFactura = rows.filter((r) => !r.factura_compra_id).length;

  const seleccionados = rows.filter((r) => sel[r.id] && !r.solicitud_id);
  const totalSel = seleccionados.reduce((a, r) => a + Number(r.monto), 0);
  const empleadosSel = new Set(seleccionados.map((r) => r.empleado_id));

  const marcarPagado = async (id: string) => {
    const { error } = await supabase.from("fema_pagos_empleado").update({ estado: "pagado" }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
  };
  const eliminar = async (id: string) => {
    const { error } = await supabase.from("fema_pagos_empleado").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
  };

  const asociarFactura = async (facturaId: string) => {
    if (!asociar) return;
    const { error } = await supabase
      .from("fema_pagos_empleado").update({ factura_compra_id: facturaId }).eq("id", asociar.id);
    if (error) return toast.error(error.message);
    if (asociar.empleado_id) {
      await supabase.from("fema_facturas_compra").update({ empleado_id: asociar.empleado_id }).eq("id", facturaId);
    }
    toast.success("Factura asociada al pago");
    setAsociar(null);
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
    qc.invalidateQueries({ queryKey: ["facturas_empleado"] });
  };

  const quitarFactura = async (p: PagoEmpleado) => {
    const { error } = await supabase
      .from("fema_pagos_empleado").update({ factura_compra_id: null }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
  };

  const solicitarFactura = async () => {
    if (seleccionados.length === 0) return toast.error("Seleccioná al menos un pago");
    if (empleadosSel.size > 1) return toast.error("Los pagos deben ser de un mismo empleado");
    const empleadoId = seleccionados[0].empleado_id;
    const fechas = seleccionados.map((p) => p.periodo_desde ?? p.fecha).sort();
    const hastas = seleccionados.map((p) => p.periodo_hasta ?? p.fecha).sort();
    const hoy = new Date();
    const { data: sol, error } = await supabase
      .from("fema_solicitudes_factura_empleado")
      .insert({
        user_id: user!.id,
        empleado_id: empleadoId,
        fecha: hoy.toISOString().slice(0, 10),
        periodo_desde: fechas[0],
        periodo_hasta: hastas[hastas.length - 1],
        total: totalSel,
        estado: "pendiente",
        anio: hoy.getFullYear(),
        mes: hoy.getMonth() + 1,
        observaciones: `${seleccionados.length} pago(s) agrupados`,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase
      .from("fema_pagos_empleado")
      .update({ solicitud_id: sol!.id })
      .in("id", seleccionados.map((p) => p.id));
    if (e2) return toast.error(e2.message);
    toast.success(`Solicitud de factura creada por ${formatPesos(totalSel)}`);
    setSel({});
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
    qc.invalidateQueries({ queryKey: ["fema_solicitudes_empleado"] });
  };

  const facturasDelPago = useMemo(
    () => (facturas ?? []).filter((f) => !f.empleado_id || f.empleado_id === asociar?.empleado_id),
    [facturas, asociar],
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div>
          <h3 className="font-medium">Pagos a empleados</h3>
          <p className="text-xs text-muted-foreground">
            Sueldos, adelantos y extras. Total del filtro: <b className="text-foreground">{formatPesos(totalRows)}</b>
            {sinFactura > 0 && <> · {sinFactura} sin factura</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={tipoF} onValueChange={setTipoF}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={empF} onValueChange={setEmpF}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los empleados</SelectItem>
              {(empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mesF} onValueChange={setMesF}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={seleccionados.length === 0} onClick={solicitarFactura}>
            <FileText className="size-4 mr-1" /> Solicitar factura ({seleccionados.length})
            {seleccionados.length > 0 && <span className="ml-1 font-semibold">· {formatPesos(totalSel)}</span>}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead><TableHead>Empleado</TableHead>
              <TableHead>Tipo</TableHead><TableHead>Período / Detalle</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Medio</TableHead>
              <TableHead>Estado</TableHead><TableHead>Factura</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sin pagos registrados</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const tipo = r.tipo_pago ?? "sueldo";
              const fac = r.factura_compra_id ? facMap[r.factura_compra_id] : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={!!sel[r.id]}
                      disabled={!!r.solicitud_id}
                      onCheckedChange={(c) => setSel((s) => ({ ...s, [r.id]: !!c }))}
                    />
                  </TableCell>
                  <TableCell>{formatFecha(r.fecha)}</TableCell>
                  <TableCell className="font-medium">{r.empleado_id ? empMap[r.empleado_id] ?? "—" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={tipo === "sueldo" ? "secondary" : "outline"}>{TIPO_LABEL[tipo] ?? tipo}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                    {r.periodo_desde && tipo === "sueldo"
                      ? `${formatFecha(r.periodo_desde)} → ${formatFecha(r.periodo_hasta)}`
                      : r.tareas ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(r.monto)}</TableCell>
                  <TableCell className="text-xs">{r.forma_pago ?? "—"}</TableCell>
                  <TableCell>
                    {r.estado === "pagado"
                      ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">● Pagado</Badge>
                      : <Badge variant="outline" className="border-destructive text-destructive">● Pendiente</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {fac ? (
                      <button className="text-primary underline-offset-2 hover:underline" onClick={() => quitarFactura(r)}>
                        {fac.numero ?? "s/n"} · {formatPesos(fac.total)}
                      </button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setAsociar(r)}>
                        <Link2 className="size-3 mr-1" /> Asociar
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {r.estado !== "pagado" && (
                        <Button size="sm" variant="outline" className="h-7 border-primary/40 text-primary" onClick={() => marcarPagado(r.id)}>
                          <Check className="size-3 mr-1" /> Pagar
                        </Button>
                      )}
                      <Button
                        size="icon" variant="outline" className="h-7 w-7"
                        title="Imprimir orden de pago"
                        onClick={() => imprimirRecibo({
                          empleado: (r.empleado_id ? empMap[r.empleado_id] : "") ?? "—",
                          fecha: r.fecha,
                          tipo: TIPO_LABEL[r.tipo_pago ?? "sueldo"] ?? "Pago",
                          detalle: r.tareas ?? "",
                          periodo: r.periodo_desde ? `${formatFecha(r.periodo_desde)} al ${formatFecha(r.periodo_hasta)}` : "",
                          monto: Number(r.monto),
                          forma: r.forma_pago ?? "",
                        })}
                      >
                        <Printer className="size-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => eliminar(r.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!asociar} onOpenChange={(o) => !o && setAsociar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Asociar factura del empleado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Elegí la factura que emitió {asociar?.empleado_id ? empMap[asociar.empleado_id] : "el empleado"} por este pago
            {asociar ? ` de ${formatPesos(asociar.monto)}` : ""}.
          </p>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {facturasDelPago.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay facturas de mano de obra cargadas. Cargala desde Compras o el lector de facturas.
              </p>
            )}
            {facturasDelPago.map((f) => (
              <button
                key={f.id}
                onClick={() => asociarFactura(f.id)}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium">{f.numero ?? "s/n"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatFecha(f.fecha)}</span>
                </span>
                <span className="font-semibold">{formatPesos(f.total)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsociar(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============ FACTURAS / SOLICITUDES ============
export function FacturasEmpleadoTab() {
  const qc = useQueryClient();
  const [vincular, setVincular] = useState<SolicitudFactura | null>(null);

  const { data: solicitudes } = useQuery({
    queryKey: ["fema_solicitudes_empleado"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_solicitudes_factura_empleado").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SolicitudFactura[];
    },
  });
  const { data: empleados } = useEmpleadosMin();
  const empMap = useMemo(() => Object.fromEntries((empleados ?? []).map((e) => [e.id, e.nombre])), [empleados]);

  const { data: facturas } = useQuery({
    queryKey: ["facturas_empleado"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_compra")
        .select("id,fecha,numero,total,estado,categoria,empleado_id,descripcion")
        .in("categoria", ["Mano_de_Obra", "Honorarios"])
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string; fecha: string; numero: string | null; total: number;
        estado: string | null; categoria: string | null; empleado_id: string | null; descripcion: string | null;
      }[];
    },
  });
  const facMap = useMemo(() => Object.fromEntries((facturas ?? []).map((f) => [f.id, f])), [facturas]);

  const [filtroCat, setFiltroCat] = useState("empleados");
  const facturasFiltradas = useMemo(() => {
    const list = facturas ?? [];
    if (filtroCat === "empleados") return list.filter((f) => !!f.empleado_id);
    if (filtroCat === "terceros") return list.filter((f) => !f.empleado_id);
    return list;
  }, [facturas, filtroCat]);
  const totalFiltrado = useMemo(
    () => facturasFiltradas.reduce((a, f) => a + Number(f.total ?? 0), 0),
    [facturasFiltradas],
  );

  const asignarEmpleado = async (facturaId: string, empleadoId: string | null) => {
    const { error } = await supabase
      .from("fema_facturas_compra").update({ empleado_id: empleadoId }).eq("id", facturaId);
    if (error) return toast.error(error.message);
    toast.success(empleadoId ? "Factura asignada al empleado" : "Marcada como tercero");
    qc.invalidateQueries({ queryKey: ["facturas_empleado"] });
  };

  const eliminarSol = async (s: SolicitudFactura) => {
    await supabase.from("fema_pagos_empleado").update({ solicitud_id: null }).eq("solicitud_id", s.id);
    const { error } = await supabase.from("fema_solicitudes_factura_empleado").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Solicitud eliminada");
    qc.invalidateQueries({ queryKey: ["fema_solicitudes_empleado"] });
    qc.invalidateQueries({ queryKey: ["fema_pagos_empleado"] });
  };

  const vincularFactura = async (facturaId: string) => {
    if (!vincular) return;
    const { error } = await supabase
      .from("fema_solicitudes_factura_empleado")
      .update({ factura_compra_id: facturaId, estado: "recibida" })
      .eq("id", vincular.id);
    if (error) return toast.error(error.message);
    if (vincular.empleado_id) {
      await supabase.from("fema_facturas_compra").update({ empleado_id: vincular.empleado_id }).eq("id", facturaId);
    }
    toast.success("Factura vinculada a la solicitud");
    setVincular(null);
    qc.invalidateQueries({ queryKey: ["fema_solicitudes_empleado"] });
    qc.invalidateQueries({ queryKey: ["facturas_empleado"] });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h3 className="font-medium">Solicitudes de factura</h3>
          <p className="text-xs text-muted-foreground">
            Pagos agrupados por empleado a la espera de su factura. Al vincularla, el pago del comprobante se registra desde Medios de pago.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead><TableHead>Empleado</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead><TableHead>Factura</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(solicitudes ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin solicitudes</TableCell></TableRow>
              )}
              {(solicitudes ?? []).map((s) => {
                const f = s.factura_compra_id ? facMap[s.factura_compra_id] : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>{formatFecha(s.fecha)}</TableCell>
                    <TableCell className="font-medium">{s.empleado_id ? empMap[s.empleado_id] ?? "—" : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {s.periodo_desde ? `${formatFecha(s.periodo_desde)} → ${formatFecha(s.periodo_hasta)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPesos(s.total)}</TableCell>
                    <TableCell>
                      {s.estado === "recibida"
                        ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Factura recibida</Badge>
                        : <Badge variant="outline" className="border-destructive text-destructive">Pendiente de factura</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {f ? `${f.numero ?? "s/n"} · ${formatPesos(f.total)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setVincular(s)}>
                          <Link2 className="size-3 mr-1" /> Vincular factura
                        </Button>
                        <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => eliminarSol(s)}>
                          <Trash2 className="size-3" />
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

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <h3 className="font-medium">Facturas de mano de obra / honorarios</h3>
            <p className="text-xs text-muted-foreground">
              Asigná el empleado en cada comprobante. Los que quedan “Sin asignar” son terceros/tercerizados y no cuentan como empleados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Categoría</span>
            <Select value={filtroCat} onValueChange={setFiltroCat}>
              <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="empleados">Solo empleados</SelectItem>
                <SelectItem value="terceros">Terceros / sin asignar</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead><TableHead>Número</TableHead>
                <TableHead>Empleado</TableHead><TableHead>Detalle</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin facturas</TableCell></TableRow>
              )}
              {facturasFiltradas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{formatFecha(f.fecha)}</TableCell>
                  <TableCell className="font-mono text-xs">{f.numero ?? "s/n"}</TableCell>
                  <TableCell>
                    <Select
                      value={f.empleado_id ?? "none"}
                      onValueChange={(v) => asignarEmpleado(f.id, v === "none" ? null : v)}
                    >
                      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar (tercero)</SelectItem>
                        {(empleados ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{f.descripcion ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPesos(f.total)}</TableCell>
                  <TableCell>
                    {f.estado === "pagada"
                      ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Pagada</Badge>
                      : <Badge variant="outline" className="border-destructive text-destructive">Pendiente</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end gap-6 border-t p-3 text-sm">
          <span className="text-muted-foreground">Comprobantes: <b className="text-foreground">{facturasFiltradas.length}</b></span>
          <span className="text-muted-foreground">Total: <b className="text-foreground">{formatPesos(totalFiltrado)}</b></span>
        </div>
      </div>


      <Dialog open={!!vincular} onOpenChange={(o) => !o && setVincular(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Vincular factura del empleado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Elegí la factura de compra que corresponde a esta solicitud
            {vincular?.total ? ` de ${formatPesos(vincular.total)}` : ""}.
          </p>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {(facturas ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay facturas de mano de obra cargadas. Subila desde el módulo OCR.
              </p>
            )}
            {(facturas ?? []).map((f) => (
              <button
                key={f.id}
                onClick={() => vincularFactura(f.id)}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium">{f.numero ?? "s/n"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatFecha(f.fecha)}</span>
                </span>
                <span className="font-semibold">{formatPesos(f.total)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincular(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
