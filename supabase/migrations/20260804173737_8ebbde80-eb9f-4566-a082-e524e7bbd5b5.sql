UPDATE public.fema_facturas_compra f
SET imagen_path = (SELECT imagen_path FROM public.fema_facturas_compra WHERE id='63523d3f-7974-41fe-b37a-ed1affa0cc72')
WHERE f.id='a0e1d611-a685-4794-a801-3ad74715eb5d' AND f.imagen_path IS NULL;

UPDATE public.fema_facturas_compra SET imagen_path = NULL WHERE id='63523d3f-7974-41fe-b37a-ed1affa0cc72';
DELETE FROM public.fema_facturas_compra WHERE id='63523d3f-7974-41fe-b37a-ed1affa0cc72';
DELETE FROM public.fema_proveedores WHERE id='6f85fcaf-35f2-4a18-901a-fe78b67749d8';