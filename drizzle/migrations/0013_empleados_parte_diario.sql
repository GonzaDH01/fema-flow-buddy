CREATE TABLE public.fema_asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empleado_id uuid NOT NULL REFERENCES public.fema_empleados(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  codigo text NOT NULL CHECK (codigo IN ('P','M','AJ','AI','EN','VA','FE','LL')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, fecha)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_asistencias TO authenticated;
GRANT ALL ON public.fema_asistencias TO service_role;
ALTER TABLE public.fema_asistencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY fema_asist_select ON public.fema_asistencias FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_asist_insert ON public.fema_asistencias FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY fema_asist_update ON public.fema_asistencias FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_asist_delete ON public.fema_asistencias FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER fema_asist_updated_at BEFORE UPDATE ON public.fema_asistencias
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
CREATE INDEX fema_asist_fecha_idx ON public.fema_asistencias (fecha);

ALTER TABLE public.fema_empleado_prestamos
  ADD COLUMN IF NOT EXISTS descontable boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.fema_empleado_prestamos.descontable IS 'false = no se descuenta del sueldo (ej. mercadería propia); se cobra por fuera';