import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fuel, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ingresarCombustibleAlTanque, precioPorLitro } from "@/lib/combustible-stock";

type FacturaComb = {
  id: string;
  fecha: string;
  numero: string | null;
  descripcion: string | null;
  producto: string | null;
  litros: number | null;
  neto: number | null;
  total: number | null;
  proveedor: string | null;
};

const money = (n: number | null) =>
  n == null ? "—" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
const qty = (n: number | null) => Number(n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export const referenciaCompra = (numero: string | null, id: string) =>
  `Compra ${numero ?? id.slice(0, 8)}`;

/** Botón + ventana para pasar los litros de las facturas de combustible al tanque propio. */
export function ImportarCombustible() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <Fuel className="mr-1.5 h-4 w-4" />
        Combustible comprado
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Combustible comprado</DialogTitle>
            <DialogDescription>
              Facturas de combustible con litros cargados. Sumá al tanque de suministro sólo las compras
              que entran al tanque de la empresa; las cargas de vehículos particulares no se suman.
            </DialogDescription>
          </DialogHeader>
          <Listado />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Listado() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cargando, setCargando] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["compras_combustible"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_facturas_compra")
        .select("id,fecha,numero,descripcion,producto,litros,neto,total,fema_proveedores(nombre)")
        .eq("categoria", "Gasoil_Combustible")
        .order("fecha", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => ({
          id: r.id, fecha: r.fecha, numero: r.numero, descripcion: r.descripcion,
          producto: r.producto, litros: r.litros, neto: r.neto, total: r.total,
          proveedor: r.fema_proveedores?.nombre ?? null,
        }) as FacturaComb)
        .filter((r) => Number(r.litros ?? 0) > 0);
    },
  });

  const { data: importadas } = useQuery({
    queryKey: ["compras_combustible_importadas"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_stock_mov").select("motivo").eq("tipo", "entrada").limit(1000);
      return new Set((data ?? []).map((m: any) => m.motivo).filter(Boolean) as string[]);
    },
  });

  const sumar = async (f: FacturaComb) => {
    setCargando(f.id);
    const res = await ingresarCombustibleAlTanque({
      userId: user!.id,
      litros: Number(f.litros),
      precioLitro: precioPorLitro(f.litros, f.neto, f.total),
      fecha: f.fecha,
      referencia: referenciaCompra(f.numero, f.id),
      proveedor: f.proveedor,
    });
    setCargando(null);
    if (!res.ok) { toast.error(res.motivo ?? "No se pudo sumar"); return; }
    toast.success(`${qty(f.litros)} lt sumados al tanque`);
    qc.invalidateQueries({ queryKey: ["fema_productos"] });
    qc.invalidateQueries({ queryKey: ["fema_tanque"] });
    qc.invalidateQueries({ queryKey: ["compras_combustible_importadas"] });
  };

  if (isLoading) return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!(data ?? []).length)
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay facturas de combustible con litros cargados.</p>;

  return (
    <div className="max-h-[60vh] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Nº factura</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Litros</TableHead>
            <TableHead className="text-right">Precio/litro</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).map((f) => {
            const ya = importadas?.has(referenciaCompra(f.numero, f.id));
            return (
              <TableRow key={f.id}>
                <TableCell>{f.fecha}</TableCell>
                <TableCell className="font-mono text-xs">{f.numero ?? "—"}</TableCell>
                <TableCell>{f.proveedor ?? "—"}</TableCell>
                <TableCell className="max-w-[220px] truncate">{f.producto ?? f.descripcion ?? "—"}</TableCell>
                <TableCell className="text-right">{qty(f.litros)} lt</TableCell>
                <TableCell className="text-right">{money(precioPorLitro(f.litros, f.neto, f.total))}</TableCell>
                <TableCell className="text-right">{money(f.total)}</TableCell>
                <TableCell className="text-right">
                  {ya ? (
                    <Badge variant="secondary">En el tanque</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={cargando === f.id} onClick={() => void sumar(f)}>
                      {cargando === f.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Sumar al tanque
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
