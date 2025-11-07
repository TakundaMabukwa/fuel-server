-- Create energy_rite_fuel_fills table for tracking fuel fill events
CREATE TABLE IF NOT EXISTS energy_rite_fuel_fills (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    cost_code VARCHAR(50),
    company VARCHAR(100),
    fill_date TIMESTAMPTZ NOT NULL,
    fill_day DATE GENERATED ALWAYS AS (DATE(fill_date)) STORED,
    fuel_before NUMERIC(10,2),
    fuel_after NUMERIC(10,2),
    fill_amount NUMERIC(10,2),
    fill_percentage NUMERIC(5,2),
    detection_method VARCHAR(50), -- 'STATUS_INDICATOR' or 'LEVEL_INCREASE'
    status VARCHAR(50) DEFAULT 'detected',
    fill_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fuel_fills_plate ON energy_rite_fuel_fills(plate);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_date ON energy_rite_fuel_fills(fill_date);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_day ON energy_rite_fuel_fills(fill_day);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_cost_code ON energy_rite_fuel_fills(cost_code);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_plate_day ON energy_rite_fuel_fills(plate, fill_day);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_status ON energy_rite_fuel_fills(status);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_method ON energy_rite_fuel_fills(detection_method);

-- Enable Row Level Security
ALTER TABLE energy_rite_fuel_fills ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations" ON energy_rite_fuel_fills FOR ALL USING (true);

-- Add total_fill column to operating sessions if it doesn't exist
ALTER TABLE energy_rite_operating_sessions 
ADD COLUMN IF NOT EXISTS total_fill NUMERIC(10,2) DEFAULT 0;

-- Add fill tracking columns to operating sessions
ALTER TABLE energy_rite_operating_sessions 
ADD COLUMN IF NOT EXISTS fill_events INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fill_amount_during_session NUMERIC(10,2) DEFAULT 0;