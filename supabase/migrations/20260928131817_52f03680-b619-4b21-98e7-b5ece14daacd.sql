
CREATE TABLE public.fema_empleado_prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  empleado_id uuid NOT NULL REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text NOT NULL,
  detalle text,
  monto numeric NOT NULL DEFAULT 0,
  cuotas integer NOT NULL DEFAULT 1,
  valor_cuota numeric NOT NULL DEFAULT 0,
  factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  observaciones text,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_empleado_prestamos TO authenticated;
GRANT ALL ON public.fema_empleado_prestamos TO service_role;
ALTER TABLE public.fema_empleado_prestamos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aprobados leen prestamos" ON public.fema_empleado_prestamos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "aprobados crean prestamos" ON public.fema_empleado_prestamos FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "aprobados editan prestamos" ON public.fema_empleado_prestamos FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "aprobados borran prestamos" ON public.fema_empleado_prestamos FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE TABLE public.fema_empleado_prestamo_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  prestamo_id uuid NOT NULL REFERENCES public.fema_empleado_prestamos(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  monto numeric NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'descuento',
  pago_id uuid REFERENCES public.fema_pagos_empleado(id) ON DELETE SET NULL,
  cuenta_id uuid REFERENCES public.fema_cuentas_bancarias(id) ON DELETE SET NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_empleado_prestamo_mov TO authenticated;
GRANT ALL ON public.fema_empleado_prestamo_mov TO service_role;
ALTER TABLE public.fema_empleado_prestamo_mov ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aprobados leen prestamo mov" ON public.fema_empleado_prestamo_mov FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "aprobados crean prestamo mov" ON public.fema_empleado_prestamo_mov FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "aprobados editan prestamo mov" ON public.fema_empleado_prestamo_mov FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "aprobados borran prestamo mov" ON public.fema_empleado_prestamo_mov FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE INDEX idx_prestamos_empleado ON public.fema_empleado_prestamos(empleado_id);
CREATE INDEX idx_prestamo_mov_prestamo ON public.fema_empleado_prestamo_mov(prestamo_id);

CREATE TRIGGER trg_prestamos_updated BEFORE UPDATE ON public.fema_empleado_prestamos FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
CREATE TRIGGER trg_prestamo_mov_updated BEFORE UPDATE ON public.fema_empleado_prestamo_mov FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
