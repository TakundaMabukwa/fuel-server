-- Update existing fuel fills table to add cost_code and company columns
ALTER TABLE energy_rite_fuel_fills 
ADD COLUMN IF NOT EXISTS cost_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS company VARCHAR(100),
ADD COLUMN IF NOT EXISTS fill_day DATE;

-- Update fill_day for existing records
UPDATE energy_rite_fuel_fills 
SET fill_day = DATE(fill_date) 
WHERE fill_day IS NULL;

-- Create additional indexes
CREATE INDEX IF NOT EXISTS idx_fuel_fills_day ON energy_rite_fuel_fills(fill_day);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_cost_code ON energy_rite_fuel_fills(cost_code);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_plate_day ON energy_rite_fuel_fills(plate, fill_day);
CREATE INDEX IF NOT EXISTS idx_fuel_fills_cost_day ON energy_rite_fuel_fills(cost_code, fill_day);