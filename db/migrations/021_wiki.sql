-- Wiki (knowledge base), independent of projects (wiki spec §4a).
--
-- Thai-safe search needs pg_trgm for substring matching, because Thai has no
-- spaces between words and websearch_to_tsquery('simple', ...) cannot find a
-- word in the middle of a sentence (see wiki spec §4b).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE wiki_access_kind AS ENUM ('read', 'write');

CREATE TABLE pmt_wikis (
    wiki_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_title        text NOT NULL CHECK (char_length(btrim(wiki_title)) BETWEEN 1 AND 200),
    wiki_description  text NOT NULL DEFAULT '' CHECK (char_length(wiki_description) <= 1000),
    -- Deletion transfers ownership first (Task 4), so this never has to CASCADE.
    wiki_owner_id     uuid NOT NULL REFERENCES pmt_users(user_id) ON DELETE RESTRICT,
    -- NULL means not published. Revoking sets it back to NULL; publishing
    -- again mints a new one. The secret alone is the guard (spec §5b).
    wiki_public_token text UNIQUE,
    wiki_archived_at  timestamptz,
    wiki_created_at   timestamptz NOT NULL DEFAULT now(),
    wiki_updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pmt_wiki_members (
    wiki_member_wiki_id    uuid NOT NULL REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    wiki_member_user_id    uuid NOT NULL REFERENCES pmt_users(user_id) ON DELETE CASCADE,
    wiki_member_access     wiki_access_kind NOT NULL,
    wiki_member_granted_by uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    wiki_member_granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (wiki_member_wiki_id, wiki_member_user_id)
);

-- Same shape as pmt_doc_pages, minus the template and node-binding columns:
-- every Wiki page is a single-body (Free) page, belonging to no project.
CREATE TABLE pmt_wiki_pages (
    wiki_page_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_page_wiki_id      uuid NOT NULL REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    wiki_page_parent_id    uuid,
    wiki_page_depth        smallint NOT NULL CHECK (wiki_page_depth BETWEEN 1 AND 3),
    wiki_page_title        text NOT NULL CHECK (char_length(btrim(wiki_page_title)) BETWEEN 1 AND 200),
    wiki_page_slug         text NOT NULL,
    wiki_page_body         text NOT NULL DEFAULT '',
    -- Plain text pulled from the body in TypeScript on every save (spec §4b).
    -- JSON keys are never indexed.
    wiki_page_search_text  text NOT NULL DEFAULT '',
    wiki_page_sort_order   double precision NOT NULL DEFAULT 0,
    wiki_page_updated_by   uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    wiki_page_updated_at   timestamptz(3) NOT NULL DEFAULT now(),
    wiki_page_archived_at  timestamptz,
    UNIQUE (wiki_page_id, wiki_page_wiki_id),
    UNIQUE (wiki_page_wiki_id, wiki_page_slug),
    FOREIGN KEY (wiki_page_parent_id, wiki_page_wiki_id)
        REFERENCES pmt_wiki_pages(wiki_page_id, wiki_page_wiki_id) ON DELETE RESTRICT,
    CHECK (wiki_page_parent_id IS DISTINCT FROM wiki_page_id)
);
CREATE INDEX pmt_wiki_pages_wiki_idx ON pmt_wiki_pages(wiki_page_wiki_id);
CREATE INDEX pmt_wiki_pages_search_trgm_idx ON pmt_wiki_pages USING gin (wiki_page_search_text gin_trgm_ops);
CREATE INDEX pmt_wiki_pages_title_trgm_idx ON pmt_wiki_pages USING gin (wiki_page_title gin_trgm_ops);

-- As pmt_doc_page_revisions, but content is plain text: a Wiki page has one
-- body (legacy Markdown or the fieldbook-rich-v1 string), not the Docs
-- {"body": ...} jsonb wrapper. Columns are wiki_revision_* so they cannot
-- collide with Docs' revision_* columns.
CREATE TABLE pmt_wiki_page_revisions (
    wiki_revision_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_revision_page_id    uuid NOT NULL REFERENCES pmt_wiki_pages(wiki_page_id) ON DELETE CASCADE,
    wiki_revision_editor_id  uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    wiki_revision_content    text NOT NULL,
    wiki_revision_updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX pmt_wiki_revisions_page_idx ON pmt_wiki_page_revisions(wiki_revision_page_id, wiki_revision_updated_at);

-- As pmt_doc_assets, keyed by wiki instead of project.
CREATE TABLE pmt_wiki_assets (
    wiki_asset_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_asset_wiki_id     uuid NOT NULL REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    wiki_asset_uploader_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    wiki_asset_filename    text NOT NULL,
    wiki_asset_mime        text NOT NULL CHECK (wiki_asset_mime IN
        ('image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/octet-stream')),
    wiki_asset_bytes       integer NOT NULL CHECK (wiki_asset_bytes BETWEEN 1 AND 52428800),
    wiki_asset_created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pmt_wiki_asset_removals (
    wiki_asset_removal_page_id  uuid NOT NULL REFERENCES pmt_wiki_pages(wiki_page_id) ON DELETE CASCADE,
    wiki_asset_removal_asset_id uuid NOT NULL REFERENCES pmt_wiki_assets(wiki_asset_id) ON DELETE CASCADE,
    PRIMARY KEY (wiki_asset_removal_page_id, wiki_asset_removal_asset_id)
);

CREATE TABLE pmt_wiki_asset_deletions (
    wiki_asset_deletion_id              uuid PRIMARY KEY,
    wiki_asset_deletion_wiki_id         uuid NOT NULL,
    wiki_asset_deletion_filename        text NOT NULL,
    wiki_asset_deletion_asset_created_at timestamptz NOT NULL,
    wiki_asset_deletion_queued_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmt_wiki_asset_deletions_wiki_idx ON pmt_wiki_asset_deletions(wiki_asset_deletion_wiki_id);

CREATE TABLE pmt_wiki_tokens (
    wiki_token_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wiki_token_owner_id      uuid NOT NULL REFERENCES pmt_users(user_id) ON DELETE CASCADE,
    wiki_token_label         text NOT NULL CHECK (char_length(btrim(wiki_token_label)) BETWEEN 1 AND 100),
    -- SHA-256 of the secret. The secret itself is never stored.
    wiki_token_hash          text NOT NULL UNIQUE,
    -- First 8 characters of the secret, for display only.
    wiki_token_prefix        text NOT NULL,
    wiki_token_created_at    timestamptz NOT NULL DEFAULT now(),
    wiki_token_last_used_at  timestamptz,
    wiki_token_expires_at    timestamptz,
    wiki_token_revoked_at    timestamptz,
    wiki_token_revoked_by    uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL
);
CREATE INDEX pmt_wiki_tokens_owner_idx ON pmt_wiki_tokens(wiki_token_owner_id);

CREATE TABLE pmt_wiki_token_scopes (
    wiki_token_scope_token_id uuid NOT NULL REFERENCES pmt_wiki_tokens(wiki_token_id) ON DELETE CASCADE,
    wiki_token_scope_wiki_id  uuid NOT NULL REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    PRIMARY KEY (wiki_token_scope_token_id, wiki_token_scope_wiki_id)
);
