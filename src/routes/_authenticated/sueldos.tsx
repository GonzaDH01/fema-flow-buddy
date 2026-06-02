import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileDown, Users as UsersIcon, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Pagination, usePagination } from "@/components/pagination";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/sueldos")({
  component: SueldosPage,
});

type Empleado = Database["public"]["Tables"]["empleados"]["Row"];
type Recibo = Database["public"]["Tables"]["recibos_sueldo"]["Row"];
type Concepto = Database["public"]["Tables"]["recibo_conceptos"]["Row"];
type EstadoRecibo = Database["public"]["Enums"]["estado_recibo"];
type TipoConcepto = Database["public"]["Enums"]["tipo_concepto"];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

const ESTADOS: { value: EstadoRecibo; label: string; variant: "outline" | "default" | "secondary" | "destructive" }[] = [
  { value: "borrador", label: "Borrador", variant: "outline" },
  { value: "pagado", label: "Pagado", variant: "default" },
  { value: "anulado", label: "Anulado", variant: "destructive" },
];

function SueldosPage() {
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Sueldos y nómina</h1>
        <p className="mt-1 text-muted-foreground">Empleados, recibos de sueldo y conceptos.</p>
      </header>

      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTrigger value="empleados" className="gap-2"><UsersIcon className="h-4 w-4" /> Empleados</TabsTrigger>
          <TabsTrigger value="recibos" className="gap-2"><Wallet className="h-4 w-4" /> Recibos</TabsTrigger>
        </TabsList>
        <TabsContent value="empleados" className="mt-4"><EmpleadosTab /></TabsContent>
        <TabsContent value="recibos" className="mt-4"><RecibosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Empleados ============
function EmpleadosTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const emptyEmp = {
    legajo: "", nombre: "", apellido: "", cuil: "", email: "", telefono: "",
    fecha_ingreso: new Date().toISOString().slice(0, 10), cargo: "", sueldo_basico: 0, activo: true, notas: "",
  };
  const [form, setForm] = useState(emptyEmp);

  const { data: empleados = [], isLoading } = useQuery({
    queryKey: ["empleados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empleados").select("*").order("apellido");
      if (error) throw error;
      return data as Empleado[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No autenticado");
      const { error } = await supabase.from("empleados").insert({ ...form, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empleados"] });
      setOpen(false); setForm(emptyEmp); toast.success("Empleado creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empleados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["empleados"] }); toast.success("Eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { page, setPage, totalPages, paged, total, pageSize } = usePagination(empleados, 15);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo empleado</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Alta de empleado</DialogTitle></DialogHeader>
            <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <Field label="Legajo *"><Input required value={form.legajo} onChange={(e) => setForm({ ...form, legajo: e.target.value })} /></Field>
              <Field label="CUIL"><Input value={form.cuil} onChange={(e) => setForm({ ...form, cuil: e.target.value })} placeholder="20-12345678-3" /></Field>
              <Field label="Nombre *"><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
              <Field label="Apellido *"><Input required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Teléfono"><Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
              <Field label="Fecha de ingreso"><Input type="date" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} /></Field>
              <Field label="Cargo"><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></Field>
              <Field label="Sueldo básico"><Input type="number" step="0.01" value={form.sueldo_basico} onChange={(e) => setForm({ ...form, sueldo_basico: Number(e.target.value) })} /></Field>
              <Field label="Estado">
                <Select value={form.activo ? "1" : "0"} onValueChange={(v) => setForm({ ...form, activo: v === "1" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Activo</SelectItem>
                    <SelectItem value="0">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="col-span-2"><Field label="Notas"><Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field></div>
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : empleados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center text-muted-foreground">Sin empleados.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Legajo</th>
                <th className="px-4 py-3">Apellido y nombre</th>
                <th className="px-4 py-3">CUIL</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3 text-right">Sueldo básico</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{e.legajo}</td>
                  <td className="px-4 py-3">{e.apellido}, {e.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.cuil ?? "—"}</td>
                  <td className="px-4 py-3">{e.cargo ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(Number(e.sueldo_basico))}</td>
                  <td className="px-4 py-3"><Badge variant={e.activo ? "default" : "outline"}>{e.activo ? "Activo" : "Inactivo"}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar empleado?")) remove.mutate(e.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ============ Recibos ============
type ConceptoRow = { tipo: TipoConcepto; descripcion: string; monto: number };

function RecibosTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empleados").select("*").eq("activo", true).order("apellido");
      if (error) throw error;
      return data as Empleado[];
    },
  });

  const { data: recibos = [], isLoading } = useQuery({
    queryKey: ["recibos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recibos_sueldo").select("*").order("periodo", { ascending: false });
      if (error) throw error;
      return data as Recibo[];
    },
  });

  const empById = useMemo(() => Object.fromEntries(empleados.map((e) => [e.id, e])), [empleados]);

  const [form, setForm] = useState({
    empleado_id: "",
    periodo: `${new Date().toISOString().slice(0, 7)}-01`,
    fecha_pago: "",
    notas: "",
    estado: "borrador" as EstadoRecibo,
  });
  const [conceptos, setConceptos] = useState<ConceptoRow[]>([
    { tipo: "haber", descripcion: "Sueldo básico", monto: 0 },
  ]);

  const totals = useMemo(() => {
    const haberes = conceptos.filter((c) => c.tipo === "haber").reduce((s, c) => s + Number(c.monto || 0), 0);
    const descuentos = conceptos.filter((c) => c.tipo === "descuento").reduce((s, c) => s + Number(c.monto || 0), 0);
    return { haberes, descuentos, neto: haberes - descuentos };
  }, [conceptos]);

  const onPickEmp = (id: string) => {
    const emp = empById[id];
    setForm((f) => ({ ...f, empleado_id: id }));
    if (emp) {
      setConceptos([{ tipo: "haber", descripcion: "Sueldo básico", monto: Number(emp.sueldo_basico) }]);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No autenticado");
      if (!form.empleado_id) throw new Error("Seleccioná un empleado");
      const { data: r, error } = await supabase
        .from("recibos_sueldo")
        .insert({
          empleado_id: form.empleado_id,
          periodo: form.periodo,
          fecha_pago: form.fecha_pago || null,
          sueldo_bruto: totals.haberes,
          total_descuentos: totals.descuentos,
          sueldo_neto: totals.neto,
          estado: form.estado,
          notas: form.notas || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const filas = conceptos.filter((c) => c.descripcion && c.monto > 0);
      if (filas.length > 0) {
        const { error: e2 } = await supabase
          .from("recibo_conceptos")
          .insert(filas.map((c) => ({ ...c, recibo_id: r.id, created_by: user.id })));
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      setOpen(false);
      setConceptos([{ tipo: "haber", descripcion: "Sueldo básico", monto: 0 }]);
      toast.success("Recibo creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recibos_sueldo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recibos"] }); toast.success("Eliminado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { page, setPage, totalPages, paged, total, pageSize } = usePagination(recibos, 15);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo recibo</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Liquidación de sueldo</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="col-span-2"><Field label="Empleado *">
                  <Select value={form.empleado_id} onValueChange={onPickEmp}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {empleados.map((e) => <SelectItem key={e.id} value={e.id}>{e.apellido}, {e.nombre} ({e.legajo})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field></div>
                <Field label="Período"><Input type="month" value={form.periodo.slice(0, 7)} onChange={(e) => setForm({ ...form, periodo: `${e.target.value}-01` })} /></Field>
                <Field label="Fecha de pago"><Input type="date" value={form.fecha_pago} onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })} /></Field>
              </div>

              <section className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">Conceptos</h3>
                  <Button type="button" size="sm" variant="outline" className="gap-1"
                    onClick={() => setConceptos([...conceptos, { tipo: "haber", descripcion: "", monto: 0 }])}>
                    <Plus className="h-3 w-3" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {conceptos.map((c, i) => (
                    <div key={i} className="grid grid-cols-[120px_1fr_140px_40px] gap-2">
                      <Select value={c.tipo} onValueChange={(v) => {
                        const copy = [...conceptos]; copy[i] = { ...copy[i], tipo: v as TipoConcepto }; setConceptos(copy);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="haber">Haber</SelectItem>
                          <SelectItem value="descuento">Descuento</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Descripción" value={c.descripcion} onChange={(e) => {
                        const copy = [...conceptos]; copy[i] = { ...copy[i], descripcion: e.target.value }; setConceptos(copy);
                      }} />
                      <Input type="number" step="0.01" placeholder="Monto" value={c.monto} onChange={(e) => {
                        const copy = [...conceptos]; copy[i] = { ...copy[i], monto: Number(e.target.value) }; setConceptos(copy);
                      }} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setConceptos(conceptos.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="grid grid-cols-2 gap-y-1">
                  <span className="text-muted-foreground">Total haberes</span><span className="text-right">{fmt(totals.haberes)}</span>
                  <span className="text-muted-foreground">Total descuentos</span><span className="text-right">-{fmt(totals.descuentos)}</span>
                  <span className="border-t border-border pt-1 font-semibold">Neto a pagar</span>
                  <span className="border-t border-border pt-1 text-right font-semibold">{fmt(totals.neto)}</span>
                </div>
              </div>

              <Field label="Notas"><Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>

              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Guardando..." : "Guardar recibo"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : recibos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center text-muted-foreground">Sin recibos.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3 text-right">Bruto</th>
                <th className="px-4 py-3 text-right">Descuentos</th>
                <th className="px-4 py-3 text-right">Neto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const emp = empById[r.empleado_id];
                const est = ESTADOS.find((e) => e.value === r.estado)!;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.periodo.slice(0, 7)}</td>
                    <td className="px-4 py-3">{emp ? `${emp.apellido}, ${emp.nombre}` : "—"}</td>
                    <td className="px-4 py-3 text-right">{fmt(Number(r.sueldo_bruto))}</td>
                    <td className="px-4 py-3 text-right text-destructive">-{fmt(Number(r.total_descuentos))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(Number(r.sueldo_neto))}</td>
                    <td className="px-4 py-3"><Badge variant={est.variant}>{est.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setDetalle(r.id)}>
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Eliminar recibo?")) remove.mutate(r.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </div>
      )}

      <ReciboDetail id={detalle} onClose={() => setDetalle(null)} empleados={empleados} />
    </div>
  );
}

function ReciboDetail({ id, onClose, empleados }: { id: string | null; onClose: () => void; empleados: Empleado[] }) {
  const { data } = useQuery({
    enabled: !!id,
    queryKey: ["recibo-detail", id],
    queryFn: async () => {
      const [r, c] = await Promise.all([
        supabase.from("recibos_sueldo").select("*").eq("id", id!).single(),
        supabase.from("recibo_conceptos").select("*").eq("recibo_id", id!).order("tipo"),
      ]);
      if (r.error) throw r.error;
      return { recibo: r.data as Recibo, conceptos: (c.data ?? []) as Concepto[] };
    },
  });

  const r = data?.recibo;
  const emp = empleados.find((e) => e.id === r?.empleado_id);
  const conceptos = data?.conceptos ?? [];

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl print:shadow-none">
        <DialogHeader>
          <DialogTitle>Recibo de sueldo — {r?.periodo.slice(0, 7) ?? ""}</DialogTitle>
        </DialogHeader>
        {!r ? <p className="text-muted-foreground">Cargando…</p> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <Info label="Empleado" value={emp ? `${emp.apellido}, ${emp.nombre}` : "—"} />
              <Info label="Legajo" value={emp?.legajo ?? "—"} />
              <Info label="CUIL" value={emp?.cuil ?? "—"} />
              <Info label="Cargo" value={emp?.cargo ?? "—"} />
              <Info label="Período" value={r.periodo.slice(0, 7)} />
              <Info label="Fecha de pago" value={r.fecha_pago ?? "—"} />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2 text-right">Monto</th></tr>
              </thead>
              <tbody>
                {conceptos.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 capitalize">{c.tipo}</td>
                    <td className="px-3 py-2">{c.descripcion}</td>
                    <td className={`px-3 py-2 text-right ${c.tipo === "descuento" ? "text-destructive" : ""}`}>
                      {c.tipo === "descuento" ? "-" : ""}{fmt(Number(c.monto))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="grid grid-cols-2 gap-y-1">
                <span className="text-muted-foreground">Bruto</span><span className="text-right">{fmt(Number(r.sueldo_bruto))}</span>
                <span className="text-muted-foreground">Descuentos</span><span className="text-right">-{fmt(Number(r.total_descuentos))}</span>
                <span className="border-t border-border pt-1 font-semibold">Neto</span>
                <span className="border-t border-border pt-1 text-right font-semibold">{fmt(Number(r.sueldo_neto))}</span>
              </div>
            </div>
            {r.notas && <p className="text-muted-foreground">{r.notas}</p>}
            <div className="flex justify-end print:hidden">
              <Button variant="outline" onClick={() => window.print()} className="gap-2"><FileDown className="h-4 w-4" /> Imprimir</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}