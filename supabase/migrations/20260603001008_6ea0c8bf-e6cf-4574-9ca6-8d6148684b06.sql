CREATE TABLE public.fema_viajes_transp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fecha date NOT NULL,
  transportista text NOT NULL,
  equipo_id uuid,
  ubicacion text,
  origen text,
  destino text,
  cantidad_viajes numeric NOT NULL DEFAULT 1,
  precio_viaje numeric DEFAULT 0,
  total numeric DEFAULT 0,
  trabajo text,
  observaciones text,
  mes integer,
  anio integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_viajes_transp TO authenticated;
GRANT ALL ON public.fema_viajes_transp TO service_role;

ALTER TABLE public.fema_viajes_transp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fema_viajes_own" ON public.fema_viajes_transp FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);