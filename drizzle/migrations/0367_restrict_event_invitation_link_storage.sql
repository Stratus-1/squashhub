REVOKE ALL ON public.event_invitation_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.event_invitation_links TO service_role;
COMMENT ON TABLE public.event_invitation_links IS 'Private hashed social-event invitation capabilities; public replies only through event_invitation_reply.';