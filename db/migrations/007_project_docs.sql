CREATE TABLE pmt_docs (
    doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    doc_title text NOT NULL CHECK (char_length(btrim(doc_title)) BETWEEN 1 AND 200),
    doc_version text NOT NULL DEFAULT '' CHECK (char_length(doc_version) <= 100),
    doc_created_by uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    doc_archived_at timestamptz,
    doc_created_at timestamptz NOT NULL DEFAULT now(),
    doc_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmt_docs_project_idx ON pmt_docs(doc_project_id, doc_updated_at);
