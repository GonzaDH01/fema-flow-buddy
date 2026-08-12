DELETE FROM public.fema_movimientos_pago
WHERE id IN (
 'b12dae2b-0ce7-4ce4-957a-6937bd8ce770','1820fa9e-6ff2-457c-b034-4b4ef8e354f0',
 'dd1dd061-fc84-4dbd-8ae4-8518f3b74706','158992f2-8ece-4293-b08a-fb3b7028fa4b',
 '5828f85a-69ed-4005-b036-a6624a4c6538','1621eb74-e69a-473a-916a-6742843b5119',
 '44ac44d0-9ccd-43d5-9a9b-58f6982e86d9','521e1c91-d884-4e22-b660-ca1fffd7547c',
 '5acdfa72-db7f-4bad-a487-0facd6e510c2','24d9c13b-4353-482f-9fa7-b3c96bc424a1',
 '30164faa-b065-4722-b955-a1068411cec1','4b6cca06-da52-4334-bfeb-56e489f4546d',
 'dab3901e-9a02-41cd-9f13-e508fd549c1a','d206ef7d-3ac3-48d6-8818-549ba4436b7e',
 '2c19301d-d580-4194-ba95-1252fcf17941','c5c749c0-9f51-4a2e-b8e5-82aad9703bf6',
 'ddae9a79-6312-45f2-9399-d99de9368bfa','86dcb6b5-c7ca-421c-a2bf-827d658ff606',
 '4db40476-5a22-422c-927f-a5178c635dc0','77d26bda-c75b-4562-93c1-af3adceed7f8',
 '67ebb2f9-e26c-446d-9831-3ebbbbeab443','90152092-e58f-4c4b-9f9d-c15449f14b04'
);

UPDATE public.fema_movimientos_pago
SET contraparte = 'AGRODEL S.A.'
WHERE id = 'e57d6546-24fd-42be-9eda-3a8fe59d057e';