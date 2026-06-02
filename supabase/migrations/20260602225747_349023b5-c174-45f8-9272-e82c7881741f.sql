
-- Enums adicionales
DO $$ BEGIN
  CREATE TYPE public.estado_factura_venta AS ENUM ('pendiente','cobrada');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE public.estado_factura_compra AS ENUM ('pendiente','pagada');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE public.categoria_compra AS ENUM ('Repuestos_JD','Mecanicos','Gomeria','Inoculante','Transportistas','Seguros','Servicios','Herramientas','Otro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Helper updated_at (usar el existente tg_set_updated_at)

-- CLIENTES (FEMA)
CREATE TABLE public.fema_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cuit text,
  email text,
  telefono text,
  condicion_iva text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_clientes TO authenticated;
GRANT ALL ON public.fema_clientes TO service_role;
ALTER TABLE public.fema_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_cli_own" ON public.fema_clientes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_fc1 BEFORE UPDATE ON public.fema_clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PROVEEDORES
CREATE TABLE public.fema_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cuit text,
  email text,
  telefono text,
  categoria public.categoria_compra DEFAULT 'Otro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_proveedores TO authenticated;
GRANT ALL ON public.fema_proveedores TO service_role;
ALTER TABLE public.fema_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_prov_own" ON public.fema_proveedores FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_fp1 BEFORE UPDATE ON public.fema_proveedores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FACTURAS VENTA
CREATE TABLE public.fema_facturas_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  cliente_id uuid REFERENCES public.fema_clientes(id) ON DELETE SET NULL,
  numero text,
  tipo public.tipo_factura NOT NULL DEFAULT 'B',
  neto numeric(14,2) DEFAULT 0,
  iva_21 numeric(14,2) DEFAULT 0,
  iva_105 numeric(14,2) DEFAULT 0,
  percepciones numeric(14,2) DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  condicion_pago text,
  estado public.estado_factura_venta DEFAULT 'pendiente',
  anio int GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::int) STORED,
  mes int GENERATED ALWAYS AS (EXTRACT(MONTH FROM fecha)::int) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_facturas_venta TO authenticated;
GRANT ALL ON public.fema_facturas_venta TO service_role;
ALTER TABLE public.fema_facturas_venta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_fv_own" ON public.fema_facturas_venta FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_ffv BEFORE UPDATE ON public.fema_facturas_venta
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_ffv_user_anio ON public.fema_facturas_venta(user_id, anio);

-- FACTURAS COMPRA
CREATE TABLE public.fema_facturas_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  proveedor_id uuid REFERENCES public.fema_proveedores(id) ON DELETE SET NULL,
  numero text,
  tipo public.tipo_factura NOT NULL DEFAULT 'B',
  neto numeric(14,2) DEFAULT 0,
  iva_21 numeric(14,2) DEFAULT 0,
  iva_105 numeric(14,2) DEFAULT 0,
  percepciones numeric(14,2) DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  categoria public.categoria_compra DEFAULT 'Otro',
  estado public.estado_factura_compra DEFAULT 'pendiente',
  anio int GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::int) STORED,
  mes int GENERATED ALWAYS AS (EXTRACT(MONTH FROM fecha)::int) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_facturas_compra TO authenticated;
GRANT ALL ON public.fema_facturas_compra TO service_role;
ALTER TABLE public.fema_facturas_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_fc_own" ON public.fema_facturas_compra FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_ffc BEFORE UPDATE ON public.fema_facturas_compra
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_ffc_user_anio ON public.fema_facturas_compra(user_id, anio);

-- COMBUSTIBLE
CREATE TABLE public.fema_combustible (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  litros numeric(10,2) NOT NULL,
  producto text NOT NULL,
  precio_litro numeric(10,4) DEFAULT 0,
  itc numeric(10,2) DEFAULT 0,
  co2 numeric(10,2) DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  anio int GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::int) STORED,
  mes int GENERATED ALWAYS AS (EXTRACT(MONTH FROM fecha)::int) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_combustible TO authenticated;
