insert into app_settings (key, value) values
 ('saas_tiers_zar_monthly','[{"upTo":50,"rate":6},{"upTo":150,"rate":5},{"upTo":250,"rate":4},{"upTo":500,"rate":3},{"upTo":null,"rate":2.5}]'),
 ('saas_tiers_zar_annual','[{"upTo":50,"rate":5.1},{"upTo":150,"rate":4.25},{"upTo":250,"rate":3.4},{"upTo":500,"rate":2.55},{"upTo":null,"rate":2.1}]'),
 ('saas_tiers_usd_monthly','[{"upTo":50,"rate":0.35},{"upTo":150,"rate":0.29},{"upTo":250,"rate":0.23},{"upTo":500,"rate":0.18},{"upTo":null,"rate":0.15}]'),
 ('saas_tiers_usd_annual','[{"upTo":50,"rate":0.3},{"upTo":150,"rate":0.25},{"upTo":250,"rate":0.2},{"upTo":500,"rate":0.15},{"upTo":null,"rate":0.12}]'),
 ('saas_tiers_eur_monthly','[{"upTo":50,"rate":0.32},{"upTo":150,"rate":0.27},{"upTo":250,"rate":0.21},{"upTo":500,"rate":0.16},{"upTo":null,"rate":0.13}]'),
 ('saas_tiers_eur_annual','[{"upTo":50,"rate":0.27},{"upTo":150,"rate":0.23},{"upTo":250,"rate":0.18},{"upTo":500,"rate":0.14},{"upTo":null,"rate":0.11}]'),
 ('saas_billing_cap','')
on conflict (key) do update set value = excluded.value;