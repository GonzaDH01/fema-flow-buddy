import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Receipt, Filter } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/gastos")({
  component: GastosPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">Error: {error.message}</div>
  ),
});

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type Categoria = Database["public"]["Enums"]["categoria_gasto"];
type Metodo = Database["public"]["Enums"]["metodo_pago"];
type Proveedor = Database["public"]["Tables"]["clientes_proveedores"]["Row"];

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "servicios", label: "Servicios" },
  { value: "alquiler", label: "Alquiler" },
  { value: "sueldos", label: "Sueldos" },
  { value: "impuestos", label: "Impuestos" },
  { value: "insumos", label: "Insumos" },
  { value: "marketing", label: "Marketing" },
  { value: "transporte", label: "Transporte" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otros", label: "Otros" },
];

const METODOS: { value: Metodo; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "cheque", label: "Cheque" },
  { value: "otro", label: "Otro" },
];

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

const emptyForm = {
  fecha: new Date().toISOString().slice(0, 10),
  categoria: "otros" as Categoria,
  descripcion: "",
  monto: 0,
  metodo_pago: "efectivo" as Metodo,
  proveedor_id: "",
  comprobante_numero: "",
  notas: "",
};

function GastosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filtroCat, setFiltroCat] = useState<Categoria | "all">("all");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["gastos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("*")
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Gasto[];
    },
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ["clientes_proveedores", "proveedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_proveedores")
        .select("*")
        .in("tipo", ["proveedor", "ambos"])
        .order("razon_social");
      if (error) throw error;
      return data as Proveedor[];
    },
  });

  const filtered = useMemo(() => {
    return items.filter((g) => {
      if (filtroCat !== "all" && g.categoria !== filtroCat) return false;
      if (filtroDesde && g.fecha < filtroDesde) return false;
      if (filtroHasta && g.fecha > filtroHasta) return false;
      return true;
    });
  }, [items, filtroCat, filtroDesde, filtroHasta]);

  const totalFiltrado = useMemo(
    () => filtered.reduce((acc, g) => acc + Number(g.monto), 0),
    [filtered]
  );

  const porCategoria = useMemo(() => {
    const map = new Map<Categoria, number>();
    for (const g of filtered) {
      map.set(g.categoria, (map.get(g.categoria) ?? 0) + Number(g.monto));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.descripcion.trim()) throw new Error("Descripción requerida");
      if (Number(form.monto) <= 0) throw new Error("Monto debe ser > 0");
      const { error } = await supabase.from("gastos").insert({
        fecha: form.fecha,
        categoria: form.categoria,
        descripcion: form.descripcion.trim(),
        monto: Number(form.monto),
        metodo_pago: form.metodo_pago,
        proveedor_id: form.proveedor_id || null,
        comprobante_numero: form.comprobante_numero.trim() || null,
        notas: form.notas.trim() || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gasto registrado");
      setForm(emptyForm);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["gastos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gastos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["gastos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const provName = (id: string | null) =>
    proveedores.find((p) => p.id === id)?.razon_social ?? "—";

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gastos</h1>
          <p className="mt-1 text-muted-foreground">
            {filtered.length} registro{filtered.length === 1 ? "" : "s"} · Total {ars.format(totalFiltrado)}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo gasto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nuevo gasto</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Fecha *</Label>
                  <Input type="date" required value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Monto *</Label>
                  <Input type="number" step="0.01" min="0" required value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descripción *</Label>
                <Input required value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as Categoria })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select value={form.metodo_pago} onValueChange={(v) => setForm({ ...form, metodo_pago: v as Metodo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METODOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Proveedor (opcional)</Label>
                  <Select value={form.proveedor_id || "__none"}
                    onValueChange={(v) => setForm({ ...form, proveedor_id: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      {proveedores.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.razon_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>N° comprobante</Label>
                  <Input value={form.comprobante_numero}
                    onChange={(e) => setForm({ ...form, comprobante_numero: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea rows={2} value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Guardando..." : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <Label className="text-xs text-muted-foreground"><Filter className="inline h-3 w-3" /> Categoría</Label>
          <Select value={filtroCat} onValueChange={(v) => setFiltroCat(v as Categoria | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
      </div>

      {porCategoria.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resumen por categoría</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {porCategoria.map(([cat, total]) => (
              <Badge key={cat} variant="secondary" className="gap-1.5 text-sm font-normal">
                {CATEGORIAS.find((c) => c.value === cat)?.label} · <strong>{ars.format(total)}</strong>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">
            {items.length === 0 ? "Aún no hay gastos registrados." : "Sin resultados con esos filtros."}
          </p>
          {items.length === 0 && (
            <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Registrar el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-left">Descripción</th>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-left">Pago</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">{g.fecha}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{CATEGORIAS.find((c) => c.value === g.categoria)?.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{g.descripcion}</div>
                    {g.comprobante_numero && (
                      <div className="text-xs text-muted-foreground">N° {g.comprobante_numero}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{provName(g.proveedor_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {METODOS.find((m) => m.value === g.metodo_pago)?.label}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{ars.format(Number(g.monto))}</td>
                  <td className="px-4 py-3 text-right">
                    {g.created_by === user?.id && (
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm("¿Eliminar gasto?")) remove.mutate(g.id);
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}