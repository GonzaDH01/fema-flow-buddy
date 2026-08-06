import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileArchive, Calendar, CheckSquare, Square } from "lucide-react";
import { exportarSeleccion, type ModuloExport } from "@/lib/exportar-excel";

export const Route = createFileRoute("/app/exportaciones")({ component: Page });

const MODULOS: { id: ModuloExport; label: string; group: string }[] = [
  { id: "cashflow", label: "Cash Flow mensual", group: "Resumen" },
  { id: "facturas_venta", label: "Facturas de venta", group: "Ingresos" },
  { id: "facturas_compra", label: "Facturas de compra", group: "Egresos" },
  { id: "clientes", label: "Clientes", group: "Ingresos" },
  { id: "proveedores", label: "Proveedores", group: "Egresos" },
  { id: "medios_pago", label: "Medios de pago", group: "Finanzas" },
  { id: "cuentas_bancarias", label: "Cuentas bancarias", group: "Finanzas" },
  { id: "creditos", label: "Créditos / financiación", group: "Finanzas" },
  { id: "combustible", label: "Combustible", group: "Operativo" },
  { id: "empleados", label: "Empleados", group: "RRHH" },
  { id: "sueldos", label: "Sueldos", group: "RRHH" },
  { id: "impuestos", label: "Impuestos", group: "RRHH" },
  { id: "gastos_fijos", label: "Gastos fijos", group: "Egresos" },
];

const GROUPS = ["Resumen", "Ingresos", "Egresos", "Finanzas", "Operativo", "RRHH"];
const DEFAULT_SELECTED: ModuloExport[] = ["cashflow", "facturas_venta", "facturas_compra", "medios_pago"];

export function head() {
  return {
    title: "Exportaciones masivas | FEMA",
    meta: [
      { name: "description", content: "Centro de exportación masiva de datos contables y operativos de FEMA." },
      { property: "og:title", content: "Exportaciones masivas | FEMA" },
      { property: "og:description", content: "Centro de exportación masiva de datos contables y operativos de FEMA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}

function Page() {
  const { user } = useAuth();
  const { year } = useYear();
  const [selected, setSelected] = useState<Set<ModuloExport>>(new Set(DEFAULT_SELECTED));
  const [desde, setDesde] = useState<string>(`${year}-01-01`);
  const [hasta, setHasta] = useState<string>(`${year}-12-31`);
  const [formato, setFormato] = useState<"xlsx" | "zip_csv">("xlsx");
  const [exporting, setExporting] = useState(false);

  const toggle = (id: ModuloExport) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleGroup = (group: string) => {
    const ids = MODULOS.filter((m) => m.group === group).map((m) => m.id);
    const allSelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(MODULOS.map((m) => m.id)));
  const clearAll = () => setSelected(new Set());

  const exportar = async () => {
    if (!user) return;
    if (selected.size === 0) {
      toast.error("Seleccioná al menos un módulo");
      return;
    }
    setExporting(true);
    const t = toast.loading("Generando exportación…");
    try {
      await exportarSeleccion(user.id, {
        anio: year,
        desde,
        hasta,
        modulos: Array.from(selected),
        formato,
      });
      toast.success("Exportación generada", { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error al exportar", { id: t });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Exportaciones masivas</h1>
          <p className="text-sm text-muted-foreground">
            Descargá datos de varios módulos en un solo archivo, filtrados por período.
          </p>
        </div>
        <Badge variant="outline">{selected.size} módulo(s)</Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />Desde
              </Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />Hasta
              </Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Formato</Label>
              <Tabs value={formato} onValueChange={(v) => setFormato(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="xlsx" className="text-xs">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
                  </TabsTrigger>
                  <TabsTrigger value="zip_csv" className="text-xs">
                    <FileArchive className="w-3.5 h-3.5 mr-1" />ZIP CSV
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectAll}>
              <CheckSquare className="w-3.5 h-3.5 mr-1" />Seleccionar todo
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll}>
              <Square className="w-3.5 h-3.5 mr-1" />Ninguno
            </Button>
            <Button
              size="sm"
              onClick={exportar}
              disabled={exporting || selected.size === 0}
              className="ml-auto"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              {exporting ? "Generando…" : `Exportar ${formato === "xlsx" ? "Excel" : "ZIP"}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((group) => {
          const items = MODULOS.filter((m) => m.group === group);
          const allSelected = items.every((m) => selected.has(m.id));
          return (
            <Card key={group}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{group}</h3>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => toggleGroup(group)}>
                    {allSelected ? "Quitar" : "Agregar"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {items.map((m) => (
                    <div key={m.id} className="flex items-start gap-2">
                      <Checkbox
                        id={m.id}
                        checked={selected.has(m.id)}
                        onCheckedChange={() => toggle(m.id)}
                      />
                      <Label htmlFor={m.id} className="text-sm font-normal leading-tight cursor-pointer">
                        {m.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
