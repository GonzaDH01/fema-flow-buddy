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
import { Plus, Trash2, FileText, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/presupuestos")({
  component: PresupuestosPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">Error: {error.message}</div>
  ),
});

type Presupuesto = Database["public"]["Tables"]["presupuestos"]["Row"];
type Estado = Database["public"]["Enums"]["estado_presupuesto"];
type Cliente = Database["public"]["Tables"]["clientes_proveedores"]["Row"];
type Producto = Database["public"]["Tables"]["productos"]["Row"];

const ESTADOS: { value: Estado; label: string; variant: "default" | "secondary" | "outline" | "destructive" }[] = [
  { value: "borrador", label: "Borrador", variant: "secondary" },
  { value: "enviado", label: "Enviado", variant: "outline" },
  { value: "aprobado", label: "Aprobado", variant: "default" },
  { value: "rechazado", label: "Rechazado", variant: "destructive" },
  { value: "convertido", label: "Convertido", variant: "default" },
];

const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];
const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

type ItemForm = {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  alicuota_iva: number;
};

const emptyItem: ItemForm = {
  producto_id: null,
  descripcion: "",
  cantidad: 1,
  precio_unitario: 0,
  alicuota_iva: 21,
};

function PresupuestosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState<string>("");
  const [validez, setValidez] = useState(15);
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItem }]);

  const { data: presupuestos = [], isLoading } = useQuery({
    queryKey: ["presupuestos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presupuestos")
        .select("*")
        .order("fecha", { ascending: false })
        .order("numero", { ascending: false });
      if (error) throw error;
      return data as Presupuesto[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes_proveedores", "for-presupuesto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_proveedores")
        .select("*")
        .in("tipo", ["cliente", "ambos"])
        .order("razon_social");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ["productos", "for-presupuesto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("activo", true)
        .order("descripcion");
      if (error) throw error;
      return data as Producto[];
    },
  });

  const clienteName = (id: string | null) =>
    clientes.find((c) => c.id === id)?.razon_social ?? "—";

  const totales = useMemo(() => {
    let neto = 0,
      iva = 0;
    for (const it of items) {
      const sub = Number(it.cantidad) * Number(it.precio_unitario);
      neto += sub;
      iva += sub * (Number(it.alicuota_iva) / 100);
    }
    return { neto, iva, total: neto + iva };
  }, [items]);

  const resetForm = () => {
    setClienteId("");
    setValidez(15);
    setNotas("");
    setItems([{ ...emptyItem }]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Seleccioná un cliente");
      const valid = items.filter((i) => i.descripcion.trim() && Number(i.cantidad) > 0);
      if (valid.length === 0) throw new Error("Agregá al menos un ítem");

      const { data: last } = await supabase
        .from("presupuestos")
        .select("numero")
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextNum = (last?.numero ?? 0) + 1;

      const { data: pres, error: e1 } = await supabase
        .from("presupuestos")
        .insert({
          numero: nextNum,
          cliente_id: clienteId,
          validez_dias: Number(validez) || 15,
          subtotal_neto: totales.neto,
          iva_total: totales.iva,
          total: totales.total,
          notas: notas || null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (e1) throw e1;

      const itemsPayload = valid.map((it) => ({
        presupuesto_id: pres.id,
        producto_id: it.producto_id,
        descripcion: it.descripcion.trim(),
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        alicuota_iva: Number(it.alicuota_iva),
        subtotal_neto: Number(it.cantidad) * Number(it.precio_unitario),
        created_by: user!.id,
      }));
      const { error: e2 } = await supabase.from("presupuesto_items").insert(itemsPayload);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Presupuesto creado");
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("presupuestos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEstado = useMutation({
    mutationFn: async (vars: { id: string; estado: Estado }) => {
      const { error } = await supabase
        .from("presupuestos")
        .update({ estado: vars.estado })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presupuestos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const convertirAFactura = useMutation({
    mutationFn: async (presupuestoId: string) => {
      const { data: p, error: pErr } = await supabase
        .from("presupuestos")
        .select("*")
        .eq("id", presupuestoId)
        .single();
      if (pErr) throw pErr;
      const { data: pitems, error: iErr } = await supabase
        .from("presupuesto_items")
        .select("*")
        .eq("presupuesto_id", presupuestoId);
      if (iErr) throw iErr;

      const { data: lastF } = await supabase
        .from("facturas")
        .select("numero")
        .eq("tipo", "B")
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextNum = (lastF?.numero ?? 0) + 1;

      const { data: fac, error: fErr } = await supabase
        .from("facturas")
        .insert({
          tipo: "B",
          numero: nextNum,
          punto_venta: 1,
          cliente_proveedor_id: p.cliente_id,
          concepto: `Convertido de presupuesto N°${p.numero}`,
          neto: p.subtotal_neto,
          iva_total: p.iva_total,
          total: p.total,
          notas: p.notas,
          created_by: user!.id,
        })
        .select()
        .single();
      if (fErr) throw fErr;

      if ((pitems ?? []).length > 0) {
        const { error: fiErr } = await supabase.from("factura_items").insert(
          (pitems ?? []).map((it) => ({
            factura_id: fac.id,
            producto_id: it.producto_id,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            alicuota_iva: it.alicuota_iva,
            subtotal_neto: it.subtotal_neto,
            created_by: user!.id,
          }))
        );
        if (fiErr) throw fiErr;
      }

      const { error: uErr } = await supabase
        .from("presupuestos")
        .update({ estado: "convertido", factura_id: fac.id })
        .eq("id", presupuestoId);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Convertido a factura B");
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItem = (idx: number, patch: Partial<ItemForm>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((p) => [...p, { ...emptyItem }]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const onProductoChange = (idx: number, prodId: string) => {
    const prod = productos.find((p) => p.id === prodId);
    if (!prod) {
      setItem(idx, { producto_id: null });
      return;
    }
    setItem(idx, {
      producto_id: prod.id,
      descripcion: prod.descripcion,
      precio_unitario: Number(prod.precio_unitario),
      alicuota_iva: Number(prod.alicuota_iva),
    });
  };

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Presupuestos</h1>
          <p className="mt-1 text-muted-foreground">
            {presupuestos.length} presupuesto{presupuestos.length === 1 ? "" : "s"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo presupuesto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Nuevo presupuesto</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Validez (días)</Label>
                  <Input type="number" min="1" value={validez}
                    onChange={(e) => setValidez(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Ítems</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addItem}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                  </Button>
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  {items.map((it, idx) => {
                    const sub = Number(it.cantidad) * Number(it.precio_unitario);
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3">
                          <Label className="text-xs">Producto</Label>
                          <Select
                            value={it.producto_id ?? "__manual"}
                            onValueChange={(v) => v === "__manual" ? setItem(idx, { producto_id: null }) : onProductoChange(idx, v)}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__manual">— Manual —</SelectItem>
                              {productos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4">
                          <Label className="text-xs">Descripción</Label>
                          <Input value={it.descripcion}
                            onChange={(e) => setItem(idx, { descripcion: e.target.value })} />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-xs">Cant.</Label>
                          <Input type="number" step="0.01" min="0" value={it.cantidad}
                            onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Precio</Label>
                          <Input type="number" step="0.01" min="0" value={it.precio_unitario}
                            onChange={(e) => setItem(idx, { precio_unitario: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-xs">IVA%</Label>
                          <Select value={String(it.alicuota_iva)} onValueChange={(v) => setItem(idx, { alicuota_iva: Number(v) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ALICUOTAS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1 text-right text-sm">
                          <Label className="text-xs">Subt.</Label>
                          <div className="py-2">{ars.format(sub)}</div>
                        </div>
                        <div className="col-span-12 sm:col-span-12 flex justify-end">
                          {items.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>

              <div className="flex items-center justify-end gap-6 border-t pt-3 text-sm">
                <div>Neto: <strong>{ars.format(totales.neto)}</strong></div>
                <div>IVA: <strong>{ars.format(totales.iva)}</strong></div>
                <div className="text-base">Total: <strong>{ars.format(totales.total)}</strong></div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Guardando..." : "Crear presupuesto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">Cargando…</div>
      ) : presupuestos.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Aún no hay presupuestos.</p>
          <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Crear el primero
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {presupuestos.map((p) => {
                const est = ESTADOS.find((e) => e.value === p.estado)!;
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{p.numero}</td>
                    <td className="px-4 py-3">{p.fecha}</td>
                    <td className="px-4 py-3">{clienteName(p.cliente_id)}</td>
                    <td className="px-4 py-3 text-right">{ars.format(Number(p.total))}</td>
                    <td className="px-4 py-3 text-center">
                      <Select
                        value={p.estado}
                        onValueChange={(v) => updateEstado.mutate({ id: p.id, estado: v as Estado })}
                        disabled={p.estado === "convertido" || p.created_by !== user?.id}
                      >
                        <SelectTrigger className="h-7 w-auto">
                          <Badge variant={est.variant}>{est.label}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS.filter((e) => e.value !== "convertido").map((e) => (
                            <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {p.created_by === user?.id && p.estado !== "convertido" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => convertirAFactura.mutate(p.id)}
                          disabled={convertirAFactura.isPending}
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> A factura B
                        </Button>
                      )}
                      {p.created_by === user?.id && (
                        <Button size="icon" variant="ghost" onClick={() => {
                          if (confirm("¿Eliminar presupuesto?")) remove.mutate(p.id);
                        }}>
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