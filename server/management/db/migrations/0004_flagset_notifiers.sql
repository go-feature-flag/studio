-- +goose Up
-- Notifiers the relay proxy calls when a flag of the flagset changes. They hold
-- webhook URLs and secrets, so they live apart from the flagset fields every
-- viewer reads.
ALTER TABLE flagsets ADD COLUMN notifiers JSONB NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE flagsets DROP COLUMN notifiers;
