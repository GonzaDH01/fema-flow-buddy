ALTER TABLE public.fema_productos
  ADD COLUMN IF NOT EXISTS precio_compra numeric,
  ADD COLUMN IF NOT EXISTS precio_venta numeric,
  ADD COLUMN IF NOT EXISTS stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_minimo numeric NOT NULL DEFAULT 0;

UPDATE public.fema_productos SET precio_venta = precio WHERE precio_venta IS NULL;

CREATE TABLE IF NOT EXISTS public.fema_stock_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.fema_productos(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'entrada',
  cantidad numeric NOT NULL DEFAULT 0,
  costo_unitario numeric,
  motivo text,
  stock_resultante numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_stock_mov TO authenticated;
GRANT ALL ON public.fema_stock_mov TO service_role;
ALTER TABLE public.fema_stock_mov ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stockmov_select" ON public.fema_stock_mov FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "stockmov_insert" ON public.fema_stock_mov FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "stockmov_update" ON public.fema_stock_mov FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "stockmov_delete" ON public.fema_stock_mov FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER fema_stock_mov_updated_at BEFORE UPDATE ON public.fema_stock_mov FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE IF NOT EXISTS public.fema_venta_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  factura_venta_id uuid NOT NULL REFERENCES public.fema_facturas_venta(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.fema_productos(id) ON DELETE SET NULL,
  descripcion text NOT NULL,
  unidad text,
  cantidad numeric NOT NULL DEFAULT 0,
  precio_unitario numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL DEFAULT 0,
  orden integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_venta_items TO authenticated;
GRANT ALL ON public.fema_venta_items TO service_role;
ALTER TABLE public.fema_venta_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventaitems_select" ON public.fema_venta_items FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "ventaitems_insert" ON public.fema_venta_items FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "ventaitems_update" ON public.fema_venta_items FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "ventaitems_delete" ON public.fema_venta_items FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER fema_venta_items_updated_at BEFORE UPDATE ON public.fema_venta_items FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_fema_venta_items_factura ON public.fema_venta_items(factura_venta_id);
CREATE INDEX IF NOT EXISTS idx_fema_stock_mov_producto ON public.fema_stock_mov(producto_id, fecha);