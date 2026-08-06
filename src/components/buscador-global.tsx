import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

type Hit = { id: string; grupo: string; titulo: string; detalle: string; to: string };

const fmt = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function useBusqueda(q: string) {
  return useQuery({
    queryKey: ["busqueda-global", q],
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<Hit[]> => {
      const term = `%${q.trim()}%`;
      const [cli, prov, ven, com, mov] = await Promise.all([
        supabase.from("fema_clientes").select("id,nombre,cuit,localidad")
          .or(`nombre.ilike.${term},cuit.ilike.${term}`).limit(5),
        supabase.from("fema_proveedores").select("id,nombre,cuit,localidad")
          .or(`nombre.ilike.${term},cuit.ilike.${term}`).limit(5),
        supabase.from("fema_facturas_venta").select("id,numero,fecha,total,trabajo")
          .or(`numero.ilike.${term},trabajo.ilike.${term}`).order("fecha", { ascending: false }).limit(5),
        supabase.from("fema_facturas_compra").select("id,numero,fecha,total,descripcion")
          .or(`numero.ilike.${term},descripcion.ilike.${term}`).order("fecha", { ascending: false }).limit(5),
        supabase.from("fema_movimientos_pago").select("id,numero,contraparte,monto,fecha_emision,instrumento")
          .or(`numero.ilike.${term},contraparte.ilike.${term}`).order("fecha_emision", { ascending: false }).limit(5),
      ]);

      const hits: Hit[] = [];
      for (const r of cli.data ?? [])
        hits.push({ id: `cli-${r.id}`, grupo: "Clientes", titulo: r.nombre, detalle: [r.cuit, r.localidad].filter(Boolean).join(" · "), to: "/app/clientes" });
      for (const r of prov.data ?? [])
        hits.push({ id: `prov-${r.id}`, grupo: "Proveedores", titulo: r.nombre, detalle: [r.cuit, r.localidad].filter(Boolean).join(" · "), to: "/app/proveedores" });
      for (const r of ven.data ?? [])
        hits.push({ id: `ven-${r.id}`, grupo: "Facturas de venta", titulo: `${r.numero ?? "s/n"} · ${fmt(r.total)}`, detalle: [r.fecha, r.trabajo].filter(Boolean).join(" · "), to: "/app/facturas" });
      for (const r of com.data ?? [])
        hits.push({ id: `com-${r.id}`, grupo: "Compras", titulo: `${r.numero ?? "s/n"} · ${fmt(r.total)}`, detalle: [r.fecha, r.descripcion].filter(Boolean).join(" · "), to: "/app/compras" });
      for (const r of mov.data ?? [])
        hits.push({ id: `mov-${r.id}`, grupo: "Medios de pago", titulo: `${r.instrumento} ${r.numero ?? ""} · ${fmt(r.monto)}`, detalle: [r.contraparte, r.fecha_emision].filter(Boolean).join(" · "), to: "/app/medios" });
      return hits;
    },
  });
}

export function BuscadorGlobal() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isFetching } = useBusqueda(q);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grupos = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of data ?? []) {
      const arr = map.get(h.grupo) ?? [];
      arr.push(h);
      map.set(h.grupo, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  const ir = (to: string) => {
    setOpen(false);
    setQ("");
    navigate({ to });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 px-2 text-muted-foreground md:px-3"
        onClick={() => setOpen(true)}
        title="Buscar (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Buscar...</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] lg:inline">Ctrl K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar cliente, proveedor, factura, echeq..."
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>
            {q.trim().length < 2
              ? "Escribí al menos 2 caracteres"
              : isFetching ? "Buscando..." : "Sin resultados"}
          </CommandEmpty>
          {grupos.map(([grupo, hits]) => (
            <CommandGroup key={grupo} heading={grupo}>
              {hits.map((h) => (
                <CommandItem key={h.id} value={`${h.titulo} ${h.detalle} ${h.id}`} onSelect={() => ir(h.to)}>
                  <div className="flex flex-col">
                    <span className="text-sm">{h.titulo}</span>
                    {h.detalle && <span className="text-xs text-muted-foreground">{h.detalle}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}