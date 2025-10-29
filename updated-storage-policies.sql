-- Drop existing policies
DROP POLICY IF EXISTS "Allow all access to reports bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow all bucket operations" ON storage.buckets;

-- Create new policies for reports bucket
CREATE POLICY "reports_bucket_policy" ON storage.objects
FOR ALL USING (bucket_id = 'reports');

CREATE POLICY "reports_bucket_select" ON storage.objects
FOR SELECT USING (bucket_id = 'reports');

CREATE POLICY "reports_bucket_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'reports');

CREATE POLICY "reports_bucket_update" ON storage.objects
FOR UPDATE USING (bucket_id = 'reports');

CREATE POLICY "reports_bucket_delete" ON storage.objects
FOR DELETE USING (bucket_id = 'reports');