-- Clear current data from EnergyRite tables
-- Run these queries in order due to foreign key dependencies

-- 1. Delete all activity log entries first
DELETE FROM energy_rite_activity_log;

-- 2. Delete all operating sessions
DELETE FROM energy_rite_operating_sessions;

-- 3. Verify tables are empty
SELECT COUNT(*) as activity_log_count FROM energy_rite_activity_log;
SELECT COUNT(*) as sessions_count FROM energy_rite_operating_sessions;