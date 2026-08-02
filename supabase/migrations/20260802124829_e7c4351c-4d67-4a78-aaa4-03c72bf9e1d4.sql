ALTER TABLE public.outreach_prospects ADD COLUMN IF NOT EXISTS club_subdomain text;

UPDATE public.outreach_prospects SET club_subdomain = v.sub FROM (VALUES
 ('Adelaar Squash Club','ade'),
 ('CBCTUT Squash Club','cbt'),
 ('CBC Old Boys Squash Club','cbt'),
 ('Centurion Squash Club','cen'),
 ('Correctional Services','cor'),
 ('CSIR Squash Club','csi'),
 ('Glenwood Squash Club','gle'),
 ('Harlequins Squash Club','had'),
 ('Irene Country Club','ire'),
 ('Kentron Squash Club','ken'),
 ('PCC Squash Club','pcc'),
 ('PHSOB Squash Club','phs'),
 ('PVR Squash Club','pvr'),
 ('SARB Squash Club','sar'),
 ('TUKS Squash Club','tuk'),
 ('Uitsig Squash Club','uit')
) AS v(name, sub)
WHERE public.outreach_prospects.club_name = v.name;