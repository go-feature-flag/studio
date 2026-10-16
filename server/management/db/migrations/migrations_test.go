package migrations_test

import (
	"context"
	"path/filepath"
	"sync"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/db/migrations"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Replicas starting together all call Up: the lock lets exactly one apply each
// migration, and a later call has nothing left to do.
func TestUpConcurrentAndIdempotent(t *testing.T) {
	db, err := repository.NewDB(t.Context(), config.DBConfig{URL: testutil.EmptyDatabase(t), MaxConns: 8})
	require.NoError(t, err)
	defer db.Close()

	const callers = 3
	applied := make([]int, callers)
	errs := make([]error, callers)
	var wg sync.WaitGroup
	for i := range callers {
		wg.Go(func() { applied[i], errs[i] = migrations.Up(context.Background(), db.Pool) })
	}
	wg.Wait()
	total := 0
	for i := range callers {
		require.NoError(t, errs[i])
		total += applied[i]
	}
	files, err := filepath.Glob("*.sql")
	require.NoError(t, err)
	assert.Equal(t, len(files), total, "each migration applied once")

	n, err := migrations.Up(t.Context(), db.Pool)
	require.NoError(t, err)
	assert.Zero(t, n)
	var tables int
	require.NoError(t, db.Pool.QueryRow(t.Context(),
		`SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'goose_db_version'`).Scan(&tables))
	assert.Equal(t, 10, tables)
}
