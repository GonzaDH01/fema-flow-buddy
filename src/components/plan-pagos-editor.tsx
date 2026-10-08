import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPesos } from "@/lib/format";

type Row = {
  id?: string;
  instrumento: string;
  numero: string;
  banco: string;
  vencimiento: string;
  monto: number;
  estado: string;
  observaciones: string;
  bloqueado: boolean; // cobrado/pagado/cedido o con imputaciones: no se toca
};

const CERRADOS = new Set(["cobrado", "pagado", "cedido", "anulado"]);

export function PlanPagosEditor({
  facturaId, numero, total, esCompra, contraparte, onClose,
}: {
  facturaId: string; numero: string | null; total: number; esCompra: boolean;
  contraparte: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const col = esCompra ? "factura_compra_id" : "factura_venta_id";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [original, setOriginal] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, i] = await Promise.all([
        (supabase as any).from("fema_movimientos_pago")
          .select("id,instrumento,numero,banco,vencimiento,monto,estado,observaciones")
          .eq(col, facturaId).order("vencimiento", { ascending: true }),
        (supabase as any).from("fema_imputaciones").select("movimiento_pago_id").eq(col, facturaId),
      ]);
      if (m.error) return toast.error(m.error.message);
      const imp = new Set(((i.data ?? []) as any[]).map((x) => x.movimiento_pago_id));
      const list: Row[] = ((m.data ?? []) as any[]).map((x) => ({
        id: x.id, instrumento: x.instrumento, numero: x.numero ?? "", banco: x.banco ?? "",
        vencimiento: x.vencimiento ?? "", monto: Number(x.monto || 0), estado: x.estado,
        observaciones: x.observaciones ?? "",
        bloqueado: CERRADOS.has(x.estado) || imp.has(x.id),
      }));
      setRows(list);
      setOriginal(list.map((r) => r.id!));
    })();
  }, [facturaId, col]);

  const upd = (idx: number, k: keyof Row, v: any) =>
    setRows((r) => r!.map((x, i) => (i === idx ? { ...x, [k]: v } : x)));

  const suma = (rows ?? []).reduce((a, r) => a + Number(r.monto || 0), 0);
  const dif = Math.round((total - suma) * 100) / 100;

  const agregar = () => {
    const last = rows?.[rows.length - 1]?.vencimiento;
    let venc = new Date().toISOString().slice(0, 10);
    if (last) { const d = new Date(`${last}T00:00:00`); d.setMonth(d.getMonth() + 1); venc = d.toISOString().slice(0, 10); }
    setRows((r) => [...(r ?? []), {
      instrumento: "echeq", numero: "", banco: "", vencimiento: venc,
      monto: dif > 0 ? dif : 0, estado: "en_cartera", observaciones: "", bloqueado: false,
    }]);
  };

  const renumerar = (list: Row[]) =>
    list.map((r, i) => {
      const obs = r.observaciones.replace(/Cuota \d+\/\d+/i, "").trim();
      return { ...r, observaciones: `Cuota ${i + 1}/${list.length}${obs ? " · " + obs : ""}`.replace(/ · $/, "") };
    });

  const guardar = async () => {
    if (!rows) return;
    for (const r of rows) {
      if (r.bloqueado) continue;
      if (!r.vencimiento) return toast.error("Todas las cuotas necesitan fecha");
      if (!(Number(r.monto) > 0)) return toast.error("Todas las cuotas necesitan monto mayor a 0");
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const final = renumerar(rows);
      const keep = new Set(final.filter((r) => r.id).map((r) => r.id!));
      const borrar = original.filter((id) => !keep.has(id));
      if (borrar.length) {
        const { error } = await (supabase as any).from("fema_movimientos_pago").delete().in("id", borrar);
        if (error) throw error;
      }
      for (const r of final) {
        if (r.bloqueado) {
          await (supabase as any).from("fema_movimientos_pago").update({ observaciones: r.observaciones }).eq("id", r.id);
          continue;
        }
        const d = new Date(`${r.vencimiento}T00:00:00`);
        const payload: any = {
          instrumento: r.instrumento, numero: r.numero || null, banco: r.banco || null,
          vencimiento: r.vencimiento, monto: Number(r.monto), estado: r.estado,
          observaciones: r.observaciones, contraparte,
        };
        if (r.id) {
          const { error } = await (supabase as any).from("fema_movimientos_pago").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from("fema_movimientos_pago").insert({
            ...payload, user_id: u.user?.id, [col]: facturaId,
            direccion: esCompra ? "pago" : "cobro",
            tipo_movimiento: esCompra ? "pago_proveedor" : "cobro_cliente",
            fecha_emision: new Date().toISOString().slice(0, 10),
            anio: d.getFullYear(), mes: d.getMonth() + 1,
          });
          if (error) throw error;
        }
      }
      toast.success("Plan de pagos actualizado");
      for (const k of ["fema_cuentas_corrientes", "fema_movimientos_pago", "cashflow-matrix", "tesoreria"]) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries();
      onClose();
    } catch (e: any) {
      toast.error("No se pudo guardar: " + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <div className="text-base font-semibold">Plan de pagos · {contraparte}</div>
            <div className="text-xs text-muted-foreground">Comprobante {numero ?? "s/n"}</div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right text-xs">
            <div><div className="text-muted-foreground">Total factura</div><div className="font-semibold">{formatPesos(total)}</div></div>
            <div><div className="text-muted-foreground">Suma cuotas</div><div className="font-semibold">{formatPesos(suma)}</div></div>
            <div><div className="text-muted-foreground">Diferencia</div>
              <div className={Math.abs(dif) < 0.01 ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                {Math.abs(dif) < 0.01 ? "Cuadra" : formatPesos(dif)}
              </div></div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!rows ? <div className="text-sm text-muted-foreground">Cargando…</div> : (
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-1 py-1 text-left">#</th>
                  <th className="px-1 py-1 text-left">Medio</th>
                  <th className="px-1 py-1 text-left">Nº e-cheq</th>
                  <th className="px-1 py-1 text-left">Banco</th>
                  <th className="px-1 py-1 text-left">Fecha de pago</th>
                  <th className="px-1 py-1 text-right">Monto</th>
                  <th className="px-1 py-1 text-left">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `n${i}`} className="border-t border-border/40">
                    <td className="px-1 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-1 py-1">
                      <select disabled={r.bloqueado} value={r.instrumento} onChange={(e) => upd(i, "instrumento", e.target.value)}
                        className="h-8 rounded-md border bg-background px-2">
                        <option value="echeq">E-cheq</option>
                        <option value="cheque_fisico">Cheque físico</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                      </select>
                    </td>
                    <td className="px-1 py-1"><Input disabled={r.bloqueado} className="h-8 text-xs" value={r.numero} onChange={(e) => upd(i, "numero", e.target.value)} /></td>
                    <td className="px-1 py-1"><Input disabled={r.bloqueado} className="h-8 text-xs" value={r.banco} onChange={(e) => upd(i, "banco", e.target.value)} /></td>
                    <td className="px-1 py-1"><Input disabled={r.bloqueado} type="date" className="h-8 text-xs" value={r.vencimiento} onChange={(e) => upd(i, "vencimiento", e.target.value)} /></td>
                    <td className="px-1 py-1"><Input disabled={r.bloqueado} type="number" step="0.01" className="h-8 text-right text-xs" value={r.monto} onChange={(e) => upd(i, "monto", e.target.value)} /></td>
                    <td className="px-1 py-1">
                      {r.bloqueado ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" />{r.estado}</span>
                      ) : (
                        <select value={r.estado} onChange={(e) => upd(i, "estado", e.target.value)} className="h-8 rounded-md border bg-background px-2">
                          <option value="en_cartera">En cartera</option>
                          <option value="pendiente">Pendiente</option>
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {!r.bloqueado && (
                        <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}
                          className="rounded p-1.5 text-destructive hover:bg-muted" aria-label="Quitar cuota">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={agregar}>
            <Plus className="mr-1 h-4 w-4" /> Agregar cuota {dif > 0.01 ? `(${formatPesos(dif)})` : ""}
          </Button>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Las cuotas ya cobradas quedan bloqueadas. Los cambios se reflejan en Cash Flow, Tesorería, cartera de e-cheqs y el detalle para el cliente.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={saving || !rows} onClick={guardar}>{saving ? "Guardando…" : "Guardar plan"}</Button>
        </div>
      </div>
    </div>
  );
}
