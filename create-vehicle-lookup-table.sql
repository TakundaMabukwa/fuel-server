-- Create vehicle lookup table for Quality (IP) to Branch mapping
CREATE TABLE IF NOT EXISTS energyrite_vehicle_lookup (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    company VARCHAR(100) DEFAULT 'KFC',
    cost_code VARCHAR(50),
    quality VARCHAR(50), -- IP address from WebSocket
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(plate),
    UNIQUE(quality)
);

-- Insert test data based on your mock server
INSERT INTO energyrite_vehicle_lookup (plate, branch, company, cost_code, quality) VALUES
('UNKNOWN1', 'KEYWEST', 'KFC', 'KW001', '53.15.1.232'),
('ALEX', 'ALEX', 'KFC', 'AL001', '192.168.1.101'),
('BLOEM2', 'BLOEM2', 'KFC', 'BL002', '192.168.1.102'),
('UNKNOWN2', 'DURBANVILL', 'KFC', 'DV001', '61.172.2.170'),
('BERGBRON', 'BERGBRON', 'KFC', 'BB001', '62.138.2.35')
ON CONFLICT (plate) DO UPDATE SET
    branch = EXCLUDED.branch,
    quality = EXCLUDED.quality,
    updated_at = NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_lookup_plate ON energyrite_vehicle_lookup(plate);
CREATE INDEX IF NOT EXISTS idx_vehicle_lookup_quality ON energyrite_vehicle_lookup(quality);
CREATE INDEX IF NOT EXISTS idx_vehicle_lookup_branch ON energyrite_vehicle_lookup(branch);

-- Enable RLS
ALTER TABLE energyrite_vehicle_lookup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON energyrite_vehicle_lookup FOR ALL USING (true);