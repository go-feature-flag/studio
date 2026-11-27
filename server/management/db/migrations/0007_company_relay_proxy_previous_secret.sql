-- +goose Up
-- The secret a rotation replaced, still accepted until its expiry so relay
-- proxies can move to the new one without downtime. Rows are not cleaned up
-- at expiry: every read filters on the date, and the next rotation or an
-- early revoke overwrites them.
ALTER TABLE companies
    ADD COLUMN relay_proxy_previous_secret            TEXT UNIQUE,
    ADD COLUMN relay_proxy_previous_secret_expires_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE companies
    DROP COLUMN relay_proxy_previous_secret,
    DROP COLUMN relay_proxy_previous_secret_expires_at;
