-- Seed realtime alert subscriptions from user cost-code hierarchy.
-- Each listed user receives alerts for sites where:
--   site.cost_code = user.cost_code
--   OR site.cost_code LIKE user.cost_code || '-%'
--
-- Run after: create-alert-subscriptions-table.sql

WITH target_users(email, cost_code, company) AS (
  VALUES
    ('fransie@gunret.co.za', 'KFC-0001-0001-0002', NULL),
    ('morne@gunret.co.za', 'KFC-0001-0001-0002', NULL),
    ('lloyd@gunret.co.za', 'KFC-0001-0001-0002', NULL),
    ('christinah@gunret.co.za', 'KFC-0001-0001-0002-0001-0002', NULL),
    ('nelisiwe.shongwe@gunret.co.za', 'KFC-0001-0001-0002-0006', NULL),
    ('safiya@afoods.co.za', 'KFC-0001-0001-0001', NULL),
    ('ebrahim@afoods.co.za', 'KFC-0001-0001-0001', NULL),
    ('weyahe5818@amiralty.com', 'KFC-0001-0001-0002', 'Gunret'),
    ('tambudzani.tshishivhiri@yum.com', 'KFC-0001-0001-0003', NULL),
    ('ellen@gunret.co.za', 'KFC-0001-0001-0002-0003', NULL),
    ('bheki@gunret.co.za', 'KFC-0001-0001-0002-0005', NULL),
    ('shaun@gunret.co.za', 'KFC-0001-0001-0002', NULL),
    ('carlos@afoods.co.za', 'KFC-0001-0001-0001', NULL),
    ('rakel37269@bitoini.com', 'KFC-0001-0001-0002', 'Gunret'),
    ('alex@afoods.co.za', 'KFC-0001-0001-0001', NULL),
    ('simon@gunret.co.za', 'KFC-0001-0001-0002-0004', NULL),
    ('mpho@gunret.co.za', 'KFC-0001-0001-0002-0001', NULL),
    ('khotso@gunret.co.za', 'KFC-0001-0001-0002-0005', NULL),
    ('ricky.govender@yum.com', 'KFC-0001-0001-0003', NULL),
    ('nickel@gunret.co.za', 'KFC-0001-0001-0002-0001-0001', NULL),
    ('bridget@gunret.co.za', 'KFC-0001-0001-0002-0002', NULL),
    ('ronell@afoods.co.za', 'KFC-0001-0001-0001', NULL),
    ('peet1986@gmail.com', 'KFC-0001-0001-0004', NULL),
    ('henco@gunret.co.za', 'KFC-0001-0001-0002', NULL),
    ('marshall@gunret.co.za', 'KFC-0001-0001-0002-0002', NULL),
    ('hansie@gunret.co.za', 'KFC-0001-0001-0002-0004', NULL)
),
sites_in_scope AS (
  SELECT DISTINCT
    LOWER(TRIM(tu.email)) AS email,
    tu.company,
    tu.cost_code AS user_cost_code,
    UPPER(TRIM(v.plate)) AS site
  FROM target_users tu
  INNER JOIN public.energyrite_vehicle_lookup v
    ON v.cost_code = tu.cost_code
    OR v.cost_code LIKE tu.cost_code || '-%'
  WHERE NULLIF(TRIM(v.plate), '') IS NOT NULL
),
alert_types(alert_type) AS (
  VALUES
    ('25% FUEL'),
    ('40% FUEL'),
    ('50% FUEL'),
    ('60% FUEL'),
    ('POSSIBLE FUEL FILL'),
    ('ENGINE ON'),
    ('ENGINE OFF'),
    ('PTO ON'),
    ('PTO OFF')
)
INSERT INTO public.energyrite_alert_subscriptions (
  recipient_name,
  group_name,
  email,
  site,
  alert_type,
  channel,
  status
)
SELECT
  INITCAP(REPLACE(SPLIT_PART(s.email, '@', 1), '.', ' ')) AS recipient_name,
  COALESCE(
    s.company,
    INITCAP(SPLIT_PART(SPLIT_PART(s.email, '@', 2), '.', 1))
  ) AS group_name,
  s.email,
  s.site,
  t.alert_type,
  'EMAIL',
  'active'
FROM sites_in_scope s
CROSS JOIN alert_types t
ON CONFLICT (email, site, alert_type, channel) DO UPDATE
SET
  status = EXCLUDED.status,
  recipient_name = EXCLUDED.recipient_name,
  group_name = EXCLUDED.group_name,
  updated_at = NOW();

-- Verification: subscriptions and site coverage by user
WITH target_users(email, cost_code) AS (
  VALUES
    ('fransie@gunret.co.za', 'KFC-0001-0001-0002'),
    ('morne@gunret.co.za', 'KFC-0001-0001-0002'),
    ('lloyd@gunret.co.za', 'KFC-0001-0001-0002'),
    ('christinah@gunret.co.za', 'KFC-0001-0001-0002-0001-0002'),
    ('nelisiwe.shongwe@gunret.co.za', 'KFC-0001-0001-0002-0006'),
    ('safiya@afoods.co.za', 'KFC-0001-0001-0001'),
    ('ebrahim@afoods.co.za', 'KFC-0001-0001-0001'),
    ('weyahe5818@amiralty.com', 'KFC-0001-0001-0002'),
    ('tambudzani.tshishivhiri@yum.com', 'KFC-0001-0001-0003'),
    ('ellen@gunret.co.za', 'KFC-0001-0001-0002-0003'),
    ('bheki@gunret.co.za', 'KFC-0001-0001-0002-0005'),
    ('shaun@gunret.co.za', 'KFC-0001-0001-0002'),
    ('carlos@afoods.co.za', 'KFC-0001-0001-0001'),
    ('rakel37269@bitoini.com', 'KFC-0001-0001-0002'),
    ('alex@afoods.co.za', 'KFC-0001-0001-0001'),
    ('simon@gunret.co.za', 'KFC-0001-0001-0002-0004'),
    ('mpho@gunret.co.za', 'KFC-0001-0001-0002-0001'),
    ('khotso@gunret.co.za', 'KFC-0001-0001-0002-0005'),
    ('ricky.govender@yum.com', 'KFC-0001-0001-0003'),
    ('nickel@gunret.co.za', 'KFC-0001-0001-0002-0001-0001'),
    ('bridget@gunret.co.za', 'KFC-0001-0001-0002-0002'),
    ('ronell@afoods.co.za', 'KFC-0001-0001-0001'),
    ('peet1986@gmail.com', 'KFC-0001-0001-0004'),
    ('henco@gunret.co.za', 'KFC-0001-0001-0002'),
    ('marshall@gunret.co.za', 'KFC-0001-0001-0002-0002'),
    ('hansie@gunret.co.za', 'KFC-0001-0001-0002-0004')
)
SELECT
  email,
  COUNT(DISTINCT site) AS sites_covered,
  COUNT(*) AS total_alert_rows
FROM public.energyrite_alert_subscriptions
WHERE LOWER(email) IN (SELECT LOWER(email) FROM target_users)
  AND status = 'active'
  AND channel = 'EMAIL'
GROUP BY email
ORDER BY email;