GRANT ALL ON public.fema_combustible TO service_role;
ALTER TABLE public.fema_combustible ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_comb_own" ON public.fema_combustible FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- EMPLEADOS FEMA (separado de la tabla legacy)
CREATE TABLE public.fema_empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cuil text,
  fecha_ingreso date,
  cargo text,
  sueldo_bruto numeric(14,2) DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_empleados TO authenticated;
GRANT ALL ON public.fema_empleados TO service_role;
ALTER TABLE public.fema_empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_emp_own" ON public.fema_empleados FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_femp BEFORE UPDATE ON public.fema_empleados
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- SUELDOS
CREATE TABLE public.fema_sueldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  sueldo_bruto numeric(14,2) DEFAULT 0,
  sueldo_neto numeric(14,2) DEFAULT 0,
  cargas_sociales numeric(14,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_sueldos TO authenticated;
GRANT ALL ON public.fema_sueldos TO service_role;
ALTER TABLE public.fema_sueldos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_sue_own" ON public.fema_sueldos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- IMPUESTOS
CREATE TABLE public.fema_impuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  anio int NOT NULL,
  mes int NOT NULL,
  iva_debito numeric(14,2) DEFAULT 0,
  iva_credito numeric(14,2) DEFAULT 0,
  ingresos_brutos numeric(14,2) DEFAULT 0,
  ganancias_estimadas numeric(14,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_impuestos TO authenticated;
GRANT ALL ON public.fema_impuestos TO service_role;
ALTER TABLE public.fema_impuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_imp_own" ON public.fema_impuestos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ESTIMACIONES
CREATE TABLE public.fema_estimaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.fema_clientes(id) ON DELETE SET NULL,
  fecha_estimada date NOT NULL,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  descripcion text,
  estado text NOT NULL DEFAULT 'estimado',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_estimaciones TO authenticated;
GRANT ALL ON public.fema_estimaciones TO service_role;
ALTER TABLE public.fema_estimaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_est_own" ON public.fema_estimaciones FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PRESUPUESTOS FEMA
CREATE TABLE public.fema_presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.fema_clientes(id) ON DELETE SET NULL,
  fecha date NOT NULL,
  total numeric(14,2) DEFAULT 0,
  estado text DEFAULT 'borrador',
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_presupuestos TO authenticated;
GRANT ALL ON public.fema_presupuestos TO service_role;
ALTER TABLE public.fema_presupuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_pre_own" ON public.fema_presupuestos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MEDIOS DE PAGO
CREATE TABLE public.fema_medios_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_medios_pago TO authenticated;
GRANT ALL ON public.fema_medios_pago TO service_role;
ALTER TABLE public.fema_medios_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_mp_own" ON public.fema_medios_pago FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AUDITORIA
CREATE TABLE public.fema_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tabla text NOT NULL,
  operacion text NOT NULL,
  registro_id uuid,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fema_auditoria TO authenticated;
GRANT ALL ON public.fema_auditoria TO service_role;
ALTER TABLE public.fema_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fema_audit_select" ON public.fema_auditoria FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "fema_audit_insert" ON public.fema_auditoria FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.fn_fema_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fema_auditoria(user_id, tabla, operacion, registro_id, datos_anteriores, datos_nuevos)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_fema_auditoria() FROM anon, authenticated, public;

CREATE TRIGGER audit_ffv AFTER INSERT OR UPDATE OR DELETE ON public.fema_facturas_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_fema_auditoria();
CREATE TRIGGER audit_ffc AFTER INSERT OR UPDATE OR DELETE ON public.fema_facturas_compra
  FOR EACH ROW EXECUTE FUNCTION public.fn_fema_auditoria();
CREATE TRIGGER audit_femp AFTER INSERT OR UPDATE OR DELETE ON public.fema_empleados
  FOR EACH ROW EXECUTE FUNCTION public.fn_fema_auditoria();
CREATE TRIGGER audit_fsue AFTER INSERT OR UPDATE OR DELETE ON public.fema_sueldos
  FOR EACH ROW EXECUTE FUNCTION public.fn_fema_auditoria();
