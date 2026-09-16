ALTER TABLE public.fema_combustible
  ADD COLUMN IF NOT EXISTS activo_id uuid REFERENCES public.fema_activos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fema_combustible_activo_id_idx ON public.fema_combustible(activo_id);