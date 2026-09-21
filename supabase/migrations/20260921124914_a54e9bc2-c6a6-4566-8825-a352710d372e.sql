CREATE TABLE public.fema_recordatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  titulo text NOT NULL,
  detalle text,
  categoria text NOT NULL DEFAULT 'ARCA',
  dia_mes integer NOT NULL DEFAULT 1,
  mensual boolean NOT NULL DEFAULT true,
  fecha date,
  prioridad text NOT NULL DEFAULT 'media',
  activo boolean NOT NULL DEFAULT true,
  es_sistema boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_recordatorios TO authenticated;
GRANT ALL ON public.fema_recordatorios TO service_role;
ALTER TABLE public.fema_recordatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recordatorios_select" ON public.fema_recordatorios
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "recordatorios_insert" ON public.fema_recordatorios
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "recordatorios_update" ON public.fema_recordatorios
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "recordatorios_delete" ON public.fema_recordatorios
  FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()) AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE TRIGGER fema_recordatorios_updated_at
  BEFORE UPDATE ON public.fema_recordatorios
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_recordatorio_hechos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recordatorio_id uuid NOT NULL REFERENCES public.fema_recordatorios(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  mes integer NOT NULL,
  user_id uuid,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recordatorio_id, anio, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_recordatorio_hechos TO authenticated;
GRANT ALL ON public.fema_recordatorio_hechos TO service_role;
ALTER TABLE public.fema_recordatorio_hechos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recordatorio_hechos_select" ON public.fema_recordatorio_hechos
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "recordatorio_hechos_insert" ON public.fema_recordatorio_hechos
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "recordatorio_hechos_update" ON public.fema_recordatorio_hechos
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "recordatorio_hechos_delete" ON public.fema_recordatorio_hechos
  FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE TABLE public.fema_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id uuid,
  autor_nombre text,
  destinatario_id uuid,
  texto text NOT NULL,
  prioridad text NOT NULL DEFAULT 'normal',
  resuelto boolean NOT NULL DEFAULT false,
  resuelto_por uuid,
  resuelto_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_mensajes TO authenticated;
GRANT ALL ON public.fema_mensajes TO service_role;
ALTER TABLE public.fema_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensajes_select" ON public.fema_mensajes
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "mensajes_insert" ON public.fema_mensajes
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND autor_id = auth.uid());
CREATE POLICY "mensajes_update" ON public.fema_mensajes
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "mensajes_delete" ON public.fema_mensajes
  FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()) AND (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE TRIGGER fema_mensajes_updated_at
  BEFORE UPDATE ON public.fema_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE INDEX idx_fema_mensajes_creado ON public.fema_mensajes (created_at DESC);
CREATE INDEX idx_fema_recordatorio_hechos_periodo ON public.fema_recordatorio_hechos (anio, mes);

INSERT INTO public.fema_recordatorios (titulo, detalle, categoria, dia_mes, prioridad, es_sistema) VALUES
  ('Cierre de mes: cargar compras y ventas', 'Verificar que estén cargados todos los comprobantes del mes anterior para el contador.', 'Operativo', 1, 'alta', true),
  ('Pago de gastos fijos del mes', 'Servicios, seguros y alquileres de la primera semana.', 'Operativo', 3, 'media', true),
  ('ARCA — Autónomos', 'Vencimiento del aporte de autónomos.', 'ARCA', 7, 'alta', true),
  ('ARCA — Cargas sociales F.931', 'Presentación y pago del formulario 931 del personal.', 'ARCA', 10, 'alta', true),
  ('Sueldos y jornales — 1ra quincena', 'Liquidar y abonar la primera quincena del personal.', 'Operativo', 5, 'media', true),
  ('Sueldos y jornales — 2da quincena', 'Liquidar y abonar la segunda quincena del personal.', 'Operativo', 20, 'media', true),
  ('ARCA — IVA y Libro de IVA Digital', 'Presentación y pago de la posición mensual de IVA.', 'ARCA', 18, 'critica', true),
  ('Ingresos Brutos (IIBB)', 'Declaración y pago del anticipo mensual de IIBB.', 'ARCA', 15, 'alta', true),
  ('Anticipo de Ganancias', 'Verificar con el contador si corresponde anticipo este mes.', 'ARCA', 13, 'media', true);