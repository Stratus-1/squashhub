UPDATE public.bookings
SET end_time = '20:00:00'
WHERE club_id = '061e6dd9-0ec2-4427-a939-3f18ad0884c8'
  AND status = 'active'
  AND date >= CURRENT_DATE
  AND guest_name ILIKE '2nd League%'
  AND start_time = '17:00:00'
  AND end_time = '19:00:00';

UPDATE public.bookings
SET end_time = '21:00:00'
WHERE club_id = '061e6dd9-0ec2-4427-a939-3f18ad0884c8'
  AND status = 'active'
  AND date >= CURRENT_DATE
  AND guest_name ILIKE '4th League%'
  AND start_time = '18:00:00'
  AND end_time = '20:00:00';