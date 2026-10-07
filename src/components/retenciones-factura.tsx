import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sb = supabase as any;
export const TIPO_RET_LABEL: Record<string, string> = {
  iibb: "IIBB", ganancias: "Ganancias", iva: "IVA", suss: "SUSS",
};

/** Certificados de retención sufridos en una factura de venta.
 * Cada certificado crea un cobro "retencion" (cancela cuenta corriente) que NO impacta bancos. */
export function RetencionesFacturaDialog({ factura, clienteNombre, onClose }: {
  factura: { id: string; numero: string | null; total: number; fecha: string };
  clienteNombre?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const hoy = new Date().toISOString().split("T")[0];
  const [tipo, setTipo] = useState("iibb");
  const [jurisdiccion, setJurisdiccion] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [base, setBase] = useState<number>(0);
  const [alicuota, setAlicuota] = useState<number>(0);
  const [importe, setImporte] = useState<number>(0);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const key = ["fema_retenciones_venta", factura.id];
  const { data: rets = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from("fema_retenciones_venta").select("*")
        .eq("factura_venta_id", factura.id).order("fecha");
      if (error) throw error;
      return data as any[];
    },
  });
  const total = rets.reduce((a, r) => a + Number(r.importe), 0);

  const calc = (b: number, a: number) => { if (b > 0 && a > 0) setImporte(Math.round(b * a) / 100); };

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["fema_retenciones_venta"] });
    qc.invalidateQueries({ queryKey: ["fema_movimientos_pago"] });
    qc.invalidateQueries({ queryKey: ["fema_cuentas_corrientes"] });
    qc.invalidateQueries({ queryKey: ["fema_facturas_venta"] });
  };

  const guardar = async () => {
    if (!user) return;
    if (!numero.trim()) return toast.error("Ingresá el número de certificado");
    if (!(importe > 0)) return toast.error("Ingresá el importe retenido");
    setSaving(true);
    try {
      let archivo_path: string | null = null;
      if (archivo) {
        const ext = archivo.name.split(".").pop() ?? "pdf";
        archivo_path = `retenciones/${factura.id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("facturas-img").upload(archivo_path, archivo);
        if (up.error) throw up.error;
      }
      const d = new Date(fecha + "T12:00:00");
      const { data: mov, error: e1 } = await sb.from("fema_movimientos_pago").insert({
        user_id: user.id, instrumento: "retencion", direccion: "cobro", tipo_movimiento: "cobro_cliente",
        estado: "cobrado", monto: importe, fecha_emision: fecha, vencimiento: fecha,
        anio: d.getFullYear(), mes: d.getMonth() + 1, numero: numero.trim(),
        contraparte: clienteNombre ?? null, factura_venta_id: factura.id,
        observaciones: `Retención ${TIPO_RET_LABEL[tipo]}${jurisdiccion ? ` ${jurisdiccion}` : ""} — Cert. ${numero.trim()} (no impacta banco)`,
      }).select("id").single();
      if (e1) throw e1;
      const { error: e2 } = await sb.from("fema_retenciones_venta").insert({
        user_id: user.id, factura_venta_id: factura.id, movimiento_pago_id: mov.id,
        tipo, jurisdiccion: jurisdiccion || null, numero_certificado: numero.trim(), fecha,
        base_imponible: base || 0, alicuota: alicuota || 0, importe, archivo_path,
      });
      if (e2) { await sb.from("fema_movimientos_pago").delete().eq("id", mov.id); throw e2; }
      toast.success("Certificado de retención registrado");
      setNumero(""); setBase(0); setAlicuota(0); setImporte(0); setArchivo(null); setJurisdiccion("");
      refrescar();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const eliminar = async (r: any) => {
    if (!confirm(`¿Eliminar certificado ${r.numero_certificado}?`)) return;
    if (r.movimiento_pago_id) await sb.from("fema_movimientos_pago").delete().eq("id", r.movimiento_pago_id);
    const { error } = await sb.from("fema_retenciones_venta").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    if (r.archivo_path) await supabase.storage.from("facturas-img").remove([r.archivo_path]);
    toast.success("Certificado eliminado");
    refrescar();
  };

  const ver = async (path: string) => {
    const { data, error } = await supabase.storage.from("facturas-img").createSignedUrl(path, 600);
    if (error || !data) return toast.error("No se pudo abrir el archivo");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Certificados de retención — Factura {factura.numero ?? "s/n"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {clienteNombre} · Total factura {formatPesos(Number(factura.total))}. La retención cancela la cuenta corriente del cliente pero <b>no suma al saldo del banco</b> (es crédito fiscal).
        </p>

        <Table>
          <TableHeader><TableRow>
            <TableHead>Fecha</TableHead><TableHead>Impuesto</TableHead><TableHead>Nº certificado</TableHead>
            <TableHead className="text-right">Alíc.</TableHead><TableHead className="text-right">Importe</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rets.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Sin certificados cargados</TableCell></TableRow>
            ) : rets.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatFecha(r.fecha)}</TableCell>
                <TableCell>{TIPO_RET_LABEL[r.tipo]}{r.jurisdiccion ? ` · ${r.jurisdiccion}` : ""}</TableCell>
                <TableCell className="font-mono text-xs">{r.numero_certificado}</TableCell>
                <TableCell className="text-right">{Number(r.alicuota) ? `${r.alicuota}%` : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{formatPesos(Number(r.importe))}</TableCell>
                <TableCell className="text-right">
                  {r.archivo_path && <Button size="icon" variant="ghost" title="Ver certificado" onClick={() => ver(r.archivo_path)}><FileText className="h-4 w-4 text-primary" /></Button>}
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => eliminar(r)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rets.length > 0 && (
              <TableRow><TableCell colSpan={4} className="text-right font-medium">Total retenido</TableCell>
                <TableCell className="text-right font-bold">{formatPesos(total)}</TableCell><TableCell /></TableRow>
            )}
          </TableBody>
        </Table>

        <div className="rounded-md border p-3 space-y-3">
          <p className="text-sm font-medium">Nuevo certificado</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Impuesto">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iibb">Ingresos Brutos</SelectItem>
                  <SelectItem value="ganancias">Ganancias (RG 830)</SelectItem>
                  <SelectItem value="iva">IVA (RG 2854)</SelectItem>
                  <SelectItem value="suss">SUSS</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Jurisdicción / régimen"><Input placeholder="Ej: Córdoba" value={jurisdiccion} onChange={(e) => setJurisdiccion(e.target.value)} /></FormField>
            <FormField label="Nº certificado"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></FormField>
            <FormField label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></FormField>
            <FormField label="Base imponible"><Input type="number" step="0.01" value={base || ""} onChange={(e) => { const v = Number(e.target.value); setBase(v); calc(v, alicuota); }} /></FormField>
            <FormField label="Alícuota %"><Input type="number" step="0.01" value={alicuota || ""} onChange={(e) => { const v = Number(e.target.value); setAlicuota(v); calc(base, v); }} /></FormField>
            <FormField label="Importe retenido"><Input type="number" step="0.01" value={importe || ""} onChange={(e) => setImporte(Number(e.target.value))} /></FormField>
            <FormField label="Certificado (PDF / imagen)">
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Registrar certificado"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
