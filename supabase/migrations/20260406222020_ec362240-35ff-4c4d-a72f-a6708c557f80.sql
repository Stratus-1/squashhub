
UPDATE auth.users 
SET email = 'admin@demo.co.za', 
    email_confirmed_at = now(),
    updated_at = now()
WHERE id = '16a4a820-deb9-446e-a116-9c8f5f0393f0' 
  AND email = 'wvgroupmail@gmail.com';
