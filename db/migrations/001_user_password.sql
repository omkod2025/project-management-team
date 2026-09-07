-- 001 — credential storage for pmt_users
--
-- The original schema had no password column: spec 05 §1 assumed the Auth.js
-- Drizzle adapter would own users, sessions and credentials entirely. It does
-- not — the adapter's user table is not ours, and running two user tables
-- would split identity across the system.
--
-- So Field Book keeps pmt_users as the single identity table, and Auth.js runs
-- a Credentials provider with JWT sessions over it. See spec 05 §1.
--
-- Idempotent: safe to run against a database that already has the columns.

ALTER TABLE pmt_users
    ADD COLUMN IF NOT EXISTS user_password_hash    text,
    -- One-time token an Admin hands to a new user so they can set their own
    -- password. NULL once used. Never stores the password itself.
    ADD COLUMN IF NOT EXISTS user_setup_token      text,
    ADD COLUMN IF NOT EXISTS user_setup_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS pmt_users_setup_token_uq
    ON pmt_users (user_setup_token)
    WHERE user_setup_token IS NOT NULL;

COMMENT ON COLUMN pmt_users.user_password_hash IS
    'scrypt hash in the form N:r:p:salt:key, all base64. Never a plaintext password.';
