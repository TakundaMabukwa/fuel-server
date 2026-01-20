-- Delete all sessions from 2026-01-07 to 2026-01-12
DELETE FROM energy_rite_operating_sessions 
WHERE session_date BETWEEN '2026-01-07' AND '2026-01-12';