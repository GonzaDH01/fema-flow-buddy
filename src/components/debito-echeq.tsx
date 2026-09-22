// Confirmación de débito bancario de echeqs / cheques propios emitidos.
// Se usa tanto desde Medios de Pago como desde el Centro de Alertas para
// resolver el vencimiento en un solo paso (elegir cuenta → descontar saldo).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPesos, formatFecha } from "@/lib/format";

const sb = supabase as any;

export type MovDebito = {
  id: string;
  monto: number | string | null;
  contraparte?: string | null;
  numero?: string | null;
  vencimiento?: string | null;
};

export function useCuentasBancarias() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fema_cuentas_bancarias", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_cuentas_bancarias")
        .select("*").order("banco", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Marca uno o varios documentos propios como debitados de la cuenta elegida. */
export async function confirmarDebitos(ids: string[], cuentaId: string) {
  const errores: string[] = [];
  for (const id of ids) {
    const { error } = await sb.rpc("fema_impactar_caja", {
      _mov_id: id, _nuevo_estado: "pagado", _cuenta_id: cuentaId, _es_pago: true,
    });
    if (error) errores.push(error.message);
  }
  return errores;
}

export function DebitoDialog({ movs, onClose, onDone }: {
  movs: MovDebito[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { data: cuentas = [] } = useCuentasBancarias();
  const [cuentaId, setCuentaId] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const total = movs.reduce((s, m) => s + Number(m.monto ?? 0), 0);

  const confirmar = async () => {
    if (!cuentaId) { toast.error("Elegí la cuenta bancaria de la que salió el dinero."); return; }
    setGuardando(true);
    const errores = await confirmarDebitos(movs.map(m => m.id), cuentaId);
    setGuardando(false);
    const cta = cuentas.find((c: any) => c.id === cuentaId);
    if (errores.length) {
      toast.error(`No se pudieron debitar ${errores.length} documento(s): ${errores[0]}`);
    } else {
      toast.success(
        `${movs.length} documento(s) debitado(s) de ${cta?.banco ?? "la cuenta"} por ${formatPesos(total)}.`,
      );
    }
    for (const key of [
      ["fema_movimientos_pago"], ["fema_cuentas_bancarias"], ["fema_caja_mov"],
      ["fema_alertas"], ["fema_facturas_compra"], ["fema_tesoreria"], ["cashflow-matrix"],
    ]) qc.invalidateQueries({ queryKey: key });
    onDone?.();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar débito bancario</DialogTitle>
          <DialogDescription>
            Elegí la cuenta de la que salió el dinero. El saldo se descuenta al instante y el
            documento queda como pagado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-52 space-y-1 overflow-auto rounded-md border border-border p-2 text-sm">
            {movs.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {m.contraparte || "Sin beneficiario"}
                  {m.numero ? <span className="ml-1 font-mono text-xs text-muted-foreground">Nº {m.numero}</span> : null}
                  {m.vencimiento ? <span className="ml-1 text-xs text-muted-foreground">· {formatFecha(m.vencimiento)}</span> : null}
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {formatPesos(Number(m.monto ?? 0))}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total a debitar</span>
            <span className="tabular-nums">{formatPesos(total)}</span>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Cuenta bancaria</label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger><SelectValue placeholder="Elegí la cuenta" /></SelectTrigger>
              <SelectContent>
                {cuentas.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.banco}{c.alias ? ` · ${c.alias}` : ""} — saldo {formatPesos(Number(c.saldo || 0))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={guardando || !cuentaId}>
            {guardando ? "Registrando…" : "Confirmar débito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
