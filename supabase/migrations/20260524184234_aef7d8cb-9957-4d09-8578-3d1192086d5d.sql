INSERT INTO public.app_settings(key, value)
VALUES ('email_private_internal_secret', '2f65237ac32a3354e3f893897aac66831d294709f5cf141c329caf76ee45d056')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;