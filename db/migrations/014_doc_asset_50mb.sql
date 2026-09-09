ALTER TABLE pmt_doc_assets DROP CONSTRAINT pmt_doc_assets_asset_bytes_check;
ALTER TABLE pmt_doc_assets ADD CONSTRAINT pmt_doc_assets_asset_bytes_check
  CHECK (asset_bytes BETWEEN 1 AND 52428800);
