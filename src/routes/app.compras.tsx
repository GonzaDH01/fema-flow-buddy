import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileDown, Fuel, Receipt, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { FormField } from "@/lib/form-helpers";
import { formatPesos, formatFecha, MESES_LARGOS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FemaDocHeader, FemaClientBox, FemaWatermark, femaPrintCSS, femaHeaderHTML,
  femaClientHTML, femaWatermarkHTML, femaLogoUrl, femaWatermarkUrl, absoluteAssetUrl,
} from "@/lib/fema-doc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tabs as OuterTabs, TabsList as OuterTabsList, TabsTrigger as OuterTabsTrigger, TabsContent as OuterTabsContent } from "@/components/ui/tabs";
import { GastosFijos } from "@/components/gastos-fijos";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/app/compras")({ component: Page });

const TIPOS_COMPROBANTE = ["Factura", "Recibo", "Nota de Crédito", "Nota de Débito"] as const;
const LETRAS = ["A", "B", "C", "M", "E"] as const;
const CATS = [
  "Gasoil_Combustible", "Repuestos_JD", "Repuestos", "Mecanicos", "Gomeria",
  "Inoculante", "Transportistas", "Seguros", "Servicios", "Herramientas",
  "Mano_de_Obra", "Honorarios", "Franco_Particular", "Otro",
] as const;
const FORMAS_PAGO = ["Transferencia", "Efectivo", "Cheque", "E-cheq", "Mercado Pago", "Débito automático", "Otro"] as const;

const labelCat = (c: string) => {
  if (c === "Gasoil_Combustible") return "Gasoil / Combustible";
  if (c === "Mano_de_Obra") return "Mano de Obra";
  if (c === "Franco_Particular") return "Franco Particular";
  return c.replace(/_/g, " ");
};

