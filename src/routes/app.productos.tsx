import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CrudTable } from "@/components/crud-table";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/productos")({ component: Page });

const CATS = ["Combustible", "Insumos", "Servicios", "Cotizaciones", "Traslados", "Otro"] as const;
const UNIDADES = ["Litro", "Metro", "Hectarea", "Unidad", "Dolar", "Viaje", "Kilogramo", "Tonelada"] as const;

const schema = z.object({
  nombre: z.string().min(2).max(150),
  unidad_medida: z.enum(UNIDADES),
  precio: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !isNaN(Number(v)), { message: "Debe ser un número" }),
  categoria: z.enum(CATS),
  observaciones: z.string().max(300).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;
type Row = {
  id: string;
  nombre: string;
  unidad_medida: string;
  precio: number | null;
  categoria: string;
  observaciones: string | null;
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["fema_productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_productos")
        .select("id,nombre,unidad_medida,precio,categoria,observaciones")
        .order("created_at", { ascending: false });
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
    const payload = {
      user_id: user!.id,
      nombre: v.nombre,
      unidad_medida: v.unidad_medida,
      precio: v.precio ? Number(v.precio) : null,
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
    <>
      <CrudTable<Row>
        title="Productos"
        description="Catálogo de productos y servicios"
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
          {
            header: "Precio",
            cell: (r) =>
              r.precio != null
                ? r.precio.toLocaleString("es-AR", { minimumFractionDigits: 2 })
                : "—",
          },
          { header: "Categoría", cell: (r) => <Badge variant="secondary">{r.categoria}</Badge> },
          { header: "Observaciones", cell: (r) => r.observaciones ?? "—" },
        ]}
      />
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <FormDialog key={edit?.id ?? "nuevo"} onSubmit={onSubmit} initial={edit} />
      </Dialog>
    </>
  );
}

function FormDialog({ onSubmit, initial }: { onSubmit: (v: FormVals) => Promise<void>; initial: Row | null }) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      unidad_medida: (initial?.unidad_medida as any) ?? "Unidad",
      precio: initial?.precio != null ? String(initial.precio) : "",
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
          <FormField label="Precio" error={f.formState.errors.precio?.message}>
            <Input type="number" step="0.01" {...f.register("precio")} />
          </FormField>
        </div>
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
