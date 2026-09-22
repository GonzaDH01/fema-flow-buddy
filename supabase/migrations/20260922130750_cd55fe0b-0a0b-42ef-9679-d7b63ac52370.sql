CREATE TABLE public.fema_compra_activos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  factura_compra_id uuid NOT NULL REFERENCES public.fema_facturas_compra(id) ON DELETE CASCADE,
  activo_id uuid NOT NULL REFERENCES public.fema_activos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factura_compra_id, activo_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_compra_activos TO authenticated;
GRANT ALL ON public.fema_compra_activos TO service_role;
ALTER TABLE public.fema_compra_activos ENABLE ROW LEVEL SECURITY;

CREATE POLICY compra_activos_select ON public.fema_compra_activos FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY compra_activos_insert ON public.fema_compra_activos FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY compra_activos_update ON public.fema_compra_activos FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY compra_activos_delete ON public.fema_compra_activos FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));

CREATE INDEX idx_compra_activos_factura ON public.fema_compra_activos(factura_compra_id);
CREATE INDEX idx_compra_activos_activo ON public.fema_compra_activos(activo_id);

CREATE TABLE public.fema_doc_compra_activos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  doc_id uuid NOT NULL REFERENCES public.fema_doc_compras(id) ON DELETE CASCADE,
  activo_id uuid NOT NULL REFERENCES public.fema_activos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, activo_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_doc_compra_activos TO authenticated;
GRANT ALL ON public.fema_doc_compra_activos TO service_role;
ALTER TABLE public.fema_doc_compra_activos ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_compra_activos_select ON public.fema_doc_compra_activos FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY doc_compra_activos_insert ON public.fema_doc_compra_activos FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY doc_compra_activos_update ON public.fema_doc_compra_activos FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY doc_compra_activos_delete ON public.fema_doc_compra_activos FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));

CREATE INDEX idx_doc_compra_activos_doc ON public.fema_doc_compra_activos(doc_id);
CREATE INDEX idx_doc_compra_activos_activo ON public.fema_doc_compra_activos(activo_id);

INSERT INTO public.fema_doc_compra_activos (user_id, doc_id, activo_id)
SELECT user_id, id, activo_id FROM public.fema_doc_compras WHERE activo_id IS NOT NULL
ON CONFLICT DO NOTHING;