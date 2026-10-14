package repository_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFlagsetRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")

	created, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
		Name:                        "prod",
		Description:                 "production",
		PollingIntervalMs:           new(3000),
		EvaluationContextEnrichment: json.RawMessage(`{"env":"prod"}`),
	})
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "prod", created.Name)
	assert.Equal(t, 0, created.APIKeyCount)
	require.NotNil(t, created.PollingIntervalMs)
	assert.Equal(t, 3000, *created.PollingIntervalMs)
	assert.JSONEq(t, `{"env":"prod"}`, string(created.EvaluationContextEnrichment))

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	missing, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Nil(t, missing)

	_ = testutil.SeedFlagset(t, db, team.ID, "staging")
	list, err := repo.ListByTeam(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "prod", list[0].Name, "ordered by name")

	updated, err := repo.Update(ctx, created.ID, &model.UpdateFlagsetRequest{Description: new("updated")})
	require.NoError(t, err)
	assert.Equal(t, "updated", updated.Description)
	assert.Equal(t, "prod", updated.Name, "nil name preserved")

	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", &model.UpdateFlagsetRequest{Name: new("x")})
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Go's JSON accepts a lone surrogate, Postgres jsonb rejects it (22P02):
	// that must surface as the pg error, not as not found.
	_, err = repo.Update(ctx, created.ID, &model.UpdateFlagsetRequest{Notifiers: json.RawMessage(`{"x":"\ud800"}`)})
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	assert.Equal(t, "22P02", pgErr.Code)

	require.NoError(t, repo.SoftDelete(ctx, created.ID))
	assert.ErrorIs(t, repo.SoftDelete(ctx, created.ID), repository.ErrNotFound)
}

// TestFlagsetRepoSoftDelete: deleting a flagset retains it and its flags as
// soft-deleted rows, hides them from reads, revokes the API keys and frees the
// name for reuse.
func TestFlagsetRepoAPIKeys(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")

	key, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "secret-key", user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, key.ID)
	assert.Equal(t, "secret-key", key.APIKey)

	// api_key_count is reflected on the flagset.
	withKey, err := repo.GetByID(ctx, fs.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, withKey.APIKeyCount)

	keys, err := repo.ListAPIKeys(ctx, fs.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	require.NotNil(t, keys[0].CreatedByName)
	assert.Equal(t, "U", *keys[0].CreatedByName)

	owner, err := repo.GetAPIKeyFlagset(ctx, key.ID)
	require.NoError(t, err)
	assert.Equal(t, fs.ID, owner)

	_, err = repo.GetAPIKeyFlagset(ctx, "00000000-0000-0000-0000-000000000000")
	assert.ErrorIs(t, err, repository.ErrNotFound)

	require.NoError(t, repo.DeleteAPIKeyByID(ctx, key.ID))
	assert.ErrorIs(t, repo.DeleteAPIKeyByID(ctx, key.ID), repository.ErrNotFound)
}

func TestFlagsetRepoInsertAPIKeyDeletedFlagset(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	t.Run("deleted flagset is not found", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "gone")
		require.NoError(t, repo.SoftDelete(ctx, fs.ID))
		_, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "k1", user.ID)
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("insert racing a delete waits and sees it deleted", func(t *testing.T) {
		fs := testutil.SeedFlagset(t, db, team.ID, "racing")
		tx, err := db.Pool.Begin(ctx)
		require.NoError(t, err)
		_, err = tx.Exec(ctx, `UPDATE flagsets SET deleted_at = NOW() WHERE id = $1`, fs.ID)
		require.NoError(t, err)

		done := make(chan error, 1)
		go func() {
			_, err := repo.InsertAPIKey(ctx, fs.ID, "ci", "k2", user.ID)
			done <- err
		}()
		select {
		case err := <-done:
			t.Fatalf("insert did not wait for the delete: %v", err)
		case <-time.After(200 * time.Millisecond):
		}
		require.NoError(t, tx.Commit(ctx))
		assert.ErrorIs(t, <-done, repository.ErrNotFound)
	})
}

func TestFlagsetRepoUpdateNullable(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()
	team := testutil.SeedTeam(t, db, testutil.SeedCompany(t, db, "Acme").ID, "Platform")
	yaml, json := model.FileFormatYAML, model.FileFormatJSON

	tests := []struct {
		name       string
		req        model.UpdateFlagsetRequest
		wantPoll   *int
		wantFormat *model.FileFormat
	}{
		{name: "absent leaves unchanged", wantPoll: new(1000), wantFormat: &yaml},
		{
			name: "null resets to default",
			req: model.UpdateFlagsetRequest{
				PollingIntervalMs: model.Nullable[int]{Set: true},
				FileFormat:        model.Nullable[model.FileFormat]{Set: true},
			},
		},
		{
			name: "value sets",
			req: model.UpdateFlagsetRequest{
				PollingIntervalMs: model.Nullable[int]{Set: true, Value: new(5000)},
				FileFormat:        model.Nullable[model.FileFormat]{Set: true, Value: &json},
			},
			wantPoll: new(5000), wantFormat: &json,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs, err := repo.Create(ctx, team.ID, &model.CreateFlagsetRequest{
				Name: tt.name, PollingIntervalMs: new(1000), FileFormat: &yaml})
			require.NoError(t, err)
			got, err := repo.Update(ctx, fs.ID, &tt.req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantPoll, got.PollingIntervalMs)
			assert.Equal(t, tt.wantFormat, got.FileFormat)
		})
	}
}
