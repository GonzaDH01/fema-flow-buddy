CREATE TABLE public.fema_planillas_bolsero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  bolsero_empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE SET NULL,
  bolsero_nombre text,
  zona text,
  cultivo text,
  cliente_id uuid REFERENCES public.fema_clientes(id) ON DELETE SET NULL,
  imagen_path text,
  observaciones text,
  total_viajes numeric NOT NULL DEFAULT 0,
  total_metros numeric NOT NULL DEFAULT 0,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_planillas_bolsero TO authenticated;
GRANT ALL ON public.fema_planillas_bolsero TO service_role;
ALTER TABLE public.fema_planillas_bolsero ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planillas select" ON public.fema_planillas_bolsero FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "planillas insert" ON public.fema_planillas_bolsero FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "planillas update" ON public.fema_planillas_bolsero FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "planillas delete" ON public.fema_planillas_bolsero FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_planillas_updated BEFORE UPDATE ON public.fema_planillas_bolsero FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_planilla_equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  planilla_id uuid NOT NULL REFERENCES public.fema_planillas_bolsero(id) ON DELETE CASCADE,
  equipo_id uuid REFERENCES public.fema_equipos(id) ON DELETE SET NULL,
  equipo_nombre text NOT NULL,
  viajes numeric NOT NULL DEFAULT 0,
  metros_bolsa numeric NOT NULL DEFAULT 0,
  observaciones text,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_planilla_equipos TO authenticated;
GRANT ALL ON public.fema_planilla_equipos TO service_role;
ALTER TABLE public.fema_planilla_equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planilla equipos select" ON public.fema_planilla_equipos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "planilla equipos insert" ON public.fema_planilla_equipos FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "planilla equipos update" ON public.fema_planilla_equipos FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "planilla equipos delete" ON public.fema_planilla_equipos FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_planilla_equipos_updated BEFORE UPDATE ON public.fema_planilla_equipos FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE INDEX idx_planillas_fecha ON public.fema_planillas_bolsero(anio, fecha);
CREATE INDEX idx_planilla_equipos_planilla ON public.fema_planilla_equipos(planilla_id);