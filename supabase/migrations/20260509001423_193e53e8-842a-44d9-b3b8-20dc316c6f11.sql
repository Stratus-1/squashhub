INSERT INTO public.member_association_affiliations (club_member_id, association_id, league_association_number, active)
VALUES ('aaaaaaa1-0000-0000-0000-000000000001', '8439a886-6627-4c9f-a28e-330995fa52c9', 'NSF9999', true)
ON CONFLICT (club_member_id, association_id) DO UPDATE SET league_association_number='NSF9999', active=true;