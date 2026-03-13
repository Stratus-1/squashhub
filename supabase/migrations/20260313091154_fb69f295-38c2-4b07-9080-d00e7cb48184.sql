
ALTER TABLE public.courts
ADD COLUMN relay_device_id text DEFAULT NULL,
ADD COLUMN relay_server text DEFAULT 'https://shelly-44-eu.shelly.cloud' ;
