-- Per-currency messaging rates, scaled by the same ZAR->USD (~17.1) and
-- ZAR->EUR (~18.75) ratio used for SaaS subscription tiers. Base ZAR rows
-- already exist; these add the USD/EUR overrides that useMessagingRates reads.
insert into public.app_settings (key, value) values
  ('sms_unit_cost_usd', '0.02'),
  ('whatsapp_rate_service_usd', '0.01'),
  ('whatsapp_rate_utility_usd', '0.03'),
  ('whatsapp_rate_marketing_usd', '0.05'),
  ('sms_unit_cost_eur', '0.02'),
  ('whatsapp_rate_service_eur', '0.01'),
  ('whatsapp_rate_utility_eur', '0.02'),
  ('whatsapp_rate_marketing_eur', '0.04')
on conflict (key) do update set value = excluded.value;