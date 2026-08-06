
-- Facturas
CREATE INDEX IF NOT EXISTS idx_fv_user_anio ON public.fema_facturas_venta (user_id, anio);
CREATE INDEX IF NOT EXISTS idx_fv_fecha ON public.fema_facturas_venta (fecha);
CREATE INDEX IF NOT EXISTS idx_fv_cliente ON public.fema_facturas_venta (cliente_id);
CREATE INDEX IF NOT EXISTS idx_fv_estado ON public.fema_facturas_venta (estado);

CREATE INDEX IF NOT EXISTS idx_fc_user_anio ON public.fema_facturas_compra (user_id, anio);
CREATE INDEX IF NOT EXISTS idx_fc_fecha ON public.fema_facturas_compra (fecha);
CREATE INDEX IF NOT EXISTS idx_fc_proveedor ON public.fema_facturas_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fc_estado ON public.fema_facturas_compra (estado);

-- Movimientos de pago
CREATE INDEX IF NOT EXISTS idx_mp_user_anio ON public.fema_movimientos_pago (user_id, anio);
CREATE INDEX IF NOT EXISTS idx_mp_estado ON public.fema_movimientos_pago (estado);
CREATE INDEX IF NOT EXISTS idx_mp_venc ON public.fema_movimientos_pago (vencimiento);
CREATE INDEX IF NOT EXISTS idx_mp_fv ON public.fema_movimientos_pago (factura_venta_id);
CREATE INDEX IF NOT EXISTS idx_mp_fc ON public.fema_movimientos_pago (factura_compra_id);
CREATE INDEX IF NOT EXISTS idx_mp_echeq_origen ON public.fema_movimientos_pago (echeq_origen_id);

-- Imputaciones
CREATE INDEX IF NOT EXISTS idx_imp_mov ON public.fema_imputaciones (movimiento_pago_id);
CREATE INDEX IF NOT EXISTS idx_imp_fv ON public.fema_imputaciones (factura_venta_id);
CREATE INDEX IF NOT EXISTS idx_imp_fc ON public.fema_imputaciones (factura_compra_id);
CREATE INDEX IF NOT EXISTS idx_imp_user_anio ON public.fema_imputaciones (user_id, anio);

-- Caja y fondos
CREATE INDEX IF NOT EXISTS idx_caja_user_fecha ON public.fema_caja_mov (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_caja_cuenta ON public.fema_caja_mov (cuenta_id);
CREATE INDEX IF NOT EXISTS idx_caja_mov_pago ON public.fema_caja_mov (movimiento_pago_id);
CREATE INDEX IF NOT EXISTS idx_movfondos_user_fecha ON public.fema_mov_fondos (user_id, fecha);

-- Operativo / RRHH
CREATE INDEX IF NOT EXISTS idx_comb_user_fecha ON public.fema_combustible (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_comb_equipo ON public.fema_combustible (equipo_id);
CREATE INDEX IF NOT EXISTS idx_horas_user_fecha ON public.fema_horas_trabajadas (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_horas_empleado ON public.fema_horas_trabajadas (empleado_id);
CREATE INDEX IF NOT EXISTS idx_viajes_user_fecha ON public.fema_viajes_transp (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_sueldos_user_anio ON public.fema_sueldos (user_id, anio, mes);

-- Gastos fijos y créditos
CREATE INDEX IF NOT EXISTS idx_gf_user_activo ON public.fema_gastos_fijos (user_id, activo);
CREATE INDEX IF NOT EXISTS idx_gfm_gasto_periodo ON public.fema_gastos_fijos_mov (gasto_fijo_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_cred_cuotas_credito ON public.fema_creditos_cuotas (credito_id, numero_cuota);
CREATE INDEX IF NOT EXISTS idx_cred_cuotas_venc ON public.fema_creditos_cuotas (fecha_vencimiento, estado);

-- Auditoría
CREATE INDEX IF NOT EXISTS idx_aud_created ON public.fema_auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aud_tabla_reg ON public.fema_auditoria (tabla, registro_id);
