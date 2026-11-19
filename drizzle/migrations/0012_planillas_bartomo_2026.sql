DELETE FROM fema_planilla_equipos WHERE planilla_id IN ('a6a54938-8fd6-4d38-8744-caed364fe5f8','063d640a-48ad-41d0-90cd-d16456b3a554');
--> statement-breakpoint
DELETE FROM fema_planillas_bolsero WHERE id IN ('a6a54938-8fd6-4d38-8744-caed364fe5f8','063d640a-48ad-41d0-90cd-d16456b3a554');
--> statement-breakpoint
UPDATE fema_planillas_bolsero SET fecha = '2026-11-10', anio = 2026, mes = 11, cliente_nombre = 'BARTOMO GIULIANO', observaciones = '12.52 HA' WHERE id = '85189447-a14f-437a-9e2e-cd491c37f578';
--> statement-breakpoint
UPDATE fema_planillas_bolsero SET fecha = '2026-11-11', anio = 2026, mes = 11, cliente_nombre = 'BARTOMO GIULIANO' WHERE id = '483a7b7c-386e-4343-99e1-0436352246f7';
