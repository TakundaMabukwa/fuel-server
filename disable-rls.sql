-- Disable RLS on all tables used in report process
ALTER TABLE energy_rite_generated_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_operating_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE energy_rite_fuel_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE energyrite_vehicle_lookup DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;