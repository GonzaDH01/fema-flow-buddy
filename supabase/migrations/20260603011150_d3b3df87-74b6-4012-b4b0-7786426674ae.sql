
CREATE OR REPLACE FUNCTION public.fema_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.fema_movimientos_pago (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instrumento TEXT NOT NULL CHECK (instrumento IN ('echeq','cheque_fisico','transferencia','cesion','efectivo','otro')),
  direccion TEXT NOT NULL CHECK (direccion IN ('cobro','pago')),
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('cobro_cliente','pago_proveedor','ceder_echeq','libre')),
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  vencimiento DATE,
  numero TEXT,
  banco TEXT,
  contraparte TEXT,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'en_cartera' CHECK (estado IN ('en_cartera','cobrado','pagado','cedido','vencido','anulado')),
  factura_venta_id UUID,
  factura_compra_id UUID,
  echeq_origen_id UUID REFERENCES public.fema_movimientos_pago(id) ON DELETE SET NULL,
  observaciones TEXT,
  anio INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  mes INT NOT NULL DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_movimientos_pago TO authenticated;
GRANT ALL ON public.fema_movimientos_pago TO service_role;

ALTER TABLE public.fema_movimientos_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own movs" ON public.fema_movimientos_pago FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own movs" ON public.fema_movimientos_pago FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own movs" ON public.fema_movimientos_pago FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own movs" ON public.fema_movimientos_pago FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_movs_user_anio ON public.fema_movimientos_pago(user_id, anio);
CREATE INDEX idx_movs_instrumento ON public.fema_movimientos_pago(instrumento);
CREATE INDEX idx_movs_estado ON public.fema_movimientos_pago(estado);

CREATE TRIGGER fema_movs_set_updated_at
BEFORE UPDATE ON public.fema_movimientos_pago
FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
