-- ============================================================
-- PETMOL: Local → Production Data Sync
-- Generated: 2026-04-05
-- Safe: INSERT ON CONFLICT DO NOTHING + targeted UPDATE
-- Order: users → pets → records → checkins
-- ============================================================

BEGIN;

-- ============================================================
-- 1. INSERT missing user: lfmol@yahoo.com.br
--    (exists only in local, not in production)
-- ============================================================
INSERT INTO users (
  id, email, password_hash, name, phone, whatsapp,
  postal_code, street, "number", complement, neighborhood,
  city, state, country,
  created_at, updated_at,
  terms_accepted, terms_version, terms_accepted_at,
  monthly_checkin_day, monthly_checkin_hour, monthly_checkin_minute
) VALUES (
  '2d512118-5464-446c-a7bc-d1cd9c28b284',
  'lfmol@yahoo.com.br',
  '$2b$12$aKMfV/vhTGKk3IZ.IJ7l6uW6F.3kG8Y58LrZB4EADZ8HvvaGj1R/2',
  'Usuário Teste',
  NULL, true,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, 'Brasil',
  '2026-03-31 11:35:23.242001', '2026-03-31 11:35:23.242001',
  true, '2026-02-03', '2026-03-31 14:35:23.458937',
  5, 9, 0
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. INSERT missing pet: Babynho
--    (belongs to lfmol — user inserted above)
-- ============================================================
INSERT INTO pets (
  id, user_id, name, species, breed, birth_date, sex,
  weight_value, weight_unit, photo, neutered, health_data,
  created_at, updated_at, insurance_provider
) VALUES (
  '1196f72b-a5ef-403d-89bc-09f2bdb20439',
  '2d512118-5464-446c-a7bc-d1cd9c28b284',
  'Babynho', 'dog', NULL, '2017-06-14', 'male',
  NULL, NULL, NULL, NULL, '{}',
  '2026-03-31 11:35:58.36017', '2026-03-31 11:35:58.36017', NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. INSERT missing pet: Baby 3
--    (belongs to mol.marcio51 — user_id REMAPPED from local
--     UUID 665a5f11 to prod UUID d2cb4f3f)
-- ============================================================
INSERT INTO pets (
  id, user_id, name, species, breed, birth_date, sex,
  weight_value, weight_unit, photo, neutered, health_data,
  created_at, updated_at, insurance_provider
) VALUES (
  '5c14345f-4996-4560-88c8-2483350e0e52',
  'd2cb4f3f-176b-4212-868f-93ddbed6cf6a',   -- prod UUID of mol.marcio51
  'Baby 3', 'dog', NULL, NULL, 'female',
  NULL, NULL, NULL, false, '{}',
  '2026-04-01 17:16:21.948461', '2026-04-01 17:16:21.948461', NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. UPDATE: Marley Drontal Plus — prod has wrong year 2024,
--    local has the correct 2026 + updated cost + clear next_due
-- ============================================================
UPDATE parasite_control_records SET
  date_applied    = '2026-01-01 03:00:00+00',
  next_due_date   = NULL,
  cost            = 85,
  updated_at      = NOW()
WHERE id = 'par_1771985688555_t0x2p2gsz';

-- ============================================================
-- 5. INSERT missing parasite_control_records
--    Baby: Bravecto (flea_tick) + Drontal (dewormer) — April 2026
-- ============================================================
INSERT INTO parasite_control_records (
  id, pet_id, type, product_name, active_ingredient,
  date_applied, next_due_date, frequency_days, pet_weight_kg,
  dosage, application_form, veterinarian, clinic_name, batch_number,
  cost, purchase_location, collar_expiry_date,
  reminder_enabled, reminder_days, alert_days_before,
  notes, deleted, created_at, updated_at
) VALUES
(
  '8c5f71f0-88a4-4154-af27-21800a1033a5',
  '8c1eb0e9-337c-4c22-b204-d5f9947e95ba',   -- Baby (leonardofmol)
  'flea_tick', 'Bravecto', NULL,
  '2026-04-02 03:00:00+00', '2026-04-12 03:00:00+00', 10,
  NULL, NULL, 'topical', NULL, NULL, NULL,
  NULL, NULL, NULL,
  true, 7, 7,
  NULL, false,
  '2026-04-02 02:27:56.813124+00', '2026-04-05 22:52:57.536486+00'
),
(
  'f506db74-03d7-4767-b63b-68dd2ba899de',
  '8c1eb0e9-337c-4c22-b204-d5f9947e95ba',   -- Baby (leonardofmol)
  'dewormer', 'Drontal', NULL,
  '2026-04-02 03:00:00+00', '2026-07-01 03:00:00+00', 90,
  NULL, NULL, 'oral', NULL, NULL, NULL,
  89.2, NULL, NULL,
  true, 7, 7,
  NULL, false,
  '2026-04-02 13:15:46.86608+00', '2026-04-05 22:57:32.061509+00'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. INSERT missing user_monthly_checkins (2 rows)
--    a) Leo's checkin for Frida (march 2026)
--    b) lfmol's checkin for Babynho (march 2026)
-- ============================================================
INSERT INTO user_monthly_checkins (
  id, user_id, pet_id, month_ref, status, snooze_until, created_at, updated_at
) VALUES
(
  'a2542976-b931-4e99-867b-4f12003a42c1',
  '00000000-0000-0000-0000-000000000001',    -- leonardofmol
  'd94ce2e0-93d1-4384-8a8a-500a05aa2cb6',    -- Frida
  '2026-03', 'nothing', NULL,
  '2026-03-29 14:05:13.782589+00', '2026-03-29 14:05:13.782589+00'
),
(
  '56e1a788-f699-4ab8-84c4-51cbae68ee76',
  '2d512118-5464-446c-a7bc-d1cd9c28b284',    -- lfmol (inserted above)
  '1196f72b-a5ef-403d-89bc-09f2bdb20439',    -- Babynho (inserted above)
  '2026-03', 'snoozed', '2026-04-07',
  '2026-03-31 14:36:14.300807+00', '2026-03-31 14:36:14.300807+00'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
