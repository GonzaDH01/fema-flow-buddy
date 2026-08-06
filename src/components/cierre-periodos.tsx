import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useYear } from "@/lib/year-context";
import { MESES_LARGOS } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

/**
 * Cierre contable por mes: una vez cerrado un período, la base de datos
 * rechaza altas, ediciones y bajas de facturas de compra y venta con fecha
 * dentro de ese mes. Solo un administrador puede cerrar o reabrir.
 */
export function CierrePeriodos() {
  const { user } = useAuth();
  const { year } = useYear();
  const qc = useQueryClient();

  const { data: esAdmin } = useQuery({
    queryKey: ["es-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles")
        .select("role").eq("user_id", user!.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const { data: cerrados } = useQuery({
    queryKey: ["fema_periodos_cierre", year],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fema_periodos_cierre")
        .select("id,anio,mes").eq("anio", year);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const cerradoDe = (mes: number) => (cerrados ?? []).find((c) => c.mes === mes) ?? null;

  const toggle = async (mes: number) => {
    const actual = cerradoDe(mes);
    if (actual) {
      if (!confirm(`¿Reabrir ${MESES_LARGOS[mes - 1]} ${year}? Se podrán volver a editar sus comprobantes.`)) return;
      const { error } = await (supabase as any).from("fema_periodos_cierre").delete().eq("id", actual.id);
      if (error) { toast.error(error.message); return; }
      toast.success(`${MESES_LARGOS[mes - 1]} reabierto`);
    } else {
      if (!confirm(`¿Cerrar ${MESES_LARGOS[mes - 1]} ${year}? No se podrán cargar ni editar comprobantes de ese mes.`)) return;
      const { error } = await (supabase as any).from("fema_periodos_cierre")
        .insert({ anio: year, mes, cerrado_por: user!.id });
      if (error) { toast.error(error.message); return; }
      toast.success(`${MESES_LARGOS[mes - 1]} cerrado`);
    }
    qc.invalidateQueries({ queryKey: ["fema_periodos_cierre"] });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Lock className="w-4 h-4" />Cierre de períodos {year}</h3>
          <p className="text-xs text-muted-foreground">
            Un mes cerrado queda protegido: no se pueden cargar, editar ni borrar facturas de compra o venta
            con fecha en ese período. {esAdmin ? "Tocá un mes para cerrarlo o reabrirlo." : "Solo un administrador puede cerrar o reabrir."}
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {MESES_LARGOS.map((nombre, i) => {
            const mes = i + 1;
            const cerrado = !!cerradoDe(mes);
            return (
              <Button
                key={mes}
                size="sm"
                variant={cerrado ? "default" : "outline"}
                disabled={!esAdmin}
                className={cerrado ? "bg-rose-600 hover:bg-rose-700" : ""}
                onClick={() => toggle(mes)}
              >
                {cerrado ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                {nombre.slice(0, 3)}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
