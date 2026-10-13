package repository_test

import (
	"encoding/json"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGoffFlagsView runs the exact query GO Feature Flag's postgresql retriever
// issues against the goff_flags view (default columns, flagset filter).
func TestGoffFlagsView(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewFlagRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	team := testutil.SeedTeam(t, db, company.ID, "Platform")
	fs := testutil.SeedFlagset(t, db, team.ID, "prod")
	other := testutil.SeedFlagset(t, db, team.ID, "staging")

	testutil.SeedFlag(t, db, fs.ID, "enabled-flag", nil, nil)
	disabled := testutil.SeedFlag(t, db, fs.ID, "disabled-flag", nil, nil)
	deleted := testutil.SeedFlag(t, db, fs.ID, "deleted-flag", nil, nil)
	testutil.SeedFlag(t, db, other.ID, "other-flagset-flag", nil, nil)
	require.NoError(t, repo.SetDisabled(ctx, disabled.ID, true))
	require.NoError(t, repo.SoftDelete(ctx, deleted.ID))

	rows, err := db.Pool.Query(ctx,
		`SELECT "flag_name", "config" FROM "goff_flags" WHERE "flagset" = $1 ORDER BY "flag_name"`, fs.ID)
	require.NoError(t, err)
	defer rows.Close()

	got := map[string]map[string]any{}
	for rows.Next() {
		var name string
		var config []byte
		require.NoError(t, rows.Scan(&name, &config))
		var m map[string]any
		require.NoError(t, json.Unmarshal(config, &m))
		got[name] = m
	}
	require.NoError(t, rows.Err())

	require.Len(t, got, 2, "deleted and other-flagset flags are excluded")
	// The payload is passed through unchanged, with disabled merged in as disable.
	for name, disable := range map[string]bool{"enabled-flag": false, "disabled-flag": true} {
		var want map[string]any
		require.NoError(t, json.Unmarshal([]byte(testutil.DefaultFlagPayload), &want))
		want["disable"] = disable
		assert.Equal(t, want, got[name], name)
	}

	// Only the parent is marked deleted, so the view's own flagset check is
	// what hides the still-live flag (SoftDelete would also delete the flag).
	_, err = db.Pool.Exec(ctx, `UPDATE flagsets SET deleted_at = NOW() WHERE id = $1`, other.ID)
	require.NoError(t, err)
	var n int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM "goff_flags" WHERE "flagset" = $1`, other.ID).Scan(&n))
	assert.Zero(t, n, "flags of a deleted flagset are excluded")
}
