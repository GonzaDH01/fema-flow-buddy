import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useRecordatoriosMes } from "@/components/recordatorios";
import { useMensajes } from "@/components/mensajes-internos";
import { useProfile } from "@/lib/profile-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CampanaAvisos() {
  const { profile } = useProfile();
  const hoy = new Date();
  const { data: recs } = useRecordatoriosMes(hoy.getFullYear(), hoy.getMonth() + 1);
  const { data: mensajes } = useMensajes();

  const pendientesRec = (recs ?? []).filter((r) => !r.hecho && r.dia_mes <= hoy.getDate() + 3).length;
  const pendientesMsj = (mensajes ?? []).filter(
    (m) => !m.resuelto && (m.destinatario_id === null || m.destinatario_id === profile?.id),
  ).length;
  const total = pendientesRec + pendientesMsj;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild size="icon" variant="ghost" className="relative" aria-label="Avisos">
          <Link to="/app/alertas">
            <Bell className="h-5 w-5" />
            {total > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {total > 9 ? "9+" : total}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {total === 0
          ? "Sin avisos pendientes"
          : `${pendientesRec} recordatorio(s) y ${pendientesMsj} mensaje(s) pendientes`}
      </TooltipContent>
    </Tooltip>
  );
}
