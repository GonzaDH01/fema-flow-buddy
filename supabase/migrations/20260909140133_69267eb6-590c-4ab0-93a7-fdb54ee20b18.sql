CREATE SEQUENCE IF NOT EXISTS public.fema_remitos_serie_seq;

CREATE TABLE public.fema_remitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  serie bigint NOT NULL DEFAULT nextval('public.fema_remitos_serie_seq') UNIQUE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'compra' CHECK (tipo IN ('compra','venta')),
  numero text,
  tercero_nombre text,
  tercero_cuit text,
  proveedor_id uuid REFERENCES public.fema_proveedores(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.fema_clientes(id) ON DELETE SET NULL,
  detalle text,
  observaciones text,
  imagen_path text,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE public.fema_remitos_serie_seq OWNED BY public.fema_remitos.serie;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_remitos TO authenticated;
GRANT ALL ON public.fema_remitos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fema_remitos_serie_seq TO authenticated;
GRANT ALL ON SEQUENCE public.fema_remitos_serie_seq TO service_role;

ALTER TABLE public.fema_remitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios aprobados ven los remitos" ON public.fema_remitos
  FOR SELECT TO authenticated USING (is_approved(auth.uid()));
CREATE POLICY "Usuarios aprobados insertan remitos" ON public.fema_remitos
  FOR INSERT TO authenticated WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "Usuarios aprobados editan remitos" ON public.fema_remitos
  FOR UPDATE TO authenticated USING (is_approved(auth.uid())) WITH CHECK (is_approved(auth.uid()));
CREATE POLICY "Usuarios aprobados eliminan remitos" ON public.fema_remitos
  FOR DELETE TO authenticated USING (is_approved(auth.uid()));

CREATE INDEX idx_fema_remitos_fecha ON public.fema_remitos (fecha DESC);

CREATE TRIGGER fema_remitos_updated_at BEFORE UPDATE ON public.fema_remitos
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();