-- Essential Daily Snapshots Fix
-- This migration adds the missing snapshot_data column and essential indexes

-- Add the missing snapshot_data column if it doesn't exist
ALTER TABLE energy_rite_daily_snapshots 
ADD COLUMN IF NOT EXISTS snapshot_data JSONB NOT NULL DEFAULT '{}';

-- Add essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch_date ON energy_rite_daily_snapshots(branch, snapshot_date);

-- Create GIN index for JSONB cost_code queries
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_cost_code ON energy_rite_daily_snapshots USING GIN ((snapshot_data->>'cost_code'));

-- Add unique constraint to prevent duplicate snapshots
ALTER TABLE energy_rite_daily_snapshots 
ADD CONSTRAINT IF NOT EXISTS unique_branch_snapshot_date UNIQUE(branch, snapshot_date);

-- Test the fix by inserting a sample record
INSERT INTO energy_rite_daily_snapshots (
    branch, 
    company, 
    snapshot_date, 
    snapshot_data
) VALUES (
    'SCHEMA_FIX_TEST',
    'TEST_COMPANY',
    CURRENT_DATE,
    '{"cost_code": "TEST-001", "fuel_level": 75, "engine_status": "OFF", "snapshot_type": "SCHEMA_TEST"}'::jsonb
) ON CONFLICT (branch, snapshot_date) DO NOTHING;

-- Verify the test record exists
SELECT COUNT(*) as test_count FROM energy_rite_daily_snapshots WHERE branch = 'SCHEMA_FIX_TEST';

-- Clean up test record
DELETE FROM energy_rite_daily_snapshots WHERE branch = 'SCHEMA_FIX_TEST';