CREATE TABLE pmt_doc_pages (
  doc_page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_page_doc_id uuid NOT NULL REFERENCES pmt_docs(doc_id) ON DELETE CASCADE,
  doc_page_parent_id uuid,
  doc_page_depth smallint NOT NULL CHECK (doc_page_depth BETWEEN 1 AND 3),
  doc_page_title text NOT NULL CHECK (char_length(btrim(doc_page_title)) BETWEEN 1 AND 200),
  doc_page_slug text NOT NULL UNIQUE,
  doc_page_template text NOT NULL CHECK (doc_page_template IN ('free', 'module')),
  doc_page_node_id uuid REFERENCES pmt_nodes(node_id) ON DELETE SET NULL,
  doc_page_content jsonb NOT NULL DEFAULT '{"body":""}',
  doc_page_sort_order double precision NOT NULL DEFAULT 0,
  doc_page_updated_by uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  doc_page_updated_at timestamptz(3) NOT NULL DEFAULT now(),
  doc_page_archived_at timestamptz,
  UNIQUE (doc_page_id, doc_page_doc_id),
  FOREIGN KEY (doc_page_parent_id, doc_page_doc_id) REFERENCES pmt_doc_pages(doc_page_id, doc_page_doc_id) ON DELETE RESTRICT,
  CHECK (doc_page_parent_id IS DISTINCT FROM doc_page_id),
  CHECK (doc_page_template = 'module' OR doc_page_node_id IS NULL)
);
CREATE INDEX pmt_doc_pages_doc_idx ON pmt_doc_pages(doc_page_doc_id);
CREATE TABLE pmt_doc_page_revisions (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_page_id uuid NOT NULL REFERENCES pmt_doc_pages(doc_page_id) ON DELETE CASCADE,
  revision_editor_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  revision_content jsonb NOT NULL,
  revision_updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX pmt_doc_revisions_page_idx ON pmt_doc_page_revisions(revision_page_id, revision_updated_at);

CREATE TABLE pmt_doc_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  asset_uploader_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  asset_filename text NOT NULL,
  asset_mime text NOT NULL CHECK (asset_mime IN ('image/png','image/jpeg','image/webp','image/gif')),
  asset_bytes integer NOT NULL CHECK (asset_bytes BETWEEN 1 AND 5242880),
  asset_created_at timestamptz NOT NULL DEFAULT now()
);
