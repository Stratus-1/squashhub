-- QF1: Seed 1 Gerrie/Eduard vs Seed 8 Marius/Andre
UPDATE public.club_champs_matches SET
  player_a_member_id='c8b790ce-2a59-4c8d-8e10-875c922b3f7c', partner_a_member_id='9dbeebc2-bc5b-4ddc-8a33-2d615761aa85',
  player_b_member_id='c5e4ce92-f5ca-404c-99ff-a00b16b5cf02', partner_b_member_id='891d654a-e722-44c0-88b3-bd327ba9df72'
WHERE id='4b9008a2-6fe0-4610-9050-1638c5324a17' AND status <> 'completed';

-- QF2: Seed 2 JP/John vs Seed 7 David/Francis
UPDATE public.club_champs_matches SET
  player_a_member_id='b1945b7e-ecb8-4c37-bcd7-9f781f37098b', partner_a_member_id='e46cf01e-984c-430e-8a48-f142a2e7256f',
  player_b_member_id='c57b2591-4e3a-4f24-a08c-6b5c3d8f4f0d', partner_b_member_id='9033c127-8a9e-49c3-b4cf-a6573795eaff'
WHERE id='13853c42-5861-4ccf-a3d0-cec4f1867feb' AND status <> 'completed';

-- QF3: Seed 3 Lucas/Vian vs Seed 6 Quintin/Matthew
UPDATE public.club_champs_matches SET
  player_a_member_id='c9417789-0040-4cdc-b94a-d18d348d42fa', partner_a_member_id='0ad3e3d1-e342-4c54-8289-95488402d2ca',
  player_b_member_id='f8945024-2372-45d3-a295-1b9fe4cb8c66', partner_b_member_id='13487320-d450-450f-96fa-9a538610a206'
WHERE id='12a30012-01dc-4796-b0bd-b83c0032fcab' AND status <> 'completed';

-- QF4: Seed 4 Johan van Wyk/Josh vs Seed 5 Johan Louw/Dean
UPDATE public.club_champs_matches SET
  player_a_member_id='6c85036d-42a0-4ff5-a194-5448799996b2', partner_a_member_id='3c03c6ae-1536-43b5-8b5b-df5a4eb681fe',
  player_b_member_id='1fac9c55-6f78-4c8f-9f4b-813ef6442d88', partner_b_member_id='dd840eb7-3d54-4490-88d0-b8d3d5b65c21'
WHERE id='43b781b0-c51a-4117-b32f-f45f4144ae96' AND status <> 'completed';