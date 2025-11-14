-- Fix negative total_usage values by converting them to positive
UPDATE energy_rite_operating_sessions 
SET total_usage = ABS(total_usage) 
WHERE total_usage < 0;

-- Check how many records were updated
SELECT COUNT(*) as negative_usage_fixed 
FROM energy_rite_operating_sessions 
WHERE total_usage >= 0;