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
import { Plus, Trash2, Eye, Search } from "lucide-react";
import { Pagination, usePagination } from "@/components/pagination";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/facturas")({
  component: FacturasPage,
});

type Factura = Database["public"]["Tables"]["facturas"]["Row"];
type CP = Database["public"]["Tables"]["clientes_proveedores"]["Row"];
type Producto = Database["public"]["Tables"]["productos"]["Row"];
type FacturaItemRow = Database["public"]["Tables"]["factura_items"]["Row"];
type TipoFactura = Database["public"]["Enums"]["tipo_factura"];
type EstadoFactura = Database["public"]["Enums"]["estado_factura"];
type TipoRetencion = Database["public"]["Enums"]["tipo_retencion"];
type TipoPercepcion = Database["public"]["Enums"]["tipo_percepcion"];

const TIPOS_FACTURA: TipoFactura[] = ["A", "B", "C", "E", "M"];
const ESTADOS: { value: EstadoFactura; label: string; variant: "secondary" | "default" | "outline" | "destructive" }[] = [
  { value: "borrador", label: "Borrador", variant: "outline" },
  { value: "emitida", label: "Emitida", variant: "default" },
  { value: "pagada", label: "Pagada", variant: "secondary" },
  { value: "anulada", label: "Anulada", variant: "destructive" },
];
const ALICUOTAS_IVA = [0, 2.5, 5, 10.5, 21, 27];
const TIPOS_RET: TipoRetencion[] = ["ganancias", "iva", "iibb", "suss"];
const TIPOS_PERC: TipoPercepcion[] = ["iva", "iibb"];

type IvaRow = { alicuota: number; base: number };
type ItemRow = {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  alicuota_iva: number;
};
type RetRow = { tipo: TipoRetencion; base: number; alicuota: number; jurisdiccion: string };
type PercRow = { tipo: TipoPercepcion; base: number; alicuota: number; jurisdiccion: string };

