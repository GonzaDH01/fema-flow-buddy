
ALTER TABLE public.fema_empleados
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS funcion text,
  ADD COLUMN IF NOT EXISTS tipo_contratacion text DEFAULT 'Mensualizado',
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS domicilio text,
  ADD COLUMN IF NOT EXISTS valor_hora numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacto_emergencia text,
  ADD COLUMN IF NOT EXISTS obra_social text,
  ADD COLUMN IF NOT EXISTS observaciones text;

ALTER TABLE public.fema_sueldos
  ADD COLUMN IF NOT EXISTS mes integer,
  ADD COLUMN IF NOT EXISTS anio integer,
  ADD COLUMN IF NOT EXISTS basico numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Pendiente',
  ADD COLUMN IF NOT EXISTS rol text,
  ADD COLUMN IF NOT EXISTS observaciones text;

CREATE TABLE IF NOT EXISTS public.fema_horas_trabajadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  horas numeric(6,2) NOT NULL DEFAULT 0,
  referencia text,
  tarea text,
  observaciones text,
  mes integer,
  anio integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_horas_trabajadas TO authenticated;
GRANT ALL ON public.fema_horas_trabajadas TO service_role;

ALTER TABLE public.fema_horas_trabajadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fema_horas_own" ON public.fema_horas_trabajadas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
