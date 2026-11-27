-- +goose Up
-- The secret a relay proxy sends to read the company's flagsets and flags from
-- Studio. It is kept in clear like flagset API keys, so admins can copy it
-- again; UNIQUE because the secret alone identifies the company.
-- The previous secret is the one a rotation replaced, still accepted until its
-- expiry so relay proxies can move to the new one without downtime. Rows are
-- not cleaned up at expiry: every read filters on the date, and the next
-- rotation or an early revoke overwrites them.
ALTER TABLE companies
    ADD COLUMN relay_proxy_secret                     TEXT UNIQUE,
    ADD COLUMN relay_proxy_secret_created_at          TIMESTAMPTZ,
    ADD COLUMN relay_proxy_previous_secret            TEXT UNIQUE,
    ADD COLUMN relay_proxy_previous_secret_expires_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE companies
    DROP COLUMN relay_proxy_secret,
    DROP COLUMN relay_proxy_secret_created_at,
    DROP COLUMN relay_proxy_previous_secret,
    DROP COLUMN relay_proxy_previous_secret_expires_at;
