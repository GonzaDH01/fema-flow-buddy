import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FormField } from "@/lib/form-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/clientes")({ component: Page });

const CONDICIONES = [
  "Responsable Inscripto",
  "Monotributista",
  "Exento",
  "Consumidor Final",
] as const;

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
] as const;

const schema = z.object({
  codigo: z.string().max(20).optional().or(z.literal("")),
  condicion_iva: z.enum(CONDICIONES),
  nombre: z.string().min(2).max(100),
  cuit: z.string().max(15).optional().or(z.literal("")),
  domicilio: z.string().max(150).optional().or(z.literal("")),
  localidad: z.string().max(80).optional().or(z.literal("")),
  cp: z.string().max(10).optional().or(z.literal("")),
  provincia: z.string().max(50).optional().or(z.literal("")),
  telefono: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  observaciones: z.string().max(500).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;

type Row = {
  id: string;
  codigo: string | null;
  nombre: string;
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  condicion_iva: string | null;
  domicilio: string | null;
  localidad: string | null;
  cp: string | null;
  provincia: string | null;
  observaciones: string | null;
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"listado" | "form">("listado");
  const [edit, setEdit] = useState<Row | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["fema_clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_clientes")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Row[];
    },
  });

  const rows = data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (r.nombre ?? "").toLowerCase().includes(q)
      || (r.cuit ?? "").toLowerCase().includes(q)
      || (r.codigo ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const nextCodigo = useMemo(() => {
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.codigo ?? "", 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return String(max + 1).padStart(5, "0");
  }, [rows]);

  const onSubmit = async (v: FormVals) => {
    const payload = {
      user_id: user!.id,
      codigo: v.codigo || nextCodigo,
      nombre: v.nombre,
      cuit: v.cuit || null,
      email: v.email || null,
      telefono: v.telefono || null,
      condicion_iva: v.condicion_iva,
      domicilio: v.domicilio || null,
      localidad: v.localidad || null,
      cp: v.cp || null,
      provincia: v.provincia || null,
      observaciones: v.observaciones || null,
    };
    const { error } = edit
      ? await supabase.from("fema_clientes").update(payload).eq("id", edit.id)
      : await supabase.from("fema_clientes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Cliente actualizado" : "Cliente creado");
    qc.invalidateQueries({ queryKey: ["fema_clientes"] });
    qc.invalidateQueries({ queryKey: ["fema_clientes_min"] });
    setEdit(null);
    setTab("listado");
  };

  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_clientes").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente eliminado");
    qc.invalidateQueries({ queryKey: ["fema_clientes"] });
  };

  const onEdit = (r: Row) => { setEdit(r); setTab("form"); };
  const onNew = () => { setEdit(null); setTab("form"); };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Codigo: r.codigo ?? "",
      RazonSocial: r.nombre,
      CUIT: r.cuit ?? "",
      CondicionIVA: r.condicion_iva ?? "",
      Domicilio: r.domicilio ?? "",
      Localidad: r.localidad ?? "",
      CP: r.cp ?? "",
      Provincia: r.provincia ?? "",
      Telefono: r.telefono ?? "",
      Email: r.email ?? "",
      Observaciones: r.observaciones ?? "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "clientes.xlsx");
  };

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clientes</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportar}>
            <FileDown className="mr-1.5 h-4 w-4" /> Exportar Excel
          </Button>
          <Button size="sm" onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo cliente
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); if (v === "listado") setEdit(null); }} className="mb-4">
        <TabsList>
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="form">{edit ? "Editar cliente" : "Nuevo cliente"}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "listado" ? (
        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Clientes registrados</h3>
            <Input
              placeholder="Buscar nombre o CUIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Razón social / Nombre</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Cond. IVA</TableHead>
                <TableHead>Localidad</TableHead>
                <TableHead>Provincia</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-28 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No hay clientes</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.codigo ?? "—"}</TableCell>
                  <TableCell className="font-semibold uppercase">{r.nombre}</TableCell>
                  <TableCell>{r.cuit ?? "—"}</TableCell>
                  <TableCell>{r.condicion_iva ?? "—"}</TableCell>
                  <TableCell>{r.localidad ?? "—"}</TableCell>
                  <TableCell>{r.provincia ?? "—"}</TableCell>
                  <TableCell>{r.telefono ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => onEdit(r)}>
                        <Pencil className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(r)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <ClienteForm
          key={edit?.id ?? "new"}
          initial={edit}
          nextCodigo={nextCodigo}
          onSubmit={onSubmit}
          onCancel={() => { setEdit(null); setTab("listado"); }}
        />
      )}
    </div>
  );
}

function ClienteForm({ initial, nextCodigo, onSubmit, onCancel }: {
  initial: Row | null;
  nextCodigo: string;
  onSubmit: (v: FormVals) => Promise<void>;
  onCancel: () => void;
}) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      codigo: initial?.codigo ?? nextCodigo,
      condicion_iva: (initial?.condicion_iva as typeof CONDICIONES[number]) ?? "Responsable Inscripto",
      nombre: initial?.nombre ?? "",
      cuit: initial?.cuit ?? "",
      domicilio: initial?.domicilio ?? "",
      localidad: initial?.localidad ?? "",
      cp: initial?.cp ?? "",
      provincia: initial?.provincia ?? "",
      telefono: initial?.telefono ?? "",
      email: initial?.email ?? "",
      observaciones: initial?.observaciones ?? "",
    },
  });

  useEffect(() => {
    if (!initial) f.setValue("codigo", nextCodigo);
  }, [initial, nextCodigo, f]);

  return (
    <section className="max-w-2xl rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{initial ? "Editar cliente" : "Nuevo cliente"}</h3>
      </div>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Código"><Input placeholder="00001" {...f.register("codigo")} /></FormField>
          <FormField label="Condición IVA" required>
            <Select value={f.watch("condicion_iva")} onValueChange={(v) => f.setValue("condicion_iva", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONDICIONES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Razón social / Nombre completo" required error={f.formState.errors.nombre?.message}>
          <Input {...f.register("nombre")} />
        </FormField>

        <FormField label="CUIT"><Input placeholder="XX-XXXXXXXX-X" {...f.register("cuit")} /></FormField>

        <FormField label="Domicilio"><Input {...f.register("domicilio")} /></FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Localidad"><Input {...f.register("localidad")} /></FormField>
          <FormField label="CP"><Input {...f.register("cp")} /></FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Provincia">
            <Select value={f.watch("provincia") ?? ""} onValueChange={(v) => f.setValue("provincia", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>{PROVINCIAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Teléfono"><Input placeholder="03564 000000" {...f.register("telefono")} /></FormField>
        </div>

        <FormField label="Email" error={f.formState.errors.email?.message}>
          <Input type="email" placeholder="cliente@email.com" {...f.register("email")} />
        </FormField>

        <FormField label="Observaciones">
          <Textarea rows={3} placeholder="Notas internas sobre el cliente..." {...f.register("observaciones")} />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar cliente</Button>
        </div>
      </form>
    </section>
  );
}