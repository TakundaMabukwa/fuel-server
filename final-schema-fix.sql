-- Final Schema Fix for Daily Snapshots with Cost Code Integration
-- This fixes the exact issues identified in the current table

-- Add the missing snapshot_data JSONB column
ALTER TABLE energy_rite_daily_snapshots 
ADD COLUMN IF NOT EXISTS snapshot_data JSONB DEFAULT '{}';

-- Make snapshot_time optional with default value (since it's currently required)
ALTER TABLE energy_rite_daily_snapshots 
ALTER COLUMN snapshot_time SET DEFAULT NOW();

-- Make snapshot_type optional with default value (since it's currently required)
ALTER TABLE energy_rite_daily_snapshots 
ALTER COLUMN snapshot_type SET DEFAULT 'MANUAL';

-- Add essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_type ON energy_rite_daily_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_time ON energy_rite_daily_snapshots(snapshot_time);

-- Create B-tree index for JSONB cost_code queries (safer for text searches)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_cost_code ON energy_rite_daily_snapshots ((snapshot_data->>'cost_code'));

-- Create GIN index for general JSONB queries (this works for JSONB)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_data ON energy_rite_daily_snapshots USING GIN (snapshot_data);

-- Test the fix with a complete record that matches the current schema
INSERT INTO energy_rite_daily_snapshots (
    branch, 
    company, 
    snapshot_date,
    snapshot_time,
    snapshot_type,
    snapshot_data
) VALUES (
    'FINAL_SCHEMA_TEST',
    'TEST_COMPANY',
    CURRENT_DATE,
    NOW(),
    'SCHEMA_FIX',
    jsonb_build_object(
        'cost_code', 'TEST-FINAL-001',
        'fuel_level', 80.5,
        'fuel_volume', 195.2,
        'engine_status', 'ON',
        'snapshot_type', 'SCHEMA_FIX'
    )
) ON CONFLICT DO NOTHING;

-- Verify the test record was inserted with cost_code
SELECT 
    branch,
    snapshot_data->>'cost_code' as cost_code,
    snapshot_data->>'fuel_level' as fuel_level,
    snapshot_data->>'engine_status' as engine_status
FROM energy_rite_daily_snapshots 
WHERE branch = 'FINAL_SCHEMA_TEST';

-- Clean up test record
DELETE FROM energy_rite_daily_snapshots WHERE branch = 'FINAL_SCHEMA_TEST';

-- Display success message
SELECT 'Schema fix completed successfully! Table now supports cost code integration.' as status;