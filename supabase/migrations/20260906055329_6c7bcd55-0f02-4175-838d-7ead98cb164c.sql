ALTER TABLE public.comms_template_versions DROP CONSTRAINT comms_template_versions_channel_check;
ALTER TABLE public.comms_template_versions ADD CONSTRAINT comms_template_versions_channel_check CHECK (channel = ANY (ARRAY['email'::text,'whatsapp'::text,'sms'::text,'in_app'::text]));
ALTER TABLE public.comms_deliveries DROP CONSTRAINT comms_deliveries_channel_check;
ALTER TABLE public.comms_deliveries ADD CONSTRAINT comms_deliveries_channel_check CHECK (channel = ANY (ARRAY['email'::text,'whatsapp'::text,'sms'::text,'in_app'::text]));