UPDATE public.fema_activos SET nombre='ROJO 4', responsable='Juan Manuel Zarate', responsable_empleado_id='aaab1640-ad33-4159-961f-0e7a3b5ee6d6' WHERE id='4561b464-6e90-4458-813c-887cfb8277c2';
UPDATE public.fema_activos SET responsable='JUAN CEJAS', responsable_empleado_id=NULL WHERE id='6ee1d754-9ccd-4bcb-ba65-26bd8cfa27ea';
UPDATE public.fema_activos SET nombre='ROJO 1' WHERE id='ec4c3562-705f-4ea6-9d8e-0a932008a1df';
UPDATE public.fema_planilla_equipos SET equipo_nombre='ROJO 4', activo_id='4561b464-6e90-4458-813c-887cfb8277c2' WHERE equipo_nombre IN ('ROJO 4','ROJO  4') AND es_tercero=false;
UPDATE public.fema_planilla_equipos SET equipo_nombre='ROJO 1', activo_id='ec4c3562-705f-4ea6-9d8e-0a932008a1df' WHERE equipo_nombre IN ('ROJO 1','ROJO  1') AND es_tercero=false;
UPDATE public.fema_planilla_equipos SET chofer='Juan Manuel Zarate' WHERE upper(chofer)='JUAN ZARATE';