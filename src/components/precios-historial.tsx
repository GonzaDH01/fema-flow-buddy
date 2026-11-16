import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type H = {
  id: string; producto_id: string; tipo_precio: string; fecha: string; created_at: string;
  precio_anterior: number | null; precio_nuevo: number | null; porcentaje: number | null; moneda: string | null;
  fema_productos: { nombre: string; codigo: string | null; unidad_medida: string; categoria: string } | null;
};

const fmt = (n: number | null, m?: string | null) =>
  n == null ? "—" : `${m === "USD" ? "US$" : "$"} ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`);

export function PreciosHistorial() {
  const [prod, setProd] = useState("todos");
  const [tipo, setTipo] = useState("venta");
  const { data = [] } = useQuery({
    queryKey: ["fema_precios_historial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_precios_historial")
        .select("*, fema_productos(nombre,codigo,unidad_medida,categoria)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as H[];
    },
  });

  const rows = data.filter((r) => r.tipo_precio === tipo && (prod === "todos" || r.producto_id === prod));
  const productos = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => r.fema_productos && m.set(r.producto_id, r.fema_productos.nombre));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Resumen por producto: primer precio, actual, % acumulado
  const resumen = useMemo(() => {
    const g = new Map<string, H[]>();
    data.filter((r) => r.tipo_precio === tipo).forEach((r) => g.set(r.producto_id, [...(g.get(r.producto_id) ?? []), r]));
    return [...g.values()].map((list) => {
      const asc = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const ini = asc.find((x) => x.precio_nuevo != null)?.precio_nuevo ?? null;
      const last = asc[asc.length - 1];
      const acum = ini && last.precio_nuevo != null ? ((last.precio_nuevo - ini) / ini) * 100 : null;
      return { p: last.fema_productos, moneda: last.moneda, ini, actual: last.precio_nuevo, ultimo: last.porcentaje, acum, cambios: asc.length - 1, fecha: last.fecha };
    }).sort((a, b) => (a.p?.nombre ?? "").localeCompare(b.p?.nombre ?? ""));
  }, [data, tipo]);

  const grupo = (k: string) => {
    const xs = resumen.filter((r) => r.p?.nombre.toLowerCase().includes(k) && r.acum != null);
    return xs.length ? xs.reduce((s, r) => s + (r.acum ?? 0), 0) / xs.length : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="venta">Precio de venta</SelectItem><SelectItem value="compra">Precio de compra</SelectItem></SelectContent>
        </Select>
        <Select value={prod} onValueChange={setProd}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los productos</SelectItem>
            {productos.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[["Picado", "picado"], ["Embolsado", "embolsado"]].map(([l, k]) => (
          <Card key={k}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Incremento promedio acumulado · {l}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{pct(grupo(k) == null ? null : Math.round(grupo(k)! * 100) / 100)}</CardContent></Card>
        ))}
      </div>

      <Card><CardHeader><CardTitle className="text-base">Resumen por producto</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-2">Producto</th><th className="p-2">Unidad</th><th className="p-2 text-right">Precio inicial</th><th className="p-2 text-right">Precio actual</th><th className="p-2 text-right">Último %</th><th className="p-2 text-right">% acumulado</th><th className="p-2 text-right">Cambios</th><th className="p-2">Últ. cambio</th></tr></thead>
            <tbody>{resumen.map((r, i) => (
              <tr key={i} className="border-t"><td className="p-2 font-medium">{r.p?.nombre}</td><td className="p-2">{r.p?.unidad_medida}</td>
                <td className="p-2 text-right">{fmt(r.ini, r.moneda)}</td><td className="p-2 text-right">{fmt(r.actual, r.moneda)}</td>
                <td className="p-2 text-right">{pct(r.ultimo)}</td><td className="p-2 text-right font-semibold">{pct(r.acum == null ? null : Math.round(r.acum * 100) / 100)}</td>
                <td className="p-2 text-right">{r.cambios}</td><td className="p-2">{new Date(r.fecha + "T00:00").toLocaleDateString("es-AR")}</td></tr>
            ))}</tbody>
          </table>
        </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Historial de cambios</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-2">Fecha</th><th className="p-2">Producto</th><th className="p-2 text-right">Anterior</th><th className="p-2 text-right">Nuevo</th><th className="p-2 text-right">Variación</th><th className="p-2 text-right">%</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t"><td className="p-2">{new Date(r.fecha + "T00:00").toLocaleDateString("es-AR")}</td>
                <td className="p-2">{r.fema_productos?.nombre}</td>
                <td className="p-2 text-right">{r.precio_anterior == null ? <span className="text-muted-foreground">Precio inicial</span> : fmt(r.precio_anterior, r.moneda)}</td>
                <td className="p-2 text-right">{fmt(r.precio_nuevo, r.moneda)}</td>
                <td className="p-2 text-right">{r.precio_anterior != null && r.precio_nuevo != null ? fmt(r.precio_nuevo - r.precio_anterior, r.moneda) : "—"}</td>
                <td className="p-2 text-right">{r.porcentaje == null ? "—" : <Badge variant={r.porcentaje >= 0 ? "default" : "destructive"}>{pct(r.porcentaje)}</Badge>}</td></tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
    </div>
  );
}
