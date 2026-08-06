# Plan: Motor de conciliación automática

## Objetivo
Que el sistema, al registrar un cobro o pago, distribuya automáticamente el monto entre las facturas pendientes del mismo cliente/proveedor, respetando el orden cronológico de vencimiento y permitiendo intervención manual antes de confirmar.

## Alcance
1. **Conciliación de cobros (facturas de venta)**
   - Al registrar un cobro de un cliente, el sistema propone imputar el monto recibido a sus facturas de venta pendientes, de la más antigua a la más nueva.
   - Soporta cobro parcial: si el monto no cubre el total, se deja saldo pendiente en la factura.

2. **Conciliación de pagos (facturas de compra)**
   - Al registrar un pago a un proveedor, el sistema propone imputar el monto a sus facturas de compra pendientes.
   - Soporta pago parcial y pago a cuenta sin factura (queda como anticipo).

3. **Interfaz de propuesta**
   - Modal de "Conciliar" que muestra las facturas pendientes, el monto disponible, la distribución sugerida y el saldo a cuenta.
   - El usuario puede aceptar la propuesta, editarla o rechazarla.

4. **Registro transaccional**
   - La imputación definitiva se persiste a través de `fema_registrar_pago` para mantener integridad.
   - Se actualizan estados de facturas: pendiente → parcial → pagada/cobrada.

5. **Historial de imputaciones**
   - Nueva vista en cada factura que muestra los pagos/cobros imputados y su fecha.

## Tablas y cambios de schema
- Crear `fema_imputaciones` con columnas: `id`, `user_id`, `factura_venta_id`, `factura_compra_id`, `movimiento_pago_id`, `monto`, `fecha`, `created_at`.
- Relaciona facturas con movimientos de pago.
- GRANT a `authenticated` y `service_role`; RLS por `user_id`.

## Componentes a modificar/crear
- `src/lib/finanzas.ts`: agregar `proponerImputaciones( facturas, monto )`.
- `src/lib/tesoreria.ts`: ajustar proyección para considerar imputaciones confirmadas.
- `src/routes/app.medios.tsx`: agregar botón "Conciliar" en cobros/pagos con propuesta automática.
- `src/routes/app.compras.tsx` y `src/routes/app.facturas.tsx`: mostrar estado de imputación y saldo real.
- `src/routes/app.cuentas.tsx`: reflejar saldos imputados vs. saldos brutos.

## Criterios de aceptación
- Registrar un pago de $1.000.000 a un proveedor con dos facturas de $600.000 y $500.000 imputa $600.000 a la primera, $400.000 a la segunda y deja $100.000 a cuenta.
- El estado de cada factura se actualiza correctamente.
- El saldo en Cuentas Corrientes refleja el monto pendiente post-imputación.
- Las proyecciones de tesorería no duplican montos ya imputados.

## Tests
- Tests unitarios en `src/lib/finanzas.test.ts` para `proponerImputaciones`.
- Verificación end-to-end con datos de prueba en el módulo Medios de Pago.
