# Tables Used in Report Generation Process

## Database Tables
1. **energy_rite_generated_reports** - Stores report metadata
2. **energy_rite_operating_sessions** - Source data for reports
3. **energy_rite_fuel_data** - Fuel level data
4. **energyrite_vehicle_lookup** - Vehicle/site information

## Storage Tables
1. **storage.objects** - Supabase storage files
2. **storage.buckets** - Storage bucket configuration

## Key Table: energy_rite_generated_reports
- id, cost_code, report_type, report_url, report_date, file_size, status