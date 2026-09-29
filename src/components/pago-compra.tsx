import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatFecha } from "@/lib/format";

const sb = supabase as any;
const hoyISO = () => new Date().toISOString().slice(0, 10);

const INSTRUMENTOS = [
  { v: "transferencia", l: "Transferencia" },
  { v: "efectivo", l: "Efectivo" },
  { v: "echeq", l: "E-cheq" },
  { v: "cheque_fisico", l: "Cheque físico" },
  { v: "otro", l: "Otro" },
];

export type FacturaPago = {
  id: string;
  numero: string | null;
  total: number;
  fecha: string;
  proveedor: string;
};

type Mov = {
  id: string;
  monto: number;
  estado: string;
  instrumento: string;
  numero: string | null;
  banco: string | null;
  vencimiento: string | null;
  fecha_emision: string | null;
  observaciones: string | null;
};

/**
 * Registro de pagos parciales (entregas a cuenta) sobre una factura de compra.
 * - Muestra el saldo real: total − pagado confirmado − documentos programados.
 * - Permite confirmar o eliminar compromisos que quedaron "en cartera" y bloquean el saldo.
 * - Cada pago puede impactar en una cuenta bancaria (Tesorería / Cash Flow) o quedar solo asentado.
 */
export function PagoCompraDialog({ factura, onClose }: { factura: FacturaPago; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [instrumento, setInstrumento] = useState("transferencia");
  const [cuentaId, setCuentaId] = useState<string>("__ninguna");
  const [numero, setNumero] = useState("");
  const [obs, setObs] = useState("");
  const [programado, setProgramado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const movsQ = useQuery({
    queryKey: ["pago_compra_movs", factura.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("fema_movimientos_pago")
        .select("id,monto,estado,instrumento,numero,banco,vencimiento,fecha_emision,observaciones")
        .eq("factura_compra_id", factura.id)
        .order("fecha_emision");
      if (error) throw error;
      return (data ?? []) as Mov[];
    },
  });

  const impsQ = useQuery({
    queryKey: ["pago_compra_imps", factura.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("fema_imputaciones").select("monto").eq("factura_compra_id", factura.id);
      if (error) throw error;
      return (data ?? []) as { monto: number }[];
    },
  });

  const { data: cuentas } = useQuery({
    queryKey: ["fema_cuentas_bancarias"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("fema_cuentas_bancarias").select("id,banco,alias,saldo,activa").order("banco");
      if (error) throw error;
      return (data ?? []) as { id: string; banco: string; alias: string | null; saldo: number; activa: boolean }[];
    },
  });

  const movs = movsQ.data ?? [];
  const pagadoDirecto = movs
    .filter((m) => m.estado === "pagado" || m.estado === "cedido")
    .reduce((s, m) => s + Number(m.monto), 0);
  const imputado = (impsQ.data ?? []).reduce((s, i) => s + Number(i.monto), 0);
  const pagado = pagadoDirecto + imputado;
  const enCartera = movs.filter((m) => m.estado === "en_cartera");
  const montoCartera = enCartera.reduce((s, m) => s + Number(m.monto), 0);
  const saldoLibre = Math.max(0, Number(factura.total) - pagado - montoCartera);
  const saldoSinProgramar = Math.max(0, Number(factura.total) - pagado);

  const montoNum = Number(monto) || 0;
  const excede = montoNum > saldoSinProgramar + 0.01;

  const refrescar = async () => {
    await Promise.all([movsQ.refetch(), impsQ.refetch()]);
    for (const k of [
      "fema_pagos_por_compra", "fema_facturas_compra", "fema_movimientos_pago",
      "fema_cuentas_bancarias", "fema_caja_mov", "cashflow-matrix", "dashboard",
      "fema_facturas_compra_pendientes",
    ]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const registrar = async () => {
    if (!(montoNum > 0)) { toast.error("Ingresá el importe a pagar"); return; }
    setSaving(true);
    try {
      const f = new Date(`${fecha}T00:00:00`);
      const { data: creado, error } = await sb.from("fema_movimientos_pago").insert({
        user_id: user!.id,
        instrumento,
        direccion: "pago",
        tipo_movimiento: "pago_proveedor",
        fecha_emision: fecha,
        vencimiento: fecha,
        numero: numero || null,
        banco: cuentaId !== "__ninguna" ? (cuentas ?? []).find((c) => c.id === cuentaId)?.banco ?? null : null,
        contraparte: factura.proveedor || null,
        monto: montoNum,
        estado: "en_cartera",
        observaciones: obs || (montoNum < saldoSinProgramar - 0.01 ? "Entrega a cuenta" : null),
        factura_compra_id: factura.id,
        anio: f.getFullYear(),
        mes: f.getMonth() + 1,
      }).select("id").single();
      if (error) throw error;

      if (!programado) {
        const { error: rpcErr } = await sb.rpc("fema_impactar_caja", {
          _mov_id: creado.id,
          _nuevo_estado: "pagado",
          _cuenta_id: cuentaId !== "__ninguna" ? cuentaId : null,
          _es_pago: true,
        });
        if (rpcErr) throw rpcErr;
      } else {
        await sb.rpc("fema_reconciliar_factura", { _factura_id: factura.id, _tipo: "compra" });
      }
      toast.success(programado ? "Pago programado registrado" : `Pago de ${formatPesos(montoNum)} registrado`);
      setMonto(""); setNumero(""); setObs("");
      await refrescar();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo registrar el pago");
    } finally {
      setSaving(false);
    }
  };

  const confirmarDebito = async (m: Mov, cta: string | null) => {
    setConfirmando(m.id);
    try {
      const { error } = await sb.rpc("fema_impactar_caja", {
        _mov_id: m.id, _nuevo_estado: "pagado", _cuenta_id: cta, _es_pago: true,
      });
      if (error) throw error;
      toast.success("Débito confirmado");
      await refrescar();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo confirmar");
    } finally {
      setConfirmando(null);
    }
  };

  const eliminarMov = async (m: Mov) => {
    if (!confirm(`¿Eliminar este movimiento de ${formatPesos(m.monto)}? El saldo de la factura vuelve a quedar disponible.`)) return;
    setConfirmando(m.id);
    try {
      await sb.from("fema_caja_mov").delete().eq("movimiento_pago_id", m.id);
      const { error } = await sb.from("fema_movimientos_pago").delete().eq("id", m.id);
      if (error) throw error;
      await sb.rpc("fema_reconciliar_factura", { _factura_id: factura.id, _tipo: "compra" });
      toast.success("Movimiento eliminado");
      await refrescar();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo eliminar");
    } finally {
      setConfirmando(null);
    }
  };

  const cuentasActivas = useMemo(() => (cuentas ?? []).filter((c) => c.activa !== false), [cuentas]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            Registrar pago · {factura.proveedor}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Total factura</p>
            <p className="font-semibold">{formatPesos(Number(factura.total))}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Pagado</p>
            <p className="font-semibold text-primary">{formatPesos(pagado)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Programado</p>
            <p className="font-semibold text-amber-500">{formatPesos(montoCartera)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Saldo libre</p>
            <p className="font-semibold text-accent">{formatPesos(saldoLibre)}</p>
          </div>
        </div>

        {enCartera.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-500">
              Compromisos programados ({enCartera.length}) — ocupan {formatPesos(montoCartera)} del saldo
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Confirmá los que ya se debitaron del banco o eliminá los que no correspondan para liberar saldo.
            </p>
            <div className="space-y-1.5">
              {enCartera.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
                  <div>
                    <span className="font-semibold">{formatPesos(Number(m.monto))}</span>
                    <span className="text-muted-foreground">
                      {" · "}{INSTRUMENTOS.find((i) => i.v === m.instrumento)?.l ?? m.instrumento}
                      {m.banco ? ` · ${m.banco}` : ""}
                      {m.vencimiento ? ` · vence ${formatFecha(m.vencimiento)}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 border-primary/40 text-primary"
                      disabled={confirmando === m.id}
                      onClick={() => confirmarDebito(m, cuentaId !== "__ninguna" ? cuentaId : null)}>
                      {confirmando === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Confirmar débito
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 w-7 p-0"
                      disabled={confirmando === m.id} onClick={() => eliminarMov(m)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {movs.filter((m) => m.estado === "pagado" || m.estado === "cedido").length > 0 && (
          <div className="rounded-md border border-border p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Pagos ya realizados</p>
            <div className="space-y-1">
              {movs.filter((m) => m.estado === "pagado" || m.estado === "cedido").map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {formatFecha(m.vencimiento ?? m.fecha_emision ?? "")} ·{" "}
                    {INSTRUMENTOS.find((i) => i.v === m.instrumento)?.l ?? m.instrumento}
                    {m.numero ? ` Nº ${m.numero}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-primary">{formatPesos(Number(m.monto))}</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground"
                      disabled={confirmando === m.id} onClick={() => eliminarMov(m)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Nueva entrega a cuenta</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Importe a pagar ($)">
              <Input type="number" step="0.01" placeholder="0,00" value={monto}
                onChange={(e) => setMonto(e.target.value)} />
            </FormField>
            <FormField label="Fecha del pago">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2">
            {saldoLibre > 0.01 && (
              <Button type="button" size="sm" variant="outline"
                onClick={() => setMonto(String(saldoLibre.toFixed(2)))}>
                Saldo libre {formatPesos(saldoLibre)}
              </Button>
            )}
            {saldoSinProgramar > 0.01 && Math.abs(saldoSinProgramar - saldoLibre) > 0.01 && (
              <Button type="button" size="sm" variant="outline"
                onClick={() => setMonto(String(saldoSinProgramar.toFixed(2)))}>
                Saldo total impago {formatPesos(saldoSinProgramar)}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Medio de pago">
              <Select value={instrumento} onValueChange={setInstrumento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTRUMENTOS.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Cuenta / caja de origen">
              <Select value={cuentaId} onValueChange={setCuentaId}>
                <SelectTrigger><SelectValue placeholder="Sin impacto en caja" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguna">Sin impacto en caja</SelectItem>
                  {cuentasActivas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.banco}{c.alias ? ` · ${c.alias}` : ""} ({formatPesos(Number(c.saldo || 0))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="N° comprobante / transferencia">
              <Input placeholder="Opcional" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </FormField>
            <FormField label="Observaciones">
              <Input placeholder="Ej: entrega a cuenta" value={obs} onChange={(e) => setObs(e.target.value)} />
            </FormField>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2.5 text-sm">
            <Checkbox checked={programado} onCheckedChange={(c) => setProgramado(c === true)} />
            <span>
              <span className="font-medium">Todavía no se debitó (pago programado)</span>
              <span className="block text-xs text-muted-foreground">
                Dejalo sin marcar si el dinero ya salió del banco o de caja.
              </span>
            </span>
          </label>

          {excede && (
            <p className="text-xs text-amber-500">
              El importe supera el saldo impago de {formatPesos(saldoSinProgramar)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Badge variant="outline" className="mr-auto self-center text-xs">
            Factura {factura.numero ?? "s/n"} · {formatFecha(factura.fecha)}
          </Badge>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={registrar} disabled={saving || !(montoNum > 0)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
