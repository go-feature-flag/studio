package main

import (
	"log/slog"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewLogger(t *testing.T) {
	tests := []struct {
		name        string
		cfg         config.LogConfig
		wantHandler string
		wantErr     string
	}{
		{"json by default", config.LogConfig{}, "*slog.JSONHandler", ""},
		{"json", config.LogConfig{Format: "json", Level: "debug"}, "*slog.JSONHandler", ""},
		{"text", config.LogConfig{Format: "text"}, "*slog.TextHandler", ""},
		{"unknown format", config.LogConfig{Format: "consol"}, "", `invalid log.format "consol"`},
		{"unknown level", config.LogConfig{Level: "loud"}, "", "loud"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			log, err := newLogger(tt.cfg)
			if tt.wantErr != "" {
				assert.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantHandler, typeName(log.Handler()))
		})
	}
}

func typeName(h slog.Handler) string {
	switch h.(type) {
	case *slog.JSONHandler:
		return "*slog.JSONHandler"
	case *slog.TextHandler:
		return "*slog.TextHandler"
	}
	return "other"
}
