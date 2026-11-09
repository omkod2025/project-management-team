-- Existing personal tokens remain read-only unless explicitly granted writes.
ALTER TABLE pmt_wiki_tokens
  ADD COLUMN wiki_token_can_create_wiki boolean NOT NULL DEFAULT false,
  ADD COLUMN wiki_token_can_create_page boolean NOT NULL DEFAULT false,
  ADD COLUMN wiki_token_can_write_wiki boolean NOT NULL DEFAULT false;
