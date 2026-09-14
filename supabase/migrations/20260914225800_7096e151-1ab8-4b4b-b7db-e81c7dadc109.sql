CREATE TABLE public.fema_empleado_carnets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empleado_id uuid NOT NULL REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  categorias text,
  numero text,
  autoridad text,
  fecha_emision date,
  fecha_vencimiento date NOT NULL,
  imagen_path text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_empleado_carnets TO authenticated;
GRANT ALL ON public.fema_empleado_carnets TO service_role;

ALTER TABLE public.fema_empleado_carnets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carnets_select" ON public.fema_empleado_carnets FOR SELECT TO authenticated USING (is_approved(auth.uid()));
CREATE POLICY "carnets_insert" ON public.fema_empleado_carnets FOR INSERT TO authenticated WITH CHECK (is_approved(auth.uid()));
CREATE POLICY "carnets_update" ON public.fema_empleado_carnets FOR UPDATE TO authenticated USING (is_approved(auth.uid())) WITH CHECK (is_approved(auth.uid()));
CREATE POLICY "carnets_delete" ON public.fema_empleado_carnets FOR DELETE TO authenticated USING (is_approved(auth.uid()));

CREATE INDEX idx_fema_empleado_carnets_empleado ON public.fema_empleado_carnets(empleado_id);
CREATE INDEX idx_fema_empleado_carnets_venc ON public.fema_empleado_carnets(fecha_vencimiento);

CREATE TRIGGER trg_fema_empleado_carnets_updated
BEFORE UPDATE ON public.fema_empleado_carnets
FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();