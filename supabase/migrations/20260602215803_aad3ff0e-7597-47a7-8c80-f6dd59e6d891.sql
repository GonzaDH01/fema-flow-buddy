
-- Drop placeholder
DROP TABLE IF EXISTS public.clientes CASCADE;

-- Enums
CREATE TYPE public.tipo_persona AS ENUM ('cliente', 'proveedor', 'ambos');
CREATE TYPE public.condicion_iva AS ENUM (
  'responsable_inscripto', 'monotributo', 'exento', 'consumidor_final', 'no_responsable'
);
CREATE TYPE public.tipo_factura AS ENUM ('A', 'B', 'C', 'E', 'M');
CREATE TYPE public.estado_factura AS ENUM ('borrador', 'emitida', 'pagada', 'anulada');
CREATE TYPE public.tipo_retencion AS ENUM ('ganancias', 'iva', 'iibb', 'suss');
CREATE TYPE public.tipo_percepcion AS ENUM ('iva', 'iibb');

-- ============ clientes_proveedores ============
CREATE TABLE public.clientes_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_persona NOT NULL DEFAULT 'cliente',
  razon_social TEXT NOT NULL,
  cuit TEXT,
  condicion_iva public.condicion_iva NOT NULL DEFAULT 'consumidor_final',
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  notas TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes_proveedores TO authenticated;
GRANT ALL ON public.clientes_proveedores TO service_role;
ALTER TABLE public.clientes_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin clientes_proveedores" ON public.clientes_proveedores
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "insert own clientes_proveedores" ON public.clientes_proveedores
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update own or admin clientes_proveedores" ON public.clientes_proveedores
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "delete own or admin clientes_proveedores" ON public.clientes_proveedores
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.clientes_proveedores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_cp_created_by ON public.clientes_proveedores(created_by);
CREATE INDEX idx_cp_cuit ON public.clientes_proveedores(cuit);

-- ============ facturas ============
CREATE TABLE public.facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_factura NOT NULL,
  punto_venta INTEGER NOT NULL DEFAULT 1,
  numero INTEGER NOT NULL,
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  cliente_proveedor_id UUID REFERENCES public.clientes_proveedores(id) ON DELETE RESTRICT,
  concepto TEXT,
  neto NUMERIC(14,2) NOT NULL DEFAULT 0,
  iva_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  percepciones_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  retenciones_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado public.estado_factura NOT NULL DEFAULT 'borrador',
  notas TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, punto_venta, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas TO authenticated;
GRANT ALL ON public.facturas TO service_role;
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin facturas" ON public.facturas
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "insert own facturas" ON public.facturas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update own or admin facturas" ON public.facturas
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "delete own or admin facturas" ON public.facturas
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_facturas_updated BEFORE UPDATE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_facturas_created_by ON public.facturas(created_by);
CREATE INDEX idx_facturas_cp ON public.facturas(cliente_proveedor_id);
CREATE INDEX idx_facturas_fecha ON public.facturas(fecha_emision);

-- ============ iva (detalle por alícuota) ============
CREATE TABLE public.iva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  alicuota NUMERIC(5,2) NOT NULL,
  base_imponible NUMERIC(14,2) NOT NULL DEFAULT 0,
  importe NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iva TO authenticated;
GRANT ALL ON public.iva TO service_role;
ALTER TABLE public.iva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view iva via factura" ON public.iva
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "insert iva via factura" ON public.iva
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id AND f.created_by = auth.uid()));
CREATE POLICY "update iva via factura" ON public.iva
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "delete iva via factura" ON public.iva
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE INDEX idx_iva_factura ON public.iva(factura_id);

-- ============ retenciones ============
CREATE TABLE public.retenciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  tipo public.tipo_retencion NOT NULL,
  base_imponible NUMERIC(14,2) NOT NULL DEFAULT 0,
  alicuota NUMERIC(5,2) NOT NULL DEFAULT 0,
  importe NUMERIC(14,2) NOT NULL DEFAULT 0,
  jurisdiccion TEXT,
  numero_certificado TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retenciones TO authenticated;
GRANT ALL ON public.retenciones TO service_role;
ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view retenciones via factura" ON public.retenciones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "insert retenciones via factura" ON public.retenciones
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id AND f.created_by = auth.uid()));
CREATE POLICY "update retenciones via factura" ON public.retenciones
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "delete retenciones via factura" ON public.retenciones
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE INDEX idx_ret_factura ON public.retenciones(factura_id);

-- ============ percepciones ============
CREATE TABLE public.percepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  tipo public.tipo_percepcion NOT NULL,
  base_imponible NUMERIC(14,2) NOT NULL DEFAULT 0,
  alicuota NUMERIC(5,2) NOT NULL DEFAULT 0,
  importe NUMERIC(14,2) NOT NULL DEFAULT 0,
  jurisdiccion TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.percepciones TO authenticated;
GRANT ALL ON public.percepciones TO service_role;
ALTER TABLE public.percepciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view percepciones via factura" ON public.percepciones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "insert percepciones via factura" ON public.percepciones
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id AND f.created_by = auth.uid()));
CREATE POLICY "update percepciones via factura" ON public.percepciones
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "delete percepciones via factura" ON public.percepciones
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = factura_id
    AND (f.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE INDEX idx_perc_factura ON public.percepciones(factura_id);
