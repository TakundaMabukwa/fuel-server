-- Fix negative usage for 2026-01-13 sessions
-- Convert negative usage to positive and update costs with 21.00/L

UPDATE energy_rite_operating_sessions
SET 
  total_usage = ABS(total_usage),
  cost_per_liter = 21.00,
  cost_for_usage = ABS(total_usage) * 21.00,
  liter_usage_per_hour = CASE 
    WHEN operating_hours > 0 THEN ABS(total_usage) / operating_hours 
    ELSE 0 
  END,
  notes = COALESCE(notes, '') || ' | Corrected: Usage recalculated at R21.00/L'
WHERE 
  session_date = '2026-01-13'
  AND total_usage < 0;

-- Update fuel price for all 2026-01-13 sessions
UPDATE energy_rite_operating_sessions
SET 
  cost_per_liter = 21.00,
  cost_for_usage = total_usage * 21.00
WHERE 
  session_date = '2026-01-13'
  AND cost_per_liter != 21.00;
