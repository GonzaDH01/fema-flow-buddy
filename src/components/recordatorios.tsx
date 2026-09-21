import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MESES_LARGOS } from "@/lib/format";

export type Recordatorio = {
  id: string;
  titulo: string;
  detalle: string | null;
  categoria: string;
  dia_mes: number;
  mensual: boolean;
  fecha: string | null;
  prioridad: string;
  activo: boolean;
  es_sistema: boolean;
};

const PRIORIDADES = [
  { v: "critica", label: "Crítica", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  { v: "alta", label: "Alta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  { v: "media", label: "Media", cls: "bg-primary/10 text-primary border-primary/30" },
  { v: "baja", label: "Baja", cls: "bg-muted text-muted-foreground border-border" },
];
const prioCls = (p: string) => PRIORIDADES.find((x) => x.v === p)?.cls ?? PRIORIDADES[3].cls;
const prioLabel = (p: string) => PRIORIDADES.find((x) => x.v === p)?.label ?? p;

export function useRecordatoriosMes(anio: number, mes: number) {
  return useQuery({
    queryKey: ["fema_recordatorios", anio, mes],
    queryFn: async () => {
      const [{ data: recs }, { data: hechos }] = await Promise.all([
        supabase.from("fema_recordatorios").select("*").order("dia_mes"),
        supabase.from("fema_recordatorio_hechos").select("*").eq("anio", anio).eq("mes", mes),
      ]);
      const hechosSet = new Set(((hechos ?? []) as any[]).map((h) => h.recordatorio_id));
      const lista = ((recs ?? []) as any[]).filter((r: Recordatorio) => {
        if (!r.activo) return false;
        if (r.mensual) return true;
        if (!r.fecha) return false;
        const d = new Date(`${r.fecha}T00:00:00`);
        return d.getFullYear() === anio && d.getMonth() + 1 === mes;
      }) as Recordatorio[];
      return lista.map((r) => ({ ...r, hecho: hechosSet.has(r.id) }));
    },
  });
}

export function RecordatoriosPanel() {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "", detalle: "", categoria: "ARCA", dia_mes: "1",
    mensual: "si", fecha: "", prioridad: "media",
  });

  const { data, isLoading } = useRecordatoriosMes(anio, mes);
  const lista = data ?? [];
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;

  const pendientes = useMemo(() => lista.filter((r) => !r.hecho), [lista]);

  const invalidar = () => qc.invalidateQueries({ queryKey: ["fema_recordatorios"] });

  const marcar = async (id: string, hecho: boolean) => {
    if (hecho) {
      const { error } = await supabase.from("fema_recordatorio_hechos")
        .delete().eq("recordatorio_id", id).eq("anio", anio).eq("mes", mes);
      if (error) return toast.error(error.message);
      toast.success("Recordatorio reabierto");
    } else {
      const { error } = await (supabase.from("fema_recordatorio_hechos") as any)
        .insert({ recordatorio_id: id, anio, mes, user_id: profile?.id ?? null });
      if (error) return toast.error(error.message);
      toast.success("Marcado como hecho");
    }
    invalidar();
  };

  const eliminar = async (r: Recordatorio) => {
    if (!confirm(`¿Eliminar el recordatorio "${r.titulo}"?`)) return;
    const { error } = await supabase.from("fema_recordatorios").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Recordatorio eliminado");
    invalidar();
  };

  const guardar = async () => {
    if (!form.titulo.trim()) return toast.error("Escribí un título");
    const mensual = form.mensual === "si";
    if (!mensual && !form.fecha) return toast.error("Elegí la fecha del recordatorio");
    const { error } = await (supabase.from("fema_recordatorios") as any).insert({
      user_id: profile?.id ?? null,
      titulo: form.titulo.trim(),
      detalle: form.detalle.trim() || null,
      categoria: form.categoria,
      dia_mes: mensual ? Number(form.dia_mes) || 1 : Number(form.fecha.slice(8, 10)),
      mensual,
      fecha: mensual ? null : form.fecha,
      prioridad: form.prioridad,
    });
    if (error) return toast.error(error.message);
    toast.success("Recordatorio creado");
    setOpen(false);
    setForm({ titulo: "", detalle: "", categoria: "ARCA", dia_mes: "1", mensual: "si", fecha: "", prioridad: "media" });
    invalidar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">{pendientes.length} pendiente(s)</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nuevo recordatorio</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nuevo recordatorio</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Título</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ej: Pago de seguro de maquinaria" />
              </div>
              <div className="grid gap-2">
                <Label>Detalle (opcional)</Label>
                <Textarea value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} rows={2} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Categoría</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARCA">ARCA / Impuestos</SelectItem>
                      <SelectItem value="Operativo">Operativo</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Prioridad</Label>
                  <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>¿Se repite todos los meses?</Label>
                  <Select value={form.mensual} onValueChange={(v) => setForm({ ...form, mensual: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí, todos los meses</SelectItem>
                      <SelectItem value="no">No, una sola vez</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.mensual === "si" ? (
                  <div className="grid gap-2">
                    <Label>Día del mes</Label>
                    <Input type="number" min="1" max="31" step="1" value={form.dia_mes}
                      onChange={(e) => setForm({ ...form, dia_mes: e.target.value })} />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label>Fecha</Label>
                    <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={guardar}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando recordatorios…</div>
      ) : lista.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Sin recordatorios para este mes.</div>
      ) : (
        <div className="space-y-2">
          {lista.map((r) => {
            const vencido = esMesActual && !r.hecho && r.dia_mes < hoy.getDate();
            return (
              <div key={r.id}
                className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  r.hecho ? "border-border bg-muted/40" : vencido ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
                }`}>
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-background">
                    <span className="text-[9px] uppercase text-muted-foreground">Día</span>
                    <span className="text-sm font-bold leading-none">{r.dia_mes}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${prioCls(r.prioridad)}`}>{prioLabel(r.prioridad)}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.categoria}</span>
                      {vencido ? <span className="text-[11px] font-medium text-destructive">Vencido</span> : null}
                    </div>
                    <div className={`mt-0.5 text-sm font-medium ${r.hecho ? "line-through text-muted-foreground" : ""}`}>
                      {r.titulo}
                    </div>
                    {r.detalle ? <div className="text-xs text-muted-foreground">{r.detalle}</div> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button size="sm" variant={r.hecho ? "ghost" : "outline"} onClick={() => marcar(r.id, r.hecho)}>
                    {r.hecho ? <><Undo2 className="mr-1 h-3.5 w-3.5" /> Reabrir</> : <><Check className="mr-1 h-3.5 w-3.5" /> Hecho</>}
                  </Button>
                  {!r.es_sistema || profile?.isAdmin ? (
                    <Button size="icon" variant="ghost" onClick={() => eliminar(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        Los recordatorios mensuales se repiten automáticamente; lo marcado como hecho se guarda por mes.
      </p>
    </div>
  );
}
