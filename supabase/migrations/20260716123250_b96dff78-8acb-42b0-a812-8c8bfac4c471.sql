
CREATE TABLE public.fema_cuentas_bancarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  banco TEXT NOT NULL,
  alias TEXT,
  numero_cuenta TEXT,
  cbu TEXT,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_cuentas_bancarias TO authenticated;
GRANT ALL ON public.fema_cuentas_bancarias TO service_role;

ALTER TABLE public.fema_cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_shared_select" ON public.fema_cuentas_bancarias FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "cuentas_shared_insert" ON public.fema_cuentas_bancarias FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "cuentas_shared_update" ON public.fema_cuentas_bancarias FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "cuentas_shared_delete" ON public.fema_cuentas_bancarias FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER fema_cuentas_set_updated_at BEFORE UPDATE ON public.fema_cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();