const schema = z.object({
  tipo_comprobante: z.enum(TIPOS_COMPROBANTE),
  tipo: z.enum(LETRAS),
  numero: z.string().max(30).optional().or(z.literal("")),
  fecha: z.string().min(1),
  proveedor_nombre: z.string().max(120).optional().or(z.literal("")),
  categoria: z.enum(CATS),
  mes: z.coerce.number().min(1).max(12),
  descripcion: z.string().max(300).optional().or(z.literal("")),
  neto: z.coerce.number().min(0),
  iva_21: z.coerce.number().min(0),
  impuestos_internos: z.coerce.number().min(0),
  otros_impuestos: z.coerce.number().min(0),
  litros: z.coerce.number().min(0),
  producto: z.string().max(80).optional().or(z.literal("")),
  total: z.coerce.number().min(0),
  estado: z.enum(["pendiente", "pagada"]),
  fecha_pago: z.string().optional().or(z.literal("")),
  forma_pago: z.string().optional().or(z.literal("")),
  observaciones: z.string().max(500).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;

type Row = {
  id: string; fecha: string; proveedor_id: string | null; numero: string | null;
  tipo: typeof LETRAS[number]; tipo_comprobante: string | null;
  descripcion: string | null;
  neto: number; iva_21: number; iva_105: number; percepciones: number;
  impuestos_internos: number | null; otros_impuestos: number | null;
  litros: number | null; producto: string | null;
  total: number; categoria: typeof CATS[number];
  estado: "pendiente" | "pagada";
  fecha_pago: string | null; forma_pago: string | null; observaciones: string | null;
  imagen_path?: string | null;
  fema_proveedores?: { nombre: string } | null;
};

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [tab, setTab] = useState<"todas" | "pendiente" | "pagada">("todas");
  const [search, setSearch] = useState("");
  const [outerTab, setOuterTab] = useState<"compras" | "fijos">("compras");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroProv, setFiltroProv] = useState<string>("__all");
  const [filtroCat, setFiltroCat] = useState<string>("__all");
  const [reciboRow, setReciboRow] = useState<Row | null>(null);
  const [imgRow, setImgRow] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fema_facturas_compra", user?.id, year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_facturas_compra")
        .select("*, fema_proveedores(nombre)").eq("anio", year)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: provs } = useQuery({
    queryKey: ["fema_proveedores_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fema_proveedores").select("id,nombre").order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const provsMap = useMemo(
    () => Object.fromEntries((provs ?? []).map((p) => [p.id, p.nombre])),
    [provs],
  );

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (tab !== "todas") rows = rows.filter((r) => r.estado === tab);
    if (fechaDesde) rows = rows.filter((r) => r.fecha >= fechaDesde);
    if (fechaHasta) rows = rows.filter((r) => r.fecha <= fechaHasta);
    if (filtroProv !== "__all") rows = rows.filter((r) => (r.proveedor_id ?? "") === filtroProv);
    if (filtroCat !== "__all") rows = rows.filter((r) => r.categoria === filtroCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        const prov = r.fema_proveedores?.nombre ?? (r.proveedor_id ? (provsMap[r.proveedor_id] ?? "") : "");
        return prov.toLowerCase().includes(q)
          || (r.numero ?? "").toLowerCase().includes(q)
          || (r.descripcion ?? "").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [data, tab, search, provsMap, fechaDesde, fechaHasta, filtroProv, filtroCat]);

  const close = () => { setOpen(false); setEdit(null); };

  const ensureProveedor = async (nombre: string): Promise<string | null> => {
    const n = nombre.trim();
    if (!n) return null;
    const exist = (provs ?? []).find((p) => p.nombre.toLowerCase() === n.toLowerCase());
    if (exist) return exist.id;
    const { data: created, error } = await supabase.from("fema_proveedores")
      .insert({ user_id: user!.id, nombre: n }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    qc.invalidateQueries({ queryKey: ["fema_proveedores_min"] });
    qc.invalidateQueries({ queryKey: ["fema_proveedores"] });
    return created!.id;
  };

  const onSubmit = async (v: FormVals) => {
    const proveedor_id = v.proveedor_nombre ? await ensureProveedor(v.proveedor_nombre) : null;
    const payload = {
      user_id: user!.id,
      fecha: v.fecha,
      proveedor_id,
      numero: v.numero || null,
      tipo: v.tipo,
      tipo_comprobante: v.tipo_comprobante,
      descripcion: v.descripcion || null,
      neto: v.neto,
      iva_21: v.iva_21,
      impuestos_internos: v.impuestos_internos,
      otros_impuestos: v.otros_impuestos,
      litros: v.litros,
      producto: v.producto || null,
      total: v.total,
      categoria: v.categoria,
      estado: v.estado,
      fecha_pago: v.fecha_pago || null,
      forma_pago: v.forma_pago || null,
      observaciones: v.observaciones || null,
    };
    const { error } = edit
      ? await supabase.from("fema_facturas_compra").update(payload).eq("id", edit.id)
      : await supabase.from("fema_facturas_compra").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Compra actualizada" : "Compra creada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    close();
  };

  const onDelete = async (r: Row) => {
    const { error } = await supabase.from("fema_facturas_compra").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["fema_facturas_compra"] });
  };

  const exportXlsx = () => {
    const rows = (data ?? []).map((r) => ({
      "N° Factura": `${r.tipo}-${r.numero ?? ""}`,
      Proveedor: r.fema_proveedores?.nombre ?? (r.proveedor_id ? provsMap[r.proveedor_id] ?? "" : ""),
      Fecha: r.fecha,
      Categoría: labelCat(r.categoria),
      Descripción: r.descripcion ?? "",
      Monto: Number(r.total),
      Estado: r.estado,
      "Fecha de pago": r.fecha_pago ?? "",
      "Forma de pago": r.forma_pago ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, `Compras_${year}.xlsx`);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <OuterTabs value={outerTab} onValueChange={(v) => setOuterTab(v as any)}>
        <OuterTabsList>
          <OuterTabsTrigger value="compras">Compras</OuterTabsTrigger>
          <OuterTabsTrigger value="fijos">Gastos Fijos</OuterTabsTrigger>
        </OuterTabsList>
        <OuterTabsContent value="fijos" className="mt-4">
          <GastosFijos />
        </OuterTabsContent>
        <OuterTabsContent value="compras" className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
            <TabsTrigger value="pagada">Abonadas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportXlsx}>
            <FileDown className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nueva compra
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Compras a Proveedores</CardTitle>
          <Input
            placeholder="Buscar proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
        </CardHeader>
        <div className="px-6 pb-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Desde</p>
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-9" />
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Hasta</p>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-9" />
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Proveedor</p>
            <Select value={filtroProv} onValueChange={setFiltroProv}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {(provs ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Categoría</p>
            <Select value={filtroCat} onValueChange={setFiltroCat}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas</SelectItem>
                {CATS.map((c) => <SelectItem key={c} value={c}>{labelCat(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="h-9 w-full" onClick={() => {
              setFechaDesde(""); setFechaHasta(""); setFiltroProv("__all"); setFiltroCat("__all");
            }}>Limpiar filtros</Button>
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° FACTURA</TableHead>
                <TableHead>PROVEEDOR</TableHead>
                <TableHead>FECHA</TableHead>
                <TableHead>CATEGORÍA</TableHead>
                <TableHead>DESCRIPCIÓN</TableHead>
                <TableHead className="text-right">MONTO</TableHead>
                <TableHead>ESTADO</TableHead>
                <TableHead className="text-right">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sin compras</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.imagen_path ? (
                      <button
                        type="button"
                        onClick={() => setImgRow(r)}
                        className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
                        title="Ver imagen de la factura"
                      >
                        <ImageIcon className="h-3 w-3" />
                        {r.tipo}-{r.numero ?? "—"}
                      </button>
                    ) : (
                      <>{r.tipo}-{r.numero ?? "—"}</>
                    )}
                  </TableCell>
                  <TableCell>{r.fema_proveedores?.nombre ?? (r.proveedor_id ? provsMap[r.proveedor_id] ?? "—" : "—")}</TableCell>
                  <TableCell>{formatFecha(r.fecha)}</TableCell>
                  <TableCell>{labelCat(r.categoria)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.descripcion ?? "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.estado === "pagada" ? "text-primary" : "text-destructive"}`}>
                    {formatPesos(Number(r.total))}
                  </TableCell>
                  <TableCell>
                    {r.estado === "pagada"
                      ? <Badge className="bg-primary/15 text-primary border-primary/30">● Abonada</Badge>
                      : <Badge variant="outline" className="text-accent border-accent/40">● Pendiente</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {r.estado === "pagada" && (
                        <Button variant="outline" size="sm" className="border-primary/40 text-primary"
                          onClick={() => setReciboRow(r)}>
                          <Receipt className="h-3 w-3" /> Recibo
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setEdit(r); setOpen(true); }}>
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar compra?</AlertDialogTitle>
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
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
        <FormDialog
          key={edit?.id ?? "new"}
          onSubmit={onSubmit}
          initial={edit}
          provNombre={edit?.proveedor_id ? provsMap[edit.proveedor_id] ?? "" : ""}
          year={year}
        />
      </Dialog>
        </OuterTabsContent>
      </OuterTabs>
    </div>
  );
}

function FormDialog({ onSubmit, initial, provNombre, year }: {
  onSubmit: (v: FormVals) => Promise<void>;
  initial: Row | null;
  provNombre: string;
  year: number;
}) {
  const f = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_comprobante: (initial?.tipo_comprobante as any) ?? "Factura",
      tipo: initial?.tipo ?? "A",
      numero: initial?.numero ?? "",
      fecha: initial?.fecha ?? new Date().toISOString().slice(0, 10),
      proveedor_nombre: provNombre,
      categoria: initial?.categoria ?? "Gasoil_Combustible",
      mes: initial ? new Date(initial.fecha).getMonth() + 1 : new Date().getMonth() + 1,
      descripcion: initial?.descripcion ?? "",
      neto: Number(initial?.neto ?? 0),
      iva_21: Number(initial?.iva_21 ?? 0),
      impuestos_internos: Number(initial?.impuestos_internos ?? 0),
      otros_impuestos: Number(initial?.otros_impuestos ?? 0),
      litros: Number(initial?.litros ?? 0),
      producto: initial?.producto ?? "",
      total: Number(initial?.total ?? 0),
      estado: initial?.estado ?? "pendiente",
      fecha_pago: initial?.fecha_pago ?? "",
      forma_pago: initial?.forma_pago ?? "Transferencia",
      observaciones: initial?.observaciones ?? "",
    },
  });

  const tipo = f.watch("tipo");
  const categoria = f.watch("categoria");
  const neto = Number(f.watch("neto") || 0);
  const iva21 = Number(f.watch("iva_21") || 0);
  const impInt = Number(f.watch("impuestos_internos") || 0);
  const otros = Number(f.watch("otros_impuestos") || 0);

  const isCombustible = categoria === "Gasoil_Combustible";

  // Conversor USD → Pesos (solo al editar, para facturas expresadas en dólares)
  const [usdOpen, setUsdOpen] = useState(false);
  const [usdMonto, setUsdMonto] = useState<string>("");
  const [usdCotiz, setUsdCotiz] = useState<string>("");
  const aplicarUsd = () => {
    const u = Number(usdMonto);
    const c = Number(usdCotiz);
    if (!u || !c) { toast.error("Ingresá monto USD y cotización"); return; }
    const netoPesos = Number((u * c).toFixed(2));
    const iva = tipo === "A" ? Number((netoPesos * 0.21).toFixed(2)) : 0;
    const total = Number((netoPesos + iva).toFixed(2));
    f.setValue("neto", netoPesos, { shouldDirty: true, shouldValidate: true });
    f.setValue("iva_21", iva, { shouldDirty: true, shouldValidate: true });
    f.setValue("total", total, { shouldDirty: true, shouldValidate: true });
    toast.success(`Convertido: USD ${u} × ${c} = ${formatPesos(total)}`);
  };

  const totalCalc = useMemo(() => {
    if (!isCombustible) return null;
    if (tipo === "A") return neto + iva21 + impInt + otros;
    return neto; // B/C: IVA dentro del precio
  }, [isCombustible, tipo, neto, iva21, impInt, otros]);

  // Solo autocompletar el total desde el desglose cuando el usuario
  // efectivamente carga algún importe del desglose. Nunca pisar con 0
  // (esto borraba el total de facturas cargadas por OCR al editarlas).
  useEffect(() => {
    if (totalCalc === null) return;
    if (totalCalc <= 0) return;
    f.setValue("total", Number(totalCalc.toFixed(2)));
  }, [totalCalc, f]);

  // Sync mes con fecha
  const fecha = f.watch("fecha");
  useEffect(() => {
    if (fecha) f.setValue("mes", new Date(fecha).getMonth() + 1);
  }, [fecha, f]);

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "Editar" : "Nueva"} Compra / Proveedor</DialogTitle></DialogHeader>
      <form onSubmit={f.handleSubmit(onSubmit, (errs) => {
        console.error("Validación compras:", errs);
        const first = Object.values(errs)[0] as any;
        toast.error(first?.message ? `Revisá el formulario: ${first.message}` : "Revisá los campos marcados");
      })} className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Tipo de comprobante</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.watch("tipo_comprobante")} onValueChange={(v) => f.setValue("tipo_comprobante", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_COMPROBANTE.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipo} onValueChange={(v) => f.setValue("tipo", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LETRAS.map((t) => <SelectItem key={t} value={t}>Letra {t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Factura A: el IVA es crédito fiscal computable. Factura B o C: el IVA va dentro del precio (no se discrimina).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="N° factura proveedor"><Input placeholder="0001-00000001" {...f.register("numero")} /></FormField>
          <FormField label="Fecha" required><Input type="date" {...f.register("fecha")} /></FormField>
        </div>

        <FormField label="Proveedor">
          <Input placeholder="Nombre del proveedor" {...f.register("proveedor_nombre")} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Categoría">
            <Select value={categoria} onValueChange={(v) => f.setValue("categoria", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATS.map((c) => <SelectItem key={c} value={c}>{labelCat(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Mes del gasto">
            <Select value={String(f.watch("mes"))} onValueChange={(v) => f.setValue("mes", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_LARGOS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Descripción"><Input placeholder="Detalle de la compra" {...f.register("descripcion")} /></FormField>

        {isCombustible && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold flex items-center gap-2">
              <Fuel className="h-3.5 w-3.5 text-accent" /> DESGLOSE IMPUESTOS COMBUSTIBLE (SEGÚN FACTURA)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Neto (libre de impuestos)"><Input type="number" step="0.01" {...f.register("neto")} /></FormField>
              <FormField label="IVA 21%"><Input type="number" step="0.01" {...f.register("iva_21")} /></FormField>
              <FormField label="ITC (Nafta + Gas Oil)"><Input type="number" step="0.01" {...f.register("impuestos_internos")} /></FormField>
              <FormField label="CO₂ + Otros tributos (Tasa Vial, etc.)"><Input type="number" step="0.01" {...f.register("otros_impuestos")} /></FormField>
              <FormField label="Litros"><Input type="number" step="0.01" {...f.register("litros")} /></FormField>
              <FormField label="Producto"><Input placeholder="Ej: Quantium Diesel" {...f.register("producto")} /></FormField>
            </div>
            <p className="text-xs text-muted-foreground">
              Total calculado: <span className="font-semibold text-foreground">{formatPesos(totalCalc ?? 0)}</span> — se completa el campo Monto automáticamente.
            </p>
          </div>
        )}

        {!isCombustible && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Neto"><Input type="number" step="0.01" {...f.register("neto")} /></FormField>
            <FormField label="IVA 21%"><Input type="number" step="0.01" {...f.register("iva_21")} /></FormField>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto ($)" required><Input type="number" step="0.01" {...f.register("total")} /></FormField>
          <FormField label="Estado">
            <Select value={f.watch("estado")} onValueChange={(v) => f.setValue("estado", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="pagada">Abonada</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>

        {initial && (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
            <button
              type="button"
              onClick={() => setUsdOpen((v) => !v)}
              className="text-xs font-semibold uppercase tracking-wide text-accent hover:underline"
            >
              {usdOpen ? "▾" : "▸"} Convertir de USD a pesos
            </button>
            {usdOpen && (
              <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <FormField label="Monto USD">
                  <Input type="number" step="0.01" placeholder="1000" value={usdMonto} onChange={(e) => setUsdMonto(e.target.value)} />
                </FormField>
                <FormField label="Cotización $/USD">
                  <Input type="number" step="0.01" placeholder="1350" value={usdCotiz} onChange={(e) => setUsdCotiz(e.target.value)} />
                </FormField>
                <Button type="button" onClick={aplicarUsd}>Aplicar</Button>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Calcula Neto = USD × cotización. Si la factura es letra A, agrega IVA 21% y actualiza el Monto total automáticamente.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha de pago"><Input type="date" {...f.register("fecha_pago")} /></FormField>
          <FormField label="Forma de pago">
            <Select value={f.watch("forma_pago") ?? ""} onValueChange={(v) => f.setValue("forma_pago", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Observaciones">
          <Textarea placeholder="Notas adicionales…" rows={2} {...f.register("observaciones")} />
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => f.reset()}>Cancelar</Button>
          <Button type="submit" disabled={f.formState.isSubmitting}>Guardar compra</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}