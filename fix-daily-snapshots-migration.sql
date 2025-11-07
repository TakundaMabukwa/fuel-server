-- Fix Daily Snapshots Table Migration
-- This migration adds missing constraints, indexes, and ensures proper schema for cost code integration

-- First, let's ensure the table exists with proper structure
CREATE TABLE IF NOT EXISTS energy_rite_daily_snapshots (
    id BIGSERIAL PRIMARY KEY,
    branch VARCHAR(100) NOT NULL,
    company VARCHAR(100),
    snapshot_date DATE NOT NULL,
    snapshot_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint to prevent duplicate snapshots for same branch/date
-- This will fail silently if the constraint already exists
DO $$
BEGIN
    BEGIN
        ALTER TABLE energy_rite_daily_snapshots 
        ADD CONSTRAINT unique_branch_snapshot_date UNIQUE(branch, snapshot_date);
    EXCEPTION
        WHEN duplicate_table THEN
            -- Constraint already exists, continue
            NULL;
    END;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch ON energy_rite_daily_snapshots(branch);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON energy_rite_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_company ON energy_rite_daily_snapshots(company);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_branch_date ON energy_rite_daily_snapshots(branch, snapshot_date);

-- Create GIN index for JSONB cost_code queries (for cost code integration)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_cost_code ON energy_rite_daily_snapshots USING GIN ((snapshot_data->>'cost_code'));

-- Create GIN index for general JSONB queries on snapshot_data
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_data ON energy_rite_daily_snapshots USING GIN (snapshot_data);

-- Add indexes for fuel level and engine status queries within JSONB
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_fuel_level ON energy_rite_daily_snapshots USING GIN ((snapshot_data->>'fuel_level'));
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_engine_status ON energy_rite_daily_snapshots USING GIN ((snapshot_data->>'engine_status'));

-- Ensure the table has proper Row Level Security enabled
ALTER TABLE energy_rite_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Create or replace the RLS policy
DROP POLICY IF EXISTS "Allow all operations" ON energy_rite_daily_snapshots;
CREATE POLICY "Allow all operations" ON energy_rite_daily_snapshots FOR ALL USING (true);

-- Add a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic updated_at timestamp
DROP TRIGGER IF EXISTS update_daily_snapshots_updated_at ON energy_rite_daily_snapshots;
CREATE TRIGGER update_daily_snapshots_updated_at
    BEFORE UPDATE ON energy_rite_daily_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a function to validate snapshot_data structure for cost code integration
CREATE OR REPLACE FUNCTION validate_snapshot_data(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if required fields exist for cost code integration
    RETURN (
        data ? 'snapshot_time' AND
        data ? 'snapshot_type' AND
        data ? 'fuel_level' AND
        data ? 'fuel_volume' AND
        data ? 'engine_status'
        -- cost_code is optional as some vehicles might not have it
    );
END;
$$ LANGUAGE plpgsql;

-- Add check constraint to ensure snapshot_data has required structure
DO $$
BEGIN
    BEGIN
        ALTER TABLE energy_rite_daily_snapshots 
        ADD CONSTRAINT valid_snapshot_data 
        CHECK (validate_snapshot_data(snapshot_data));
    EXCEPTION
        WHEN duplicate_object THEN
            -- Constraint already exists, continue
            NULL;
    END;
END $$;

-- Create a view for easy querying of snapshots with cost codes
CREATE OR REPLACE VIEW daily_snapshots_with_cost_codes AS
SELECT 
    id,
    branch,
    company,
    snapshot_date,
    snapshot_data->>'cost_code' as cost_code,
    (snapshot_data->>'fuel_level')::NUMERIC as fuel_level,
    (snapshot_data->>'fuel_volume')::NUMERIC as fuel_volume,
    snapshot_data->>'engine_status' as engine_status,
    snapshot_data->>'snapshot_type' as snapshot_type,
    snapshot_data->>'snapshot_time' as snapshot_time,
    snapshot_data,
    created_at,
    updated_at
FROM energy_rite_daily_snapshots
WHERE snapshot_data->>'cost_code' IS NOT NULL;

-- Grant necessary permissions on the view
GRANT SELECT ON daily_snapshots_with_cost_codes TO anon, authenticated;

-- Create an index on the view's underlying cost_code filter
CREATE INDEX IF NOT EXISTS idx_snapshots_with_cost_codes 
ON energy_rite_daily_snapshots(snapshot_date, branch) 
WHERE snapshot_data->>'cost_code' IS NOT NULL;

-- Insert a test record to verify the schema works
-- This will be cleaned up after testing
INSERT INTO energy_rite_daily_snapshots (
    branch, 
    company, 
    snapshot_date, 
    snapshot_data
) VALUES (
    'TEST_VEHICLE',
    'TEST_COMPANY',
    CURRENT_DATE,
    jsonb_build_object(
        'cost_code', 'TEST-001',
        'fuel_level', 75.5,
        'fuel_volume', 180.2,
        'engine_status', 'OFF',
        'snapshot_type', 'SCHEMA_TEST',
        'snapshot_time', NOW()::text
    )
) ON CONFLICT (branch, snapshot_date) DO UPDATE SET
    snapshot_data = EXCLUDED.snapshot_data,
    updated_at = NOW();

-- Verify the test record was inserted correctly
DO $$
DECLARE
    test_count INTEGER;
    test_cost_code TEXT;
BEGIN
    SELECT COUNT(*), snapshot_data->>'cost_code' 
    INTO test_count, test_cost_code
    FROM energy_rite_daily_snapshots 
    WHERE branch = 'TEST_VEHICLE' AND snapshot_date = CURRENT_DATE
    GROUP BY snapshot_data->>'cost_code';
    
    IF test_count > 0 AND test_cost_code = 'TEST-001' THEN
        RAISE NOTICE 'Schema validation successful - test record inserted with cost_code: %', test_cost_code;
    ELSE
        RAISE EXCEPTION 'Schema validation failed - test record not properly inserted';
    END IF;
END $$;

-- Clean up test record
DELETE FROM energy_rite_daily_snapshots WHERE branch = 'TEST_VEHICLE';

RAISE NOTICE 'Daily snapshots table migration completed successfully!';
RAISE NOTICE 'Table now supports:';
RAISE NOTICE '- Cost code integration via snapshot_data JSONB';
RAISE NOTICE '- Proper indexes for performance';
RAISE NOTICE '- Unique constraints to prevent duplicates';
RAISE NOTICE '- Automatic timestamp updates';
RAISE NOTICE '- Data validation for required fields';
RAISE NOTICE '- Convenient view for cost code queries';