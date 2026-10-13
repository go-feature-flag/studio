package repository_test

import (
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewDBErrors(t *testing.T) {
	_, err := repository.NewDB(t.Context(), config.DBConfig{URL: "://bad"})
	require.ErrorContains(t, err, "parse db url")

	// Nothing listens on port 1, so the pool is created but the ping fails.
	_, err = repository.NewDB(t.Context(), config.DBConfig{URL: "postgres://u:p@127.0.0.1:1/db?connect_timeout=1"})
	require.ErrorContains(t, err, "ping db")
}

func TestNewDBAppliesPoolConfig(t *testing.T) {
	shared := testutil.StartPostgres(t)
	db, err := repository.NewDB(t.Context(), config.DBConfig{
		URL:             shared.Pool.Config().ConnString(),
		MaxConns:        3,
		MinConns:        1,
		ConnMaxLifetime: time.Minute,
	})
	require.NoError(t, err)
	defer db.Close()

	cfg := db.Pool.Config()
	assert.Equal(t, int32(3), cfg.MaxConns)
	assert.Equal(t, int32(1), cfg.MinConns)
	assert.Equal(t, time.Minute, cfg.MaxConnLifetime)
}
