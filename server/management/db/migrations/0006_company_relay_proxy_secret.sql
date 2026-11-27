-- +goose Up
-- The secret a relay proxy sends to read the company's flagsets and flags from
-- Studio. It is kept in clear like flagset API keys, so admins can copy it
-- again; UNIQUE because the secret alone identifies the company.
ALTER TABLE companies
    ADD COLUMN relay_proxy_secret            TEXT UNIQUE,
    ADD COLUMN relay_proxy_secret_created_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE companies
    DROP COLUMN relay_proxy_secret,
    DROP COLUMN relay_proxy_secret_created_at;
