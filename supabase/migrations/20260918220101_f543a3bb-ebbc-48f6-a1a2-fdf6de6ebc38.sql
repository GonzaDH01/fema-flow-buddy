UPDATE public.fema_facturas_venta
SET hectareas = 24, precio_ha = 92280, metros_bolsa = 30, precio_metro = 67200, cultivo = 'Alfalfa'
WHERE id = '1e0fddeb-0524-4073-b1bf-e0027187935a';

DELETE FROM public.fema_venta_items
WHERE factura_venta_id = '1e0fddeb-0524-4073-b1bf-e0027187935a'
  AND id IN ('f54bb0cb-9054-4f5f-bc0e-8c085ac37103','ad2b09a5-000b-44a6-88c0-9cc43fb4d56b');