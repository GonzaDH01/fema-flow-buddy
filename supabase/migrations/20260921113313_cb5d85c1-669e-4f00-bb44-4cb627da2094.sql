ALTER TABLE public.fema_pagos_empleado
  ADD COLUMN IF NOT EXISTS tipo_pago text NOT NULL DEFAULT 'sueldo',
  ADD COLUMN IF NOT EXISTS factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fema_pagos_empleado_tipo ON public.fema_pagos_empleado(tipo_pago);
CREATE INDEX IF NOT EXISTS idx_fema_pagos_empleado_factura ON public.fema_pagos_empleado(factura_compra_id);