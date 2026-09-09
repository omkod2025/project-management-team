ALTER TABLE pmt_doc_assets DROP CONSTRAINT pmt_doc_assets_asset_mime_check;
ALTER TABLE pmt_doc_assets ADD CONSTRAINT pmt_doc_assets_asset_mime_check
CHECK (asset_mime IN ('image/png','image/jpeg','image/webp','image/gif','application/octet-stream'));
