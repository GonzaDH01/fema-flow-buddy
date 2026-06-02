
CREATE TABLE public.factura_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  alicuota_iva NUMERIC NOT NULL DEFAULT 21,
  subtotal_neto NUMERIC NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factura_items TO authenticated;
GRANT ALL ON public.factura_items TO service_role;

ALTER TABLE public.factura_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view items via factura" ON public.factura_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f
    WHERE f.id = factura_items.factura_id
    AND (f.created_by = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE POLICY "insert items via factura" ON public.factura_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (
    SELECT 1 FROM public.facturas f WHERE f.id = factura_items.factura_id AND f.created_by = auth.uid()));

CREATE POLICY "update items via factura" ON public.factura_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f
    WHERE f.id = factura_items.factura_id
    AND (f.created_by = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE POLICY "delete items via factura" ON public.factura_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f
    WHERE f.id = factura_items.factura_id
    AND (f.created_by = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tipo tipo_factura;
  v_delta NUMERIC := 0;
  v_prod UUID;
  v_qty NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_prod := NEW.producto_id;
    v_qty := NEW.cantidad;
    SELECT tipo INTO v_tipo FROM public.facturas WHERE id = NEW.factura_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_prod := OLD.producto_id;
    v_qty := OLD.cantidad;
    SELECT tipo INTO v_tipo FROM public.facturas WHERE id = OLD.factura_id;
  END IF;

  IF v_prod IS NULL OR v_tipo IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_tipo IN ('A','B','C') THEN
    v_delta := -v_qty;
  ELSIF v_tipo IN ('E','M') THEN
    v_delta := v_qty;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_delta := -v_delta;
  END IF;

  UPDATE public.productos SET stock = stock + v_delta WHERE id = v_prod;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_items_stock_ins AFTER INSERT ON public.factura_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE TRIGGER trg_items_stock_del AFTER DELETE ON public.factura_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
