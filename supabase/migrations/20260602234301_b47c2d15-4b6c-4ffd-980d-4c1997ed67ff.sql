-- Equipos / Máquinas (propios o de transportistas)
CREATE TABLE IF NOT EXISTS public.fema_equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Tractor',
  interno TEXT,
  tenencia TEXT NOT NULL DEFAULT 'Propio',
  transportista TEXT,
  estado TEXT NOT NULL DEFAULT 'Activo',
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_equipos TO authenticated;
GRANT ALL ON public.fema_equipos TO service_role;
ALTER TABLE public.fema_equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_equipos_own" ON public.fema_equipos TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Movimientos de tanque propio (in/out)
CREATE TABLE IF NOT EXISTS public.fema_tanque_mov (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'IN', -- IN: carga al tanque, OUT: salida
  litros NUMERIC(10,2) NOT NULL,
  precio_litro NUMERIC(10,4) DEFAULT 0,
  proveedor TEXT,
  observaciones TEXT,
  anio INTEGER GENERATED ALWAYS AS (EXTRACT(year FROM fecha)::int) STORED,
  mes INTEGER GENERATED ALWAYS AS (EXTRACT(month FROM fecha)::int) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_tanque_mov TO authenticated;
GRANT ALL ON public.fema_tanque_mov TO service_role;
ALTER TABLE public.fema_tanque_mov ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_tanque_own" ON public.fema_tanque_mov TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Extender fema_combustible
ALTER TABLE public.fema_combustible
  ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES public.fema_equipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trabajo TEXT,
  ADD COLUMN IF NOT EXISTS kilometros NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS horas NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observaciones TEXT;