
-- ============ GASTOS FIJOS (plantilla) ============
CREATE TABLE public.fema_gastos_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  concepto TEXT NOT NULL,
  proveedor_id UUID REFERENCES public.fema_proveedores(id) ON DELETE SET NULL,
  categoria TEXT NOT NULL DEFAULT 'Servicios',
  monto_mensual NUMERIC(14,2) NOT NULL DEFAULT 0,
  dia_vencimiento INTEGER CHECK (dia_vencimiento BETWEEN 1 AND 31),
  mes_inicio DATE NOT NULL,
  mes_fin DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_gastos_fijos TO authenticated;
GRANT ALL ON public.fema_gastos_fijos TO service_role;
ALTER TABLE public.fema_gastos_fijos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved view gastos fijos" ON public.fema_gastos_fijos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved insert gastos fijos" ON public.fema_gastos_fijos FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "approved update gastos fijos" ON public.fema_gastos_fijos FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved delete gastos fijos" ON public.fema_gastos_fijos FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_gf_upd BEFORE UPDATE ON public.fema_gastos_fijos FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

-- ============ GASTOS FIJOS - movimientos mes ============
CREATE TABLE public.fema_gastos_fijos_mov (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gasto_fijo_id UUID NOT NULL REFERENCES public.fema_gastos_fijos(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  pagado BOOLEAN NOT NULL DEFAULT false,
  fecha_pago DATE,
  forma_pago TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gasto_fijo_id, anio, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_gastos_fijos_mov TO authenticated;
GRANT ALL ON public.fema_gastos_fijos_mov TO service_role;
ALTER TABLE public.fema_gastos_fijos_mov ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved view gf mov" ON public.fema_gastos_fijos_mov FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved insert gf mov" ON public.fema_gastos_fijos_mov FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "approved update gf mov" ON public.fema_gastos_fijos_mov FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved delete gf mov" ON public.fema_gastos_fijos_mov FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_gfmov_upd BEFORE UPDATE ON public.fema_gastos_fijos_mov FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

-- ============ CRÉDITOS ============
CREATE TABLE public.fema_creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  acreedor TEXT NOT NULL,
  descripcion TEXT,
  monto_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cantidad_cuotas INTEGER NOT NULL DEFAULT 1,
  valor_cuota NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_primera_cuota DATE NOT NULL,
  tasa NUMERIC(8,4),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_creditos TO authenticated;
GRANT ALL ON public.fema_creditos TO service_role;
ALTER TABLE public.fema_creditos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved view creditos" ON public.fema_creditos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved insert creditos" ON public.fema_creditos FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "approved update creditos" ON public.fema_creditos FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved delete creditos" ON public.fema_creditos FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_cred_upd BEFORE UPDATE ON public.fema_creditos FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

-- ============ CRÉDITOS - CUOTAS ============
CREATE TABLE public.fema_creditos_cuotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credito_id UUID NOT NULL REFERENCES public.fema_creditos(id) ON DELETE CASCADE,
  numero_cuota INTEGER NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago DATE,
  forma_pago TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (credito_id, numero_cuota)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_creditos_cuotas TO authenticated;
GRANT ALL ON public.fema_creditos_cuotas TO service_role;
ALTER TABLE public.fema_creditos_cuotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved view cuotas" ON public.fema_creditos_cuotas FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved insert cuotas" ON public.fema_creditos_cuotas FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "approved update cuotas" ON public.fema_creditos_cuotas FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "approved delete cuotas" ON public.fema_creditos_cuotas FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER trg_cuotas_upd BEFORE UPDATE ON public.fema_creditos_cuotas FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
