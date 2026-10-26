import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Paperclip, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatPesos, formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/gonzalo")({
  head: () => ({
    meta: [
      { title: "Gonzalo — Cuenta corriente | FEMAFlow" },
      { name: "description", content: "Cuenta corriente de gastos y pagos de Gonzalo con la empresa." },
      { property: "og:title", content: "Gonzalo — Cuenta corriente | FEMAFlow" },
      { property: "og:description", content: "Gastos adelantados por Gonzalo y pagos de la empresa por cuenta de Gonzalo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

// Signo: + = la empresa le debe a Gonzalo; − = Gonzalo le debe a la empresa
const TIPOS = {
  gasto_gonzalo: { l: "Gasto pagado por Gonzalo", signo: 1 },
  devolucion_gonzalo: { l: "Devolución de Gonzalo a la empresa", signo: 1 },
  pago_empresa: { l: "Compra de Gonzalo pagada por la empresa", signo: -1 },
  reintegro_empresa: { l: "Reintegro de la empresa a Gonzalo", signo: -1 },
} as const;
type Tipo = keyof typeof TIPOS;

type Row = { id: string; fecha: string; tipo: Tipo; concepto: string; proveedor: string | null; importe: number; observaciones: string | null; adjuntos: string[] | null };
const vacio = () => ({ id: "", fecha: new Date().toISOString().slice(0, 10), tipo: "gasto_gonzalo" as Tipo, concepto: "", proveedor: "", importe: "", observaciones: "", adjuntos: [] as string[] });
const BUCKET = "documentos-compras";
const nombreArchivo = (p: string) => p.split("/").pop()!.replace(/^\d+-/, "");
const abrirAdjunto = async (path: string) => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return toast.error("No se pudo abrir el archivo");
  window.open(data.signedUrl, "_blank", "noopener");
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<ReturnType<typeof vacio> | null>(null);
  const [busca, setBusca] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (files: FileList | null) => {
    if (!files?.length || !form) return;
    setSubiendo(true);
    const nuevos: string[] = [];
    for (const f of Array.from(files)) {
      const path = `gonzalo/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (error) toast.error(`${f.name}: ${error.message}`); else nuevos.push(path);
    }
    setSubiendo(false);
    setForm((prev) => prev ? { ...prev, adjuntos: [...prev.adjuntos, ...nuevos] } : prev);
    if (nuevos.length) toast.success("Comprobante adjuntado — tocá Guardar");
  };

  const { data = [] } = useQuery({
    queryKey: ["cc_gonzalo"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_cc_gonzalo").select("*").order("fecha").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const conSaldo = useMemo(() => {
    let s = 0;
    return data.map((r) => { s += TIPOS[r.tipo].signo * Number(r.importe); return { ...r, saldo: s }; });
  }, [data]);
  const filtrados = conSaldo.filter((r) => !busca || `${r.concepto} ${r.proveedor ?? ""}`.toLowerCase().includes(busca.toLowerCase())).reverse();
  const favorG = data.filter((r) => TIPOS[r.tipo].signo > 0).reduce((a, r) => a + Number(r.importe), 0);
  const favorE = data.filter((r) => TIPOS[r.tipo].signo < 0).reduce((a, r) => a + Number(r.importe), 0);
  const saldo = favorG - favorE;

  const guardar = async () => {
    if (!form) return;
    const importe = Number(String(form.importe).replace(/\./g, "").replace(",", "."));
    if (!form.concepto.trim() || !(importe > 0)) { toast.error("Completá concepto e importe"); return; }
    const payload = { fecha: form.fecha, tipo: form.tipo, concepto: form.concepto.trim(), proveedor: form.proveedor || null, importe, observaciones: form.observaciones || null, adjuntos: form.adjuntos };
    const { error } = form.id
      ? await supabase.from("fema_cc_gonzalo").update(payload).eq("id", form.id)
      : await supabase.from("fema_cc_gonzalo").insert({ ...payload, user_id: user!.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Movimiento guardado");
    setForm(null);
    qc.invalidateQueries({ queryKey: ["cc_gonzalo"] });
  };

  const borrar = async (r: Row) => {
    if (!confirm("¿Eliminar este movimiento?")) return;
    const { error } = await supabase.from("fema_cc_gonzalo").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cc_gonzalo"] });
  };

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(conSaldo.map((r) => ({
      Fecha: r.fecha, Tipo: TIPOS[r.tipo].l, Concepto: r.concepto, Proveedor: r.proveedor ?? "",
      "A favor de Gonzalo": TIPOS[r.tipo].signo > 0 ? Number(r.importe) : 0,
      "A favor de la empresa": TIPOS[r.tipo].signo < 0 ? Number(r.importe) : 0,
      Saldo: r.saldo, Observaciones: r.observaciones ?? "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gonzalo");
    XLSX.writeFile(wb, "cc-gonzalo.xlsx");
  };

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Gonzalo — Cuenta corriente</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">Gastos que Gonzalo paga con dinero propio y compras de Gonzalo pagadas por la empresa. No mueve Caja ni Cash Flow.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportar}><FileDown className="mr-2 h-4 w-4" />Excel</Button>
          <Button onClick={() => setForm(vacio())}><Plus className="mr-2 h-4 w-4" />Nuevo movimiento</Button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">A favor de Gonzalo</p><p className="text-xl font-bold">{formatPesos(favorG)}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">A favor de la empresa</p><p className="text-xl font-bold">{formatPesos(favorE)}</p></div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className={`text-xl font-bold ${saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatPesos(Math.abs(saldo))}</p>
          <p className="text-xs text-muted-foreground">{saldo > 0 ? "La empresa le debe a Gonzalo" : saldo < 0 ? "Gonzalo le debe a la empresa" : "Cuenta saldada"}</p>
        </div>
      </div>

      <Input className="mb-3 max-w-sm" placeholder="Buscar concepto o proveedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead>
            <TableHead className="text-right">A favor Gonzalo</TableHead><TableHead className="text-right">A favor empresa</TableHead>
            <TableHead className="text-right">Saldo</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {filtrados.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin movimientos todavía.</TableCell></TableRow>}
            {filtrados.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatFecha(r.fecha)}</TableCell>
                <TableCell><Badge variant={TIPOS[r.tipo].signo > 0 ? "secondary" : "outline"}>{TIPOS[r.tipo].l}</Badge></TableCell>
                <TableCell>
                  <div>{r.concepto}</div>{r.proveedor && <div className="text-xs text-muted-foreground">{r.proveedor}</div>}
                  {(r.adjuntos ?? []).map((p) => (
                    <button key={p} type="button" onClick={() => abrirAdjunto(p)} className="mr-2 inline-flex items-center gap-1 text-xs text-primary underline">
                      <Paperclip className="h-3 w-3" />{nombreArchivo(p)}
                    </button>
                  ))}
                </TableCell>
                <TableCell className="text-right">{TIPOS[r.tipo].signo > 0 ? formatPesos(r.importe) : ""}</TableCell>
                <TableCell className="text-right">{TIPOS[r.tipo].signo < 0 ? formatPesos(r.importe) : ""}</TableCell>
                <TableCell className="text-right font-medium">{formatPesos(r.saldo)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" onClick={() => setForm({ ...r, proveedor: r.proveedor ?? "", observaciones: r.observaciones ?? "", importe: String(r.importe), adjuntos: r.adjuntos ?? [] })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => borrar(r)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3">
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPOS).map(([k, t]) => <SelectItem key={k} value={k}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              <Input placeholder="Concepto (ej: gasoil urgente, repuesto)" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              <Input placeholder="Proveedor / destinatario (opcional)" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
              <Input inputMode="decimal" placeholder="Importe" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} />
              <Input placeholder="Observaciones (opcional)" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              <div className="rounded-lg border border-dashed p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4" />{subiendo ? "Subiendo…" : "Adjuntar comprobante (factura, remito, recibo, foto)"}
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" disabled={subiendo}
                    onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
                </label>
                {form.adjuntos.map((p) => (
                  <div key={p} className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <button type="button" className="truncate text-primary underline" onClick={() => abrirAdjunto(p)}>{nombreArchivo(p)}</button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, adjuntos: form.adjuntos.filter((x) => x !== p) })}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={guardar}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
