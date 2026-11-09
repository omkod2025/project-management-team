-- 027: a deleted token is gone, not kept as revoked (D-102).
--
-- From now on DELETE /api/tokens/<id> removes the row. This clears the
-- tokens revoked before that, with their grants and scopes (ON DELETE
-- CASCADE). Their secrets already answered 401; nothing that works stops.

DELETE FROM pmt_access_tokens WHERE access_token_revoked_at IS NOT NULL;
