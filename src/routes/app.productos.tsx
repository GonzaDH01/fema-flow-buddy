import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CrudTable } from "@/components/crud-table";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inventario } from "@/components/inventario";

export const Route = createFileRoute("/app/productos")({ component: Page });

const CATS = ["Combustible", "Insumos", "Servicios", "Cotizaciones", "Traslados", "Otro"] as const;
const UNIDADES = ["Litro", "Metro", "Hectarea", "Unidad", "Dolar", "Viaje", "Kilogramo", "Tonelada"] as const;
const TIPOS_MOV = ["entrada", "salida", "ajuste"] as const;

const numOpt = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !isNaN(Number(v)), { message: "Debe ser un número" });

const PREFIJO_CAT: Record<string, string> = {
  Combustible: "COM", Insumos: "INS", Servicios: "SRV",
  Cotizaciones: "COT", Traslados: "TRA", Otro: "GEN",
};

const schema = z.object({
  codigo: z.string().max(20).optional().or(z.literal("")),
  nombre: z.string().min(2).max(150),
  unidad_medida: z.enum(UNIDADES),
  precio_compra: numOpt,
  precio_venta: numOpt,
  stock: numOpt,
  stock_minimo: numOpt,
  categoria: z.enum(CATS),
  observaciones: z.string().max(300).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;
type Row = {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad_medida: string;
  precio: number | null;
  precio_compra: number | null;
  precio_venta: number | null;
  stock: number;
  stock_minimo: number;
  categoria: string;
  observaciones: string | null;
};

const money = (n: number | null) =>
  n == null ? "—" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
const qty = (n: number) => Number(n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [movProd, setMovProd] = useState<Row | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["fema_productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_productos")
        .select("id,codigo,nombre,unidad_medida,precio,precio_compra,precio_venta,stock,stock_minimo,categoria,observaciones")
        .order("codigo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.codigo ?? "").toLowerCase().includes(q) ||
        (r.nombre ?? "").toLowerCase().includes(q) ||
        (r.unidad_medida ?? "").toLowerCase().includes(q) ||
        (r.categoria ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const close = () => {
    setOpen(false);
    setEdit(null);
  };

  const onSubmit = async (v: FormVals) => {
    const venta = v.precio_venta ? Number(v.precio_venta) : null;
    const payload = {
      user_id: user!.id,
      nombre: v.nombre,
      unidad_medida: v.unidad_medida,
      precio: venta,
      precio_compra: v.precio_compra ? Number(v.precio_compra) : null,
      precio_venta: venta,
      stock: v.stock ? Number(v.stock) : 0,
      stock_minimo: v.stock_minimo ? Number(v.stock_minimo) : 0,
      categoria: v.categoria,
      observaciones: v.observaciones || null,
    };
    const { error } = edit
      ? await supabase.from("fema_productos").update(payload).eq("id", edit.id)
      : await supabase.from("fema_productos").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(edit ? "Actualizado" : "Producto creado");
    qc.invalidateQueries({ queryKey: ["fema_productos"] });
    close();
  };

  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_productos").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["fema_productos"] });
  };

  return (
    <Tabs defaultValue="catalogo" className="p-4 md:p-6">
      <TabsList>
        <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
        <TabsTrigger value="inventario">Inventario</TabsTrigger>
      </TabsList>
      <TabsContent value="catalogo" className="mt-4">
      <div className="-m-4 md:-m-6">
      <CrudTable<Row>
        title="Productos"
        description="Catálogo con precios de compra, venta y stock"
        rows={filtered}
        loading={isLoading}
        emptyLabel="productos"
        onAdd={() => {
          setEdit(null);
          setOpen(true);
        }}
        onEdit={(r) => {
          setEdit(r);
          setOpen(true);
        }}
        onDelete={onDelete}
        extraHeader={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56 pl-8 md:w-64"
            />
          </div>
        }
        columns={[
          { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: "Unidad", cell: (r) => r.unidad_medida },
          { header: "P. compra", cell: (r) => money(r.precio_compra) },
          { header: "P. venta", cell: (r) => money(r.precio_venta ?? r.precio) },
          {
            header: "Stock",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span className={Number(r.stock) <= Number(r.stock_minimo) ? "font-semibold text-destructive" : ""}>
                  {qty(r.stock)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMovProd(r);
                  }}
                >
                  <PackagePlus className="mr-1 h-3.5 w-3.5" />
                  Cargar
                </Button>
              </span>
            ),
          },
          { header: "Categoría", cell: (r) => <Badge variant="secondary">{r.categoria}</Badge> },
          { header: "Observaciones", cell: (r) => r.observaciones ?? "—" },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <FormDialog key={edit?.id ?? "nuevo"} onSubmit={onSubmit} initial={edit} />
      </Dialog>
      <Dialog open={!!movProd} onOpenChange={(v) => !v && setMovProd(null)}>
        {movProd && (
          <MovDialog
            key={movProd.id}
            producto={movProd}
            onDone={() => {
              setMovProd(null);
              qc.invalidateQueries({ queryKey: ["fema_productos"] });
            }}
          />
        )}
      </Dialog>
      </div>
      </TabsContent>
      <TabsContent value="inventario" className="mt-4">
        <Inventario />
      </TabsContent>
    </Tabs>
  );
}

function MovDialog({ producto, onDone }: { producto: Row; onDone: () => void }) {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<(typeof TIPOS_MOV)[number]>("entrada");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState(producto.precio_compra != null ? String(producto.precio_compra) : "");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const cant = Number(cantidad || 0);
  const nuevo = tipo === "ajuste" ? cant : tipo === "entrada" ? Number(producto.stock) + cant : Number(producto.stock) - cant;

  const guardar = async () => {
    if (!cantidad || isNaN(cant)) {
      toast.error("Ingresá una cantidad");
      return;
    }
    setSaving(true);
    const { error: movErr } = await supabase.from("fema_stock_mov").insert({
      user_id: user!.id,
      producto_id: producto.id,
      tipo,
      cantidad: cant,
      costo_unitario: costo ? Number(costo) : null,
      motivo: motivo || null,
      stock_resultante: nuevo,
    });
    if (movErr) {
      setSaving(false);
      toast.error(movErr.message);
      return;
    }
    const patch: { stock: number; precio_compra?: number } = { stock: nuevo };
    if (tipo === "entrada" && costo) patch.precio_compra = Number(costo);
    const { error } = await supabase.from("fema_productos").update(patch).eq("id", producto.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stock actualizado");
    onDone();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Cargar stock — {producto.nombre}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Stock actual: <span className="font-semibold">{qty(producto.stock)}</span> {producto.unidad_medida}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Movimiento">
            <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada (suma)</SelectItem>
                <SelectItem value="salida">Salida (resta)</SelectItem>
                <SelectItem value="ajuste">Ajuste (valor final)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Cantidad" required>
            <Input type="number" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio de compra unitario">
            <Input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </FormField>
          <FormField label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Compra, consumo, ajuste…" />
          </FormField>
        </div>
        <div className="rounded-md border border-border p-3 text-sm">
          Stock resultante: <span className="font-semibold">{qty(nuevo)}</span> {producto.unidad_medida}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={guardar} disabled={saving}>
          Guardar movimiento
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function FormDialog({ onSubmit, initial }: { onSubmit: (v: FormVals) => Promise<void>; initial: Row | null }) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      unidad_medida: (initial?.unidad_medida as any) ?? "Unidad",
      precio_compra: initial?.precio_compra != null ? String(initial.precio_compra) : "",
      precio_venta: initial?.precio_venta != null ? String(initial.precio_venta) : initial?.precio != null ? String(initial.precio) : "",
      stock: initial?.stock != null ? String(initial.stock) : "0",
      stock_minimo: initial?.stock_minimo != null ? String(initial.stock_minimo) : "0",
      categoria: (initial?.categoria as any) ?? "Otro",
      observaciones: initial?.observaciones ?? "",
    },
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Editar" : "Nuevo"} producto</DialogTitle>
      </DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nombre" required error={f.formState.errors.nombre?.message}>
          <Input {...f.register("nombre")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Unidad de medida">
            <Select value={f.watch("unidad_medida")} onValueChange={(v) => f.setValue("unidad_medida", v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Categoría">
            <Select value={f.watch("categoria")} onValueChange={(v) => f.setValue("categoria", v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio de compra" error={f.formState.errors.precio_compra?.message}>
            <Input type="number" step="0.01" {...f.register("precio_compra")} />
          </FormField>
          <FormField label="Precio de venta" error={f.formState.errors.precio_venta?.message}>
            <Input type="number" step="0.01" {...f.register("precio_venta")} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Stock actual" error={f.formState.errors.stock?.message}>
            <Input type="number" step="0.01" {...f.register("stock")} />
          </FormField>
          <FormField label="Stock mínimo" error={f.formState.errors.stock_minimo?.message}>
            <Input type="number" step="0.01" {...f.register("stock_minimo")} />
          </FormField>
        </div>
        <FormField label="Observaciones">
          <Input {...f.register("observaciones")} />
        </FormField>
        <DialogFooter>
          <Button type="submit" disabled={f.formState.isSubmitting}>
            {initial ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