const emptyForm = {
  tipo: "A" as TipoFactura,
  punto_venta: 1,
  numero: 1,
  fecha_emision: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: "",
  cliente_proveedor_id: "",
  concepto: "",
  estado: "borrador" as EstadoFactura,
  notas: "",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

function FacturasPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [ivaRows, setIvaRows] = useState<IvaRow[]>([{ alicuota: 21, base: 0 }]);
  const [retRows, setRetRows] = useState<RetRow[]>([]);
  const [percRows, setPercRows] = useState<PercRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [useItems, setUseItems] = useState(false);

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["facturas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("facturas").select("*").order("fecha_emision", { ascending: false });
      if (error) throw error;
      return data as Factura[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes_proveedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes_proveedores").select("*").order("razon_social");
      if (error) throw error;
      return data as CP[];
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("activo", true)
        .order("codigo");
      if (error) throw error;
      return data as Producto[];
    },
  });

  // Cuando hay items, las filas de IVA se derivan automáticamente agrupando por alícuota.
  const derivedIvaRows = useMemo<IvaRow[]>(() => {
    const map = new Map<number, number>();
    for (const it of items) {
      const base = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
      if (base <= 0) continue;
      const a = Number(it.alicuota_iva) || 0;
      map.set(a, (map.get(a) || 0) + base);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([alicuota, base]) => ({ alicuota, base }));
  }, [items]);

  const effectiveIva = useItems ? derivedIvaRows : ivaRows;

  const totals = useMemo(() => {
    const neto = effectiveIva.reduce((s, r) => s + (Number(r.base) || 0), 0);
    const iva_total = effectiveIva.reduce((s, r) => s + (Number(r.base) || 0) * (Number(r.alicuota) || 0) / 100, 0);
    const percepciones_total = percRows.reduce((s, r) => s + (Number(r.base) || 0) * (Number(r.alicuota) || 0) / 100, 0);
    const retenciones_total = retRows.reduce((s, r) => s + (Number(r.base) || 0) * (Number(r.alicuota) || 0) / 100, 0);
    const total = neto + iva_total + percepciones_total - retenciones_total;
    return { neto, iva_total, percepciones_total, retenciones_total, total };
  }, [effectiveIva, retRows, percRows]);

  const resetForm = () => {
    setForm(emptyForm);
    setIvaRows([{ alicuota: 21, base: 0 }]);
    setRetRows([]);
    setPercRows([]);
    setItems([]);
    setUseItems(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        tipo: form.tipo,
        punto_venta: Number(form.punto_venta),
        numero: Number(form.numero),
        fecha_emision: form.fecha_emision,
        fecha_vencimiento: form.fecha_vencimiento || null,
        cliente_proveedor_id: form.cliente_proveedor_id || null,
        concepto: form.concepto || null,
        estado: form.estado,
        notas: form.notas || null,
        neto: totals.neto,
        iva_total: totals.iva_total,
        percepciones_total: totals.percepciones_total,
        retenciones_total: totals.retenciones_total,
        total: totals.total,
        created_by: user!.id,
      };
      const { data: fact, error } = await supabase.from("facturas").insert(payload).select().single();
      if (error) throw error;

      const ivaSrc = useItems ? derivedIvaRows : ivaRows;
      const ivaIns = ivaSrc
        .filter((r) => Number(r.base) > 0)
        .map((r) => ({
          factura_id: fact.id,
          alicuota: Number(r.alicuota),
          base_imponible: Number(r.base),
          importe: Number(r.base) * Number(r.alicuota) / 100,
          created_by: user!.id,
        }));
      if (ivaIns.length) {
        const { error: e1 } = await supabase.from("iva").insert(ivaIns);
        if (e1) throw e1;
      }

      if (useItems) {
        const itemsIns = items
          .filter((it) => it.descripcion.trim() && Number(it.cantidad) > 0)
          .map((it) => ({
            factura_id: fact.id,
            producto_id: it.producto_id,
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad),
            precio_unitario: Number(it.precio_unitario),
            alicuota_iva: Number(it.alicuota_iva),
            subtotal_neto: Number(it.cantidad) * Number(it.precio_unitario),
            created_by: user!.id,
          }));
        if (itemsIns.length) {
          const { error: eItems } = await supabase.from("factura_items").insert(itemsIns);
          if (eItems) throw eItems;
        }
      }

      const retIns = retRows
        .filter((r) => Number(r.base) > 0)
        .map((r) => ({
          factura_id: fact.id,
          tipo: r.tipo,
          base_imponible: Number(r.base),
          alicuota: Number(r.alicuota),
          importe: Number(r.base) * Number(r.alicuota) / 100,
          jurisdiccion: r.jurisdiccion || null,
          fecha: form.fecha_emision,
          created_by: user!.id,
        }));
      if (retIns.length) {
        const { error: e2 } = await supabase.from("retenciones").insert(retIns);
        if (e2) throw e2;
      }
      const percIns = percRows
        .filter((r) => Number(r.base) > 0)
        .map((r) => ({
          factura_id: fact.id,
          tipo: r.tipo,
          base_imponible: Number(r.base),
          alicuota: Number(r.alicuota),
          importe: Number(r.base) * Number(r.alicuota) / 100,
          jurisdiccion: r.jurisdiccion || null,
          fecha: form.fecha_emision,
          created_by: user!.id,
        }));
      if (percIns.length) {
        const { error: e3 } = await supabase.from("percepciones").insert(percIns);
        if (e3) throw e3;
      }
    },
    onSuccess: () => {
      toast.success("Factura creada");
      resetForm();
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["facturas"] });
      qc.invalidateQueries({ queryKey: ["facturas-count"] });
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("facturas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura eliminada");
      qc.invalidateQueries({ queryKey: ["facturas"] });
      qc.invalidateQueries({ queryKey: ["facturas-count"] });
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoFactura }) => {
      const { error } = await supabase.from("facturas").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facturas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clienteNombre = (id: string | null) => clientes.find((c) => c.id === id)?.razon_social ?? "—";

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturas</h1>
          <p className="mt-1 text-muted-foreground">CRUD completo con IVA, retenciones y percepciones.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nueva factura</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva factura</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoFactura })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS_FACTURA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>P. Venta</Label>
                  <Input type="number" min={1} value={form.punto_venta} onChange={(e) => setForm({ ...form, punto_venta: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input type="number" min={1} required value={form.numero} onChange={(e) => setForm({ ...form, numero: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v as EstadoFactura })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Fecha emisión</Label>
                  <Input type="date" required value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Fecha vencimiento</Label>
                  <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cliente / Proveedor</Label>
                <Select value={form.cliente_proveedor_id} onValueChange={(v) => setForm({ ...form, cliente_proveedor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Concepto</Label>
                <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              </div>

              <section className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Detalle</h3>
                  <div className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={() => setUseItems(false)}
                      className={`rounded px-2 py-1 ${!useItems ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      IVA manual
                    </button>
                    <button type="button" onClick={() => setUseItems(true)}
                      className={`rounded px-2 py-1 ${useItems ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      Por productos
                    </button>
                  </div>
                </div>

                {useItems ? (
                  <div className="space-y-2">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground">Agregá líneas de productos. El stock se actualiza automáticamente al guardar.</p>
                    )}
                    {items.map((it, i) => {
                      const subtotal = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                      return (
                        <div key={i} className="grid grid-cols-[1.6fr_1.4fr_70px_110px_90px_90px_auto] gap-2">
                          <Select
                            value={it.producto_id ?? "__manual"}
                            onValueChange={(v) => {
                              const copy = [...items];
                              if (v === "__manual") {
                                copy[i] = { ...copy[i], producto_id: null };
                              } else {
                                const p = productos.find((pp) => pp.id === v);
                                if (p) {
                                  copy[i] = {
                                    ...copy[i],
                                    producto_id: p.id,
                                    descripcion: p.descripcion,
                                    precio_unitario: Number(p.precio_unitario),
                                    alicuota_iva: Number(p.alicuota_iva),
                                  };
                                }
                              }
                              setItems(copy);
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Producto..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__manual">— Manual —</SelectItem>
                              {productos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.codigo} · {p.descripcion} (stock {Number(p.stock)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input placeholder="Descripción" value={it.descripcion}
                            onChange={(e) => {
                              const copy = [...items]; copy[i] = { ...copy[i], descripcion: e.target.value }; setItems(copy);
                            }} />
                          <Input type="number" step="0.01" min="0" placeholder="Cant." value={it.cantidad}
                            onChange={(e) => {
                              const copy = [...items]; copy[i] = { ...copy[i], cantidad: Number(e.target.value) }; setItems(copy);
                            }} />
                          <Input type="number" step="0.01" min="0" placeholder="P. unit." value={it.precio_unitario}
                            onChange={(e) => {
                              const copy = [...items]; copy[i] = { ...copy[i], precio_unitario: Number(e.target.value) }; setItems(copy);
                            }} />
                          <Select value={String(it.alicuota_iva)} onValueChange={(v) => {
                            const copy = [...items]; copy[i] = { ...copy[i], alicuota_iva: Number(v) }; setItems(copy);
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ALICUOTAS_IVA.map((a) => <SelectItem key={a} value={String(a)}>{a}%</SelectItem>)}</SelectContent>
                          </Select>
                          <div className="flex items-center justify-end px-2 text-sm">{fmt(subtotal)}</div>
                          <Button type="button" size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                    <Button type="button" size="sm" variant="outline" className="gap-1"
                      onClick={() => setItems([...items, { producto_id: null, descripcion: "", cantidad: 1, precio_unitario: 0, alicuota_iva: 21 }])}>
                      <Plus className="h-3 w-3" /> Agregar línea
                    </Button>
                    {derivedIvaRows.length > 0 && (
                      <div className="mt-3 rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                        IVA calculado:{" "}
                        {derivedIvaRows.map((r) => `${r.alicuota}% sobre ${fmt(r.base)}`).join(" · ")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="mb-2 flex justify-end">
                      <Button type="button" size="sm" variant="outline" onClick={() => setIvaRows([...ivaRows, { alicuota: 21, base: 0 }])}>
                        <Plus className="h-3 w-3" /> Agregar
                      </Button>
                    </div>
                    {ivaRows.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                        <Select value={String(r.alicuota)} onValueChange={(v) => {
                          const copy = [...ivaRows]; copy[i] = { ...copy[i], alicuota: Number(v) }; setIvaRows(copy);
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{ALICUOTAS_IVA.map((a) => <SelectItem key={a} value={String(a)}>{a}%</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" step="0.01" placeholder="Base" value={r.base} onChange={(e) => {
                          const copy = [...ivaRows]; copy[i] = { ...copy[i], base: Number(e.target.value) }; setIvaRows(copy);
                        }} />
                        <div className="flex items-center px-2 text-sm text-muted-foreground">
                          {fmt((Number(r.base) || 0) * (Number(r.alicuota) || 0) / 100)}
                        </div>
                        <Button type="button" size="icon" variant="ghost" onClick={() => setIvaRows(ivaRows.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Percepciones</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPercRows([...percRows, { tipo: "iibb", base: 0, alicuota: 0, jurisdiccion: "" }])}>
                    <Plus className="h-3 w-3" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {percRows.length === 0 && <p className="text-xs text-muted-foreground">Sin percepciones.</p>}
                  {percRows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                      <Select value={r.tipo} onValueChange={(v) => {
                        const copy = [...percRows]; copy[i] = { ...copy[i], tipo: v as TipoPercepcion }; setPercRows(copy);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS_PERC.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" step="0.01" placeholder="Base" value={r.base} onChange={(e) => {
                        const copy = [...percRows]; copy[i] = { ...copy[i], base: Number(e.target.value) }; setPercRows(copy);
                      }} />
                      <Input type="number" step="0.01" placeholder="Alic %" value={r.alicuota} onChange={(e) => {
                        const copy = [...percRows]; copy[i] = { ...copy[i], alicuota: Number(e.target.value) }; setPercRows(copy);
                      }} />
                      <Input placeholder="Jurisdicción" value={r.jurisdiccion} onChange={(e) => {
                        const copy = [...percRows]; copy[i] = { ...copy[i], jurisdiccion: e.target.value }; setPercRows(copy);
                      }} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setPercRows(percRows.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Retenciones</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRetRows([...retRows, { tipo: "ganancias", base: 0, alicuota: 0, jurisdiccion: "" }])}>
                    <Plus className="h-3 w-3" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {retRows.length === 0 && <p className="text-xs text-muted-foreground">Sin retenciones.</p>}
                  {retRows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                      <Select value={r.tipo} onValueChange={(v) => {
                        const copy = [...retRows]; copy[i] = { ...copy[i], tipo: v as TipoRetencion }; setRetRows(copy);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS_RET.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" step="0.01" placeholder="Base" value={r.base} onChange={(e) => {
                        const copy = [...retRows]; copy[i] = { ...copy[i], base: Number(e.target.value) }; setRetRows(copy);
                      }} />
                      <Input type="number" step="0.01" placeholder="Alic %" value={r.alicuota} onChange={(e) => {
                        const copy = [...retRows]; copy[i] = { ...copy[i], alicuota: Number(e.target.value) }; setRetRows(copy);
                      }} />
                      <Input placeholder="Jurisdicción" value={r.jurisdiccion} onChange={(e) => {
                        const copy = [...retRows]; copy[i] = { ...copy[i], jurisdiccion: e.target.value }; setRetRows(copy);
                      }} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setRetRows(retRows.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>

              <div className="rounded-lg bg-muted/40 p-4 text-sm">
                <div className="grid grid-cols-2 gap-y-1">
                  <span className="text-muted-foreground">Neto</span><span className="text-right">{fmt(totals.neto)}</span>
                  <span className="text-muted-foreground">IVA</span><span className="text-right">{fmt(totals.iva_total)}</span>
                  <span className="text-muted-foreground">Percepciones</span><span className="text-right">{fmt(totals.percepciones_total)}</span>
                  <span className="text-muted-foreground">Retenciones</span><span className="text-right">-{fmt(totals.retenciones_total)}</span>
                  <span className="border-t border-border pt-1 font-semibold">Total</span>
                  <span className="border-t border-border pt-1 text-right font-semibold">{fmt(totals.total)}</span>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Guardando..." : "Guardar factura"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : facturas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center">
          <p className="text-muted-foreground">Aún no hay facturas.</p>
          <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Crear la primera
          </Button>
        </div>
      ) : (
        <FacturasTable
          facturas={facturas}
          clienteNombre={clienteNombre}
          onDetail={(id) => setDetail(id)}
          onDelete={(id) => { if (confirm("¿Eliminar factura?")) remove.mutate(id); }}
          onChangeEstado={(id, estado) => updateEstado.mutate({ id, estado })}
          userId={user?.id}
        />
      )}

      <FacturaDetail id={detail} onClose={() => setDetail(null)} clientes={clientes} />
    </div>
  );
}

function FacturasTable({
  facturas, clienteNombre, onDetail, onDelete, onChangeEstado, userId,
}: {
  facturas: Factura[];
  clienteNombre: (id: string | null) => string;
  onDetail: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeEstado: (id: string, estado: EstadoFactura) => void;
  userId?: string;
}) {
  const [query, setQuery] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | EstadoFactura>("todos");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return facturas.filter((f) => {
      if (estadoFiltro !== "todos" && f.estado !== estadoFiltro) return false;
      if (!q) return true;
      const comp = `${f.tipo} ${String(f.punto_venta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}`.toLowerCase();
      return comp.includes(q) || clienteNombre(f.cliente_proveedor_id).toLowerCase().includes(q);
    });
  }, [facturas, query, estadoFiltro, clienteNombre]);
  const { page, setPage, totalPages, paged, total, pageSize } = usePagination(filtered, 20);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Buscar por comprobante o cliente" className="pl-9" />
        </div>
        <Select value={estadoFiltro} onValueChange={(v) => { setEstadoFiltro(v as "todos" | EstadoFactura); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente / Proveedor</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((f) => {
                const est = ESTADOS.find((e) => e.value === f.estado)!;
                return (
                  <tr key={f.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {f.tipo} {String(f.punto_venta).padStart(4, "0")}-{String(f.numero).padStart(8, "0")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.fecha_emision}</td>
                    <td className="px-4 py-3">{clienteNombre(f.cliente_proveedor_id)}</td>
                    <td className="px-4 py-3">
                      <Select value={f.estado} onValueChange={(v) => onChangeEstado(f.id, v as EstadoFactura)}>
                        <SelectTrigger className="h-7 w-32 border-0 bg-transparent p-0">
                          <Badge variant={est.variant}>{est.label}</Badge>
                        </SelectTrigger>
                        <SelectContent>{ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(Number(f.total))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => onDetail(f.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {f.created_by === userId && (
                          <Button size="icon" variant="ghost" onClick={() => onDelete(f.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </div>
    </div>
  );
}

function FacturaDetail({ id, onClose, clientes }: { id: string | null; onClose: () => void; clientes: CP[] }) {
  const { data } = useQuery({
    enabled: !!id,
    queryKey: ["factura-detail", id],
    queryFn: async () => {
      const [f, iv, rt, pc, it] = await Promise.all([
        supabase.from("facturas").select("*").eq("id", id!).single(),
        supabase.from("iva").select("*").eq("factura_id", id!),
        supabase.from("retenciones").select("*").eq("factura_id", id!),
        supabase.from("percepciones").select("*").eq("factura_id", id!),
        supabase.from("factura_items").select("*").eq("factura_id", id!),
      ]);
      if (f.error) throw f.error;
      return {
        factura: f.data,
        iva: iv.data ?? [],
        retenciones: rt.data ?? [],
        percepciones: pc.data ?? [],
        items: (it.data ?? []) as FacturaItemRow[],
      };
    },
  });

  const f = data?.factura;
  const cliente = clientes.find((c) => c.id === f?.cliente_proveedor_id);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {f ? `Factura ${f.tipo} ${String(f.punto_venta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}` : "Detalle"}
          </DialogTitle>
        </DialogHeader>
        {f && data && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Fecha emisión:</span> {f.fecha_emision}</div>
              <div><span className="text-muted-foreground">Vencimiento:</span> {f.fecha_vencimiento ?? "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Cliente:</span> {cliente?.razon_social ?? "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Concepto:</span> {f.concepto ?? "—"}</div>
            </div>

            {data.items.length > 0 && (
              <div>
                <h4 className="mb-1 font-semibold">Líneas</h4>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-1">Descripción</th><th className="py-1 text-right">Cant.</th><th className="py-1 text-right">P. unit</th><th className="py-1 text-right">IVA</th><th className="py-1 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1">{r.descripcion}</td>
                        <td className="py-1 text-right">{Number(r.cantidad)}</td>
                        <td className="py-1 text-right">{fmt(Number(r.precio_unitario))}</td>
                        <td className="py-1 text-right">{Number(r.alicuota_iva)}%</td>
                        <td className="py-1 text-right">{fmt(Number(r.subtotal_neto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Section title="IVA" cols={["Alícuota", "Base", "Importe"]} rows={data.iva.map((r) => ({ a: `${r.alicuota}%`, b: fmt(Number(r.base_imponible)), c: fmt(Number(r.importe)) }))} />
            <Section title="Percepciones" cols={["Tipo", "Base", "Importe"]} rows={data.percepciones.map((r) => ({ a: `${r.tipo} ${r.jurisdiccion ?? ""}`, b: fmt(Number(r.base_imponible)), c: fmt(Number(r.importe)) }))} />
            <Section title="Retenciones" cols={["Tipo", "Base", "Importe"]} rows={data.retenciones.map((r) => ({ a: `${r.tipo} ${r.jurisdiccion ?? ""}`, b: fmt(Number(r.base_imponible)), c: fmt(Number(r.importe)) }))} />

            <div className="rounded-lg bg-muted/40 p-4">
              <div className="grid grid-cols-2 gap-y-1">
                <span className="text-muted-foreground">Neto</span><span className="text-right">{fmt(Number(f.neto))}</span>
                <span className="text-muted-foreground">IVA</span><span className="text-right">{fmt(Number(f.iva_total))}</span>
                <span className="text-muted-foreground">Percepciones</span><span className="text-right">{fmt(Number(f.percepciones_total))}</span>
                <span className="text-muted-foreground">Retenciones</span><span className="text-right">-{fmt(Number(f.retenciones_total))}</span>
                <span className="border-t border-border pt-1 font-semibold">Total</span>
                <span className="border-t border-border pt-1 text-right font-semibold">{fmt(Number(f.total))}</span>
              </div>
            </div>
            {f.notas && <p className="border-t border-border pt-3 text-muted-foreground">{f.notas}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, rows, cols }: { title: string; rows: { a: string; b: string; c: string }[]; cols: [string, string, string] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 font-semibold">{title}</h4>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">{cols[0]}</th><th className="py-1 text-right">{cols[1]}</th><th className="py-1 text-right">{cols[2]}</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1 capitalize">{r.a}</td>
              <td className="py-1 text-right">{r.b}</td>
              <td className="py-1 text-right">{r.c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}