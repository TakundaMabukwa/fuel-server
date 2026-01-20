-- Delete sessions created less than 5 minutes ago
DELETE FROM energy_rite_operating_sessions 
WHERE created_at > NOW() - INTERVAL '5 minutes';