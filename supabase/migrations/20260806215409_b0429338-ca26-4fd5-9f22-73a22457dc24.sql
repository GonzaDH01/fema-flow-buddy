
CREATE TABLE public.fema_periodos_cierre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cerrado_por uuid,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_periodos_cierre TO authenticated;
GRANT ALL ON public.fema_periodos_cierre TO service_role;

ALTER TABLE public.fema_periodos_cierre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periodos_select" ON public.fema_periodos_cierre
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "periodos_insert_admin" ON public.fema_periodos_cierre
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "periodos_update_admin" ON public.fema_periodos_cierre
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "periodos_delete_admin" ON public.fema_periodos_cierre
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER fema_periodos_updated_at BEFORE UPDATE ON public.fema_periodos_cierre
FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE OR REPLACE FUNCTION public.fema_periodo_cerrado(_fecha date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fema_periodos_cierre
     WHERE anio = EXTRACT(YEAR FROM _fecha)::int
       AND mes = EXTRACT(MONTH FROM _fecha)::int
  )
$$;

CREATE OR REPLACE FUNCTION public.fema_bloquear_periodo_cerrado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_fecha date;
BEGIN
  IF TG_OP = 'DELETE' THEN v_fecha := OLD.fecha; ELSE v_fecha := NEW.fecha; END IF;
  IF v_fecha IS NOT NULL AND public.fema_periodo_cerrado(v_fecha) THEN
    RAISE EXCEPTION 'El período % está cerrado. Reabrilo desde Auditoría para poder modificarlo.',
      to_char(v_fecha, 'MM/YYYY');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.fecha IS NOT NULL AND OLD.fecha <> NEW.fecha
     AND public.fema_periodo_cerrado(OLD.fecha) THEN
    RAISE EXCEPTION 'El período % está cerrado.', to_char(OLD.fecha, 'MM/YYYY');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER fema_bloqueo_cierre_fv
BEFORE INSERT OR UPDATE OR DELETE ON public.fema_facturas_venta
FOR EACH ROW EXECUTE FUNCTION public.fema_bloquear_periodo_cerrado();

CREATE TRIGGER fema_bloqueo_cierre_fc
BEFORE INSERT OR UPDATE OR DELETE ON public.fema_facturas_compra
FOR EACH ROW EXECUTE FUNCTION public.fema_bloquear_periodo_cerrado();

REVOKE ALL ON FUNCTION public.fema_periodo_cerrado(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fema_periodo_cerrado(date) TO authenticated;
