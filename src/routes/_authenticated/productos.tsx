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
import { Plus, Trash2, Package, Search, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/productos")({
  component: ProductosPage,
});

type Prod = Database["public"]["Tables"]["productos"]["Row"];

const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];
const UNIDADES = ["unidad", "kg", "g", "l", "ml", "m", "m2", "m3", "hora", "servicio"];

const emptyForm = {
  codigo: "",
  descripcion: "",
  unidad: "unidad",
  precio_unitario: 0,
  alicuota_iva: 21,
  stock: 0,
  stock_minimo: 0,
  activo: true,
  notas: "",
};

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function ProductosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .order("codigo", { ascending: true });
      if (error) throw error;
      return data as Prod[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) =>
      p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)
    );
  }, [items, search]);

  const lowStock = useMemo(
    () => items.filter((p) => p.activo && Number(p.stock) <= Number(p.stock_minimo)).length,
    [items]
  );

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        unidad: form.unidad,
        precio_unitario: Number(form.precio_unitario) || 0,
        alicuota_iva: Number(form.alicuota_iva),
        stock: Number(form.stock) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        activo: form.activo,
        notas: form.notas || null,
        created_by: user!.id,
      };
      if (!payload.codigo || !payload.descripcion) throw new Error("Código y descripción son requeridos");
      const { error } = await supabase.from("productos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto creado");
      setForm(emptyForm);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("productos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActivo = useMutation({
    mutationFn: async (p: Prod) => {
      const { error } = await supabase
        .from("productos")
        .update({ activo: !p.activo })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="mt-1 text-muted-foreground">
            {items.length} producto{items.length === 1 ? "" : "s"}
            {lowStock > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {lowStock} bajo stock
              </span>
            )}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo producto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nuevo producto</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Código *</Label>
                  <Input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Descripción *</Label>
                  <Input required value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Unidad</Label>
                  <Select value={form.unidad} onValueChange={(v) => setForm({ ...form, unidad: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Precio unitario</Label>
                  <Input type="number" step="0.01" min="0" value={form.precio_unitario}
                    onChange={(e) => setForm({ ...form, precio_unitario: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>IVA %</Label>
                  <Select value={String(form.alicuota_iva)} onValueChange={(v) => setForm({ ...form, alicuota_iva: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALICUOTAS.map((a) => <SelectItem key={a} value={String(a)}>{a}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Stock actual</Label>
                  <Input type="number" step="0.01" value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Stock mínimo</Label>
                  <Input type="number" step="0.01" value={form.stock_minimo}
                    onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por código o descripción…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">
            {items.length === 0 ? "Aún no hay productos." : "Sin resultados."}
          </p>
          {items.length === 0 && (
            <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Descripción</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const bajo = Number(p.stock) <= Number(p.stock_minimo);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{p.codigo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.descripcion}</div>
                      {p.notas && <div className="text-xs text-muted-foreground">{p.notas}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.unidad}</td>
                    <td className="px-4 py-3 text-right">{ars.format(Number(p.precio_unitario))}</td>
                    <td className="px-4 py-3 text-right">{Number(p.alicuota_iva)}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className={bajo ? "text-amber-600 font-medium" : ""}>
                        {Number(p.stock)} {bajo && <AlertTriangle className="inline h-3.5 w-3.5" />}
                      </span>
                      <div className="text-xs text-muted-foreground">mín {Number(p.stock_minimo)}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActivo.mutate(p)}>
                        <Badge variant={p.activo ? "default" : "secondary"}>
                          {p.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.created_by === user?.id && (
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}