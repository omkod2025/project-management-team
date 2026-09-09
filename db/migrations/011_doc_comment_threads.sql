ALTER TABLE pmt_doc_comments ADD COLUMN comment_parent_id uuid REFERENCES pmt_doc_comments(comment_id) ON DELETE SET NULL;
ALTER TABLE pmt_doc_comments ADD COLUMN comment_assignee_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL;
