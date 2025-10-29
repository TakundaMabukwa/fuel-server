-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow all operations on reports bucket
CREATE POLICY "Allow all access to reports bucket" ON storage.objects
FOR ALL USING (bucket_id = 'reports');

-- Allow all operations on storage.buckets
CREATE POLICY "Allow all bucket operations" ON storage.buckets
FOR ALL USING (true);