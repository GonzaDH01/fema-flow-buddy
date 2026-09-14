ALTER TABLE public.fema_empleados
  ADD COLUMN IF NOT EXISTS importe_periodo numeric NOT NULL DEFAULT 0;