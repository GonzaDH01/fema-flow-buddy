-- 1) Eliminar duplicados de cesiones vinculadas a una misma factura de compra
WITH d AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY factura_compra_id, echeq_origen_id, monto, vencimiento, numero
      ORDER BY created_at, id
    ) rn
  FROM fema_movimientos_pago
  WHERE instrumento='cesion' AND direccion='pago' AND factura_compra_id IS NOT NULL
)
DELETE FROM fema_movimientos_pago m USING d WHERE m.id=d.id AND d.rn>1;

-- 2) Índice único para evitar volver a duplicar la misma cesión sobre la misma factura
CREATE UNIQUE INDEX IF NOT EXISTS fema_mov_cesion_factura_uniq
  ON fema_movimientos_pago (factura_compra_id, echeq_origen_id)
  WHERE instrumento='cesion' AND direccion='pago' AND factura_compra_id IS NOT NULL AND echeq_origen_id IS NOT NULL;