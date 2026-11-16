CREATE TABLE public.fema_precios_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.fema_productos(id) ON DELETE CASCADE,
  tipo_precio text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  precio_anterior numeric,
  precio_nuevo numeric,
  porcentaje numeric,
  moneda text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_precios_historial TO authenticated;
GRANT ALL ON public.fema_precios_historial TO service_role;
ALTER TABLE public.fema_precios_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aprobados ven historial precios" ON public.fema_precios_historial FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Aprobados insertan historial precios" ON public.fema_precios_historial FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Aprobados borran historial precios" ON public.fema_precios_historial FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE INDEX ON public.fema_precios_historial(producto_id, created_at);

CREATE OR REPLACE FUNCTION public.fema_log_precio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.precio_venta IS NOT NULL THEN
      INSERT INTO fema_precios_historial(producto_id,tipo_precio,precio_anterior,precio_nuevo,moneda,user_id) VALUES (NEW.id,'venta',NULL,NEW.precio_venta,NEW.moneda,auth.uid());
    END IF;
    IF NEW.precio_compra IS NOT NULL THEN
      INSERT INTO fema_precios_historial(producto_id,tipo_precio,precio_anterior,precio_nuevo,moneda,user_id) VALUES (NEW.id,'compra',NULL,NEW.precio_compra,NEW.moneda,auth.uid());
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.precio_venta IS DISTINCT FROM OLD.precio_venta THEN
    INSERT INTO fema_precios_historial(producto_id,tipo_precio,precio_anterior,precio_nuevo,porcentaje,moneda,user_id)
    VALUES (NEW.id,'venta',OLD.precio_venta,NEW.precio_venta,
      CASE WHEN COALESCE(OLD.precio_venta,0)<>0 AND NEW.precio_venta IS NOT NULL THEN round((NEW.precio_venta-OLD.precio_venta)/OLD.precio_venta*100,2) END,NEW.moneda,auth.uid());
  END IF;
  IF NEW.precio_compra IS DISTINCT FROM OLD.precio_compra THEN
    INSERT INTO fema_precios_historial(producto_id,tipo_precio,precio_anterior,precio_nuevo,porcentaje,moneda,user_id)
    VALUES (NEW.id,'compra',OLD.precio_compra,NEW.precio_compra,
      CASE WHEN COALESCE(OLD.precio_compra,0)<>0 AND NEW.precio_compra IS NOT NULL THEN round((NEW.precio_compra-OLD.precio_compra)/OLD.precio_compra*100,2) END,NEW.moneda,auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fema_log_precio AFTER INSERT OR UPDATE ON public.fema_productos FOR EACH ROW EXECUTE FUNCTION public.fema_log_precio();

INSERT INTO public.fema_precios_historial(producto_id,tipo_precio,fecha,precio_nuevo,moneda,user_id)
SELECT id,'venta',COALESCE(updated_at::date,current_date),precio_venta,moneda,user_id FROM public.fema_productos WHERE precio_venta IS NOT NULL;
INSERT INTO public.fema_precios_historial(producto_id,tipo_precio,fecha,precio_nuevo,moneda,user_id)
SELECT id,'compra',COALESCE(updated_at::date,current_date),precio_compra,moneda,user_id FROM public.fema_productos WHERE precio_compra IS NOT NULL;