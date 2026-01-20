-- Get all sessions from 2026-01-07 to 2026-01-12
SELECT 
  branch,
  session_date,
  session_start_time,
  session_end_time,
  operating_hours,
  opening_fuel,
  closing_fuel,
  total_usage,
  total_fill,
  session_status,
  notes
FROM energy_rite_operating_sessions 
WHERE session_date BETWEEN '2026-01-07' AND '2026-01-12'
ORDER BY session_date, branch;