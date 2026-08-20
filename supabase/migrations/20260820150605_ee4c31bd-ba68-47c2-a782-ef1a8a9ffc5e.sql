UPDATE public.clubs
SET door_geofence_radius_m = 120,
    door_auto_unlock_radius_m = 10
WHERE id = '315f735b-f0a4-4a9d-92e4-cf6ac5a02cc6';

UPDATE public.club_secrets
SET shelly_door_ble_mac = 'DC:B4:D9:CE:AA:04'
WHERE club_id = '315f735b-f0a4-4a9d-92e4-cf6ac5a02cc6';