ALTER TABLE pmt_doc_pages ADD COLUMN doc_page_settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE pmt_doc_pages ADD COLUMN doc_page_protected boolean NOT NULL DEFAULT false;
CREATE TABLE pmt_doc_comments (
  comment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_page_id uuid NOT NULL REFERENCES pmt_doc_pages(doc_page_id) ON DELETE CASCADE,
  comment_author_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  comment_body text NOT NULL CHECK (char_length(btrim(comment_body)) BETWEEN 1 AND 10000),
  comment_quote text NOT NULL DEFAULT '',
  comment_resolved boolean NOT NULL DEFAULT false,
  comment_created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmt_doc_comments_page_idx ON pmt_doc_comments(comment_page_id,comment_created_at);
CREATE TABLE pmt_doc_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  template_title text NOT NULL CHECK (char_length(btrim(template_title)) BETWEEN 1 AND 200),
  template_kind text NOT NULL CHECK (template_kind IN ('free','module')),
  template_content jsonb NOT NULL,
  template_created_at timestamptz NOT NULL DEFAULT now()
);
