-- ============ PRESUPUESTOS ============
CREATE TYPE public.estado_presupuesto AS ENUM ('borrador','enviado','aprobado','rechazado','convertido');

CREATE TABLE public.presupuestos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero INTEGER NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  validez_dias INTEGER NOT NULL DEFAULT 15,
  cliente_id UUID,
  estado estado_presupuesto NOT NULL DEFAULT 'borrador',
  subtotal_neto NUMERIC NOT NULL DEFAULT 0,
  iva_total NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notas TEXT,
  factura_id UUID,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presupuestos TO authenticated;
GRANT ALL ON public.presupuestos TO service_role;
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin presupuestos" ON public.presupuestos
FOR SELECT TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'));

CREATE POLICY "insert own presupuestos" ON public.presupuestos
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "update own or admin presupuestos" ON public.presupuestos
FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delete own or admin presupuestos" ON public.presupuestos
FOR DELETE TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_presupuestos_updated
BEFORE UPDATE ON public.presupuestos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.presupuesto_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presupuesto_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  producto_id UUID,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  alicuota_iva NUMERIC NOT NULL DEFAULT 21,
  subtotal_neto NUMERIC NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presupuesto_items TO authenticated;
GRANT ALL ON public.presupuesto_items TO service_role;
ALTER TABLE public.presupuesto_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view items via presupuesto" ON public.presupuesto_items
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.presupuestos p WHERE p.id = presupuesto_items.presupuesto_id
  AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'))));

CREATE POLICY "insert items via presupuesto" ON public.presupuesto_items
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.presupuestos p WHERE p.id = presupuesto_items.presupuesto_id AND p.created_by = auth.uid()));

CREATE POLICY "update items via presupuesto" ON public.presupuesto_items
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.presupuestos p WHERE p.id = presupuesto_items.presupuesto_id
  AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY "delete items via presupuesto" ON public.presupuesto_items
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.presupuestos p WHERE p.id = presupuesto_items.presupuesto_id
  AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- ============ GASTOS ============
CREATE TYPE public.categoria_gasto AS ENUM ('servicios','alquiler','sueldos','impuestos','insumos','marketing','transporte','mantenimiento','otros');
CREATE TYPE public.metodo_pago AS ENUM ('efectivo','transferencia','debito','credito','cheque','otro');

CREATE TABLE public.gastos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria categoria_gasto NOT NULL DEFAULT 'otros',
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  metodo_pago metodo_pago NOT NULL DEFAULT 'efectivo',
  proveedor_id UUID,
  comprobante_numero TEXT,
  notas TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos TO authenticated;
GRANT ALL ON public.gastos TO service_role;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin gastos" ON public.gastos
FOR SELECT TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'contador'));

CREATE POLICY "insert own gastos" ON public.gastos
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "update own or admin gastos" ON public.gastos
FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delete own or admin gastos" ON public.gastos
FOR DELETE TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_gastos_updated
BEFORE UPDATE ON public.gastos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();