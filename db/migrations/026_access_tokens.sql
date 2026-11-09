-- Access tokens become system-wide, with per-module grants
-- (docs/superpowers/specs/2026-11-09-central-mcp-tokens-design.md).
--
-- The token table is renamed rather than copied, so every token keeps its id,
-- its hash and its revocation record: a client holding a secret keeps working.
-- Its three wiki-only permission columns become rows in a grant table, and its
-- scope rows move to a table with one nullable foreign key per scope kind, so
-- deleting a project or a wiki still removes its scope rows by cascade alone.
--
-- Every existing token was a wiki token, so every one gains (wiki, read).
--
-- Runs once. A second run finds no pmt_wiki_tokens to rename and fails.

ALTER TABLE pmt_wiki_tokens RENAME TO pmt_access_tokens;

ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_id           TO access_token_id;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_owner_id     TO access_token_owner_id;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_label        TO access_token_label;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_hash         TO access_token_hash;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_prefix       TO access_token_prefix;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_created_at   TO access_token_created_at;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_last_used_at TO access_token_last_used_at;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_expires_at   TO access_token_expires_at;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_revoked_at   TO access_token_revoked_at;
ALTER TABLE pmt_access_tokens RENAME COLUMN wiki_token_revoked_by   TO access_token_revoked_by;

-- The names a fresh db:build gives these, so a migrated database and a built
-- one cannot be told apart.
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_pkey                     TO pmt_access_tokens_pkey;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_hash_key      TO pmt_access_tokens_access_token_hash_key;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_label_check   TO pmt_access_tokens_access_token_label_check;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_owner_id_fkey TO pmt_access_tokens_access_token_owner_id_fkey;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_revoked_by_fkey TO pmt_access_tokens_access_token_revoked_by_fkey;
ALTER INDEX pmt_wiki_tokens_owner_idx RENAME TO pmt_access_tokens_owner_idx;
-- PostgreSQL 18 names NOT NULL constraints too.
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_id_not_null TO pmt_access_tokens_access_token_id_not_null;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_owner_id_not_null TO pmt_access_tokens_access_token_owner_id_not_null;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_label_not_null TO pmt_access_tokens_access_token_label_not_null;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_hash_not_null TO pmt_access_tokens_access_token_hash_not_null;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_prefix_not_null TO pmt_access_tokens_access_token_prefix_not_null;
ALTER TABLE pmt_access_tokens RENAME CONSTRAINT pmt_wiki_tokens_wiki_token_created_at_not_null TO pmt_access_tokens_access_token_created_at_not_null;

CREATE TABLE pmt_access_token_grants (
    token_grant_token_id   uuid NOT NULL REFERENCES pmt_access_tokens(access_token_id) ON DELETE CASCADE,
    token_grant_module     text NOT NULL CHECK (token_grant_module ~ '^[a-z][a-z0-9_]{0,31}$'),
    token_grant_permission text NOT NULL CHECK (token_grant_permission ~ '^[a-z][a-z0-9_]{0,31}$'),
    PRIMARY KEY (token_grant_token_id, token_grant_module, token_grant_permission)
);

CREATE TABLE pmt_access_token_scopes (
    token_scope_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_scope_token_id   uuid NOT NULL REFERENCES pmt_access_tokens(access_token_id) ON DELETE CASCADE,
    token_scope_project_id uuid REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    token_scope_wiki_id    uuid REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    CHECK (num_nonnulls(token_scope_project_id, token_scope_wiki_id) = 1)
);
CREATE UNIQUE INDEX pmt_access_token_scopes_project_uq
    ON pmt_access_token_scopes (token_scope_token_id, token_scope_project_id)
    WHERE token_scope_project_id IS NOT NULL;
CREATE UNIQUE INDEX pmt_access_token_scopes_wiki_uq
    ON pmt_access_token_scopes (token_scope_token_id, token_scope_wiki_id)
    WHERE token_scope_wiki_id IS NOT NULL;
-- The cascades from a project or a wiki look rows up by the target.
CREATE INDEX pmt_access_token_scopes_project_idx ON pmt_access_token_scopes (token_scope_project_id)
    WHERE token_scope_project_id IS NOT NULL;
CREATE INDEX pmt_access_token_scopes_wiki_idx ON pmt_access_token_scopes (token_scope_wiki_id)
    WHERE token_scope_wiki_id IS NOT NULL;

INSERT INTO pmt_access_token_grants (token_grant_token_id, token_grant_module, token_grant_permission)
SELECT access_token_id, 'wiki', 'read' FROM pmt_access_tokens
UNION ALL
SELECT access_token_id, 'wiki', 'create_wiki' FROM pmt_access_tokens WHERE wiki_token_can_create_wiki
UNION ALL
SELECT access_token_id, 'wiki', 'create_page' FROM pmt_access_tokens WHERE wiki_token_can_create_page
UNION ALL
SELECT access_token_id, 'wiki', 'write_wiki' FROM pmt_access_tokens WHERE wiki_token_can_write_wiki;

INSERT INTO pmt_access_token_scopes (token_scope_token_id, token_scope_wiki_id)
SELECT wiki_token_scope_token_id, wiki_token_scope_wiki_id FROM pmt_wiki_token_scopes;

DROP TABLE pmt_wiki_token_scopes;

ALTER TABLE pmt_access_tokens
    DROP COLUMN wiki_token_can_create_wiki,
    DROP COLUMN wiki_token_can_create_page,
    DROP COLUMN wiki_token_can_write_wiki;
