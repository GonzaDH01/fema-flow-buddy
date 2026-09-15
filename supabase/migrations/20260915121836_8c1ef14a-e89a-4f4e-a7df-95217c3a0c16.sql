ALTER TABLE public.fema_activos
  ADD COLUMN IF NOT EXISTS moneda_compra text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS responsable_empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE SET NULL;