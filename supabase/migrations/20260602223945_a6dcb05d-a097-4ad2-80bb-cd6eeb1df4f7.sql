
CREATE TYPE public.estado_recibo AS ENUM ('borrador', 'pagado', 'anulado');
CREATE TYPE public.tipo_concepto AS ENUM ('haber', 'descuento');

CREATE TABLE public.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legajo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  cuil TEXT,
  email TEXT,
  telefono TEXT,
  fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
  cargo TEXT,
  sueldo_basico NUMERIC NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados TO authenticated;
GRANT ALL ON public.empleados TO service_role;

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin or contador empleados" ON public.empleados FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));
CREATE POLICY "insert own empleados" ON public.empleados FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update own or admin empleados" ON public.empleados FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));
CREATE POLICY "delete own or admin empleados" ON public.empleados FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_empleados_updated_at BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.recibos_sueldo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL,
  periodo DATE NOT NULL,
  fecha_pago DATE,
  sueldo_bruto NUMERIC NOT NULL DEFAULT 0,
  total_descuentos NUMERIC NOT NULL DEFAULT 0,
  sueldo_neto NUMERIC NOT NULL DEFAULT 0,
  estado public.estado_recibo NOT NULL DEFAULT 'borrador',
  notas TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibos_sueldo TO authenticated;
GRANT ALL ON public.recibos_sueldo TO service_role;

ALTER TABLE public.recibos_sueldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin or contador recibos" ON public.recibos_sueldo FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));
CREATE POLICY "insert own recibos" ON public.recibos_sueldo FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update own or admin recibos" ON public.recibos_sueldo FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));
CREATE POLICY "delete own or admin recibos" ON public.recibos_sueldo FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_recibos_updated_at BEFORE UPDATE ON public.recibos_sueldo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.recibo_conceptos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recibo_id UUID NOT NULL,
  tipo public.tipo_concepto NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibo_conceptos TO authenticated;
GRANT ALL ON public.recibo_conceptos TO service_role;

ALTER TABLE public.recibo_conceptos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view conceptos via recibo" ON public.recibo_conceptos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recibos_sueldo r WHERE r.id = recibo_conceptos.recibo_id
    AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'))));
CREATE POLICY "insert conceptos via recibo" ON public.recibo_conceptos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.recibos_sueldo r WHERE r.id = recibo_conceptos.recibo_id AND r.created_by = auth.uid()));
CREATE POLICY "update conceptos via recibo" ON public.recibo_conceptos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recibos_sueldo r WHERE r.id = recibo_conceptos.recibo_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "delete conceptos via recibo" ON public.recibo_conceptos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recibos_sueldo r WHERE r.id = recibo_conceptos.recibo_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'admin'))));
