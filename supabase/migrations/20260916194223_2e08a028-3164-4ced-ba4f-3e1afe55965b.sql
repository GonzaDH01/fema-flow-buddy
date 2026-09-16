ALTER TABLE public.fema_planilla_equipos
  ADD COLUMN IF NOT EXISTS activo_id uuid REFERENCES public.fema_activos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_planilla_equipos_activo ON public.fema_planilla_equipos(activo_id);
CREATE INDEX IF NOT EXISTS idx_planilla_equipos_equipo ON public.fema_planilla_equipos(equipo_id);