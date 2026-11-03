-- +goose Up
-- Per-flagset relay proxy options, written into the generated goff-proxy.yaml.
-- Defaults are the relay proxy's own; polling_interval is in milliseconds.
ALTER TABLE flagsets
    ADD COLUMN polling_interval                   INTEGER NOT NULL DEFAULT 60000,
    ADD COLUMN start_with_retriever_error         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN enable_polling_jitter              BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN disable_notifier_on_init           BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN environment                        TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE flagsets
    DROP COLUMN polling_interval,
    DROP COLUMN start_with_retriever_error,
    DROP COLUMN enable_polling_jitter,
    DROP COLUMN disable_notifier_on_init,
    DROP COLUMN environment;
