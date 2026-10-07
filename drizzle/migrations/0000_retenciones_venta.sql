ALTER TABLE public.fema_movimientos_pago DROP CONSTRAINT fema_movimientos_pago_instrumento_check;
ALTER TABLE public.fema_movimientos_pago ADD CONSTRAINT fema_movimientos_pago_instrumento_check CHECK (instrumento = ANY (ARRAY['echeq','cheque_fisico','transferencia','cesion','efectivo','otro','retencion']));

CREATE TABLE public.fema_retenciones_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  factura_venta_id uuid NOT NULL REFERENCES public.fema_facturas_venta(id) ON DELETE CASCADE,
  movimiento_pago_id uuid REFERENCES public.fema_movimientos_pago(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('iibb','ganancias','iva','suss')),
  jurisdiccion text,
  numero_certificado text NOT NULL,
  fecha date NOT NULL,
  base_imponible numeric NOT NULL DEFAULT 0,
  alicuota numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL CHECK (importe > 0),
  archivo_path text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_retenciones_venta TO authenticated;
GRANT ALL ON public.fema_retenciones_venta TO service_role;
ALTER TABLE public.fema_retenciones_venta ENABLE ROW LEVEL SECURITY;
CREATE POLICY ret_select ON public.fema_retenciones_venta FOR SELECT TO authenticated USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY ret_insert ON public.fema_retenciones_venta FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY ret_update ON public.fema_retenciones_venta FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY ret_delete ON public.fema_retenciones_venta FOR DELETE TO authenticated USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX ON public.fema_retenciones_venta(factura_venta_id);
CREATE TRIGGER trg_ret_updated BEFORE UPDATE ON public.fema_retenciones_venta FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();