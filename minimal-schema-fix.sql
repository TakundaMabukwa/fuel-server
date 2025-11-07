-- Minimal Schema Fix for Daily Snapshots with Cost Code Integration
-- This is the safest version without complex indexes

-- Add the missing snapshot_data JSONB column
ALTER TABLE energy_rite_daily_snapshots 
ADD COLUMN IF NOT EXISTS snapshot_data JSONB DEFAULT '{}';

-- Make snapshot_time optional with default value
ALTER TABLE energy_rite_daily_snapshots 
ALTER COLUMN snapshot_time SET DEFAULT NOW();

-- Make snapshot_type optional with default value
ALTER TABLE energy_rite_daily_snapshots 
ALTER COLUMN snapshot_type SET DEFAULT 'MANUAL';

-- Add basic indexes for performance (no complex GIN indexes)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_type ON energy_rite_daily_snapshots(snapshot_type);

-- Test the fix with a complete record that matches the current schema
INSERT INTO energy_rite_daily_snapshots (
    branch, 
    company, 
    snapshot_date,
    snapshot_time,
    snapshot_type,
    snapshot_data
) VALUES (
    'MINIMAL_SCHEMA_TEST',
    'TEST_COMPANY',
    CURRENT_DATE,
    NOW(),
    'SCHEMA_FIX',
    '{"cost_code": "TEST-MINIMAL-001", "fuel_level": 75.5, "fuel_volume": 180.2, "engine_status": "ON"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Verify the test record was inserted with cost_code
SELECT 
    branch,
    snapshot_data->>'cost_code' as cost_code,
    snapshot_data->>'fuel_level' as fuel_level,
    snapshot_data->>'engine_status' as engine_status
FROM energy_rite_daily_snapshots 
WHERE branch = 'MINIMAL_SCHEMA_TEST';

-- Clean up test record
DELETE FROM energy_rite_daily_snapshots WHERE branch = 'MINIMAL_SCHEMA_TEST';

-- Display success message
SELECT 'Minimal schema fix completed! Cost code integration is now ready.' as status;