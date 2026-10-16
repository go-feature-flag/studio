package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// validConfig returns a Config that passes Validate, so individual tests can
// mutate a single field to exercise one validation rule at a time.
func validConfig() Config {
	c := Default()
	c.DB.URL = "postgres://localhost:5432/goff"
	c.OIDC.Issuer = "https://issuer.example.com"
	c.OIDC.ClientID = "client-id"
	c.OIDC.ClientSecret = "client-secret"
	c.OIDC.RedirectURL = "https://app.example.com/callback"
	c.Auth.JWTSecret = strings.Repeat("x", 32)
	return c
}

func TestConfigValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(c *Config)
		wantMsg string // empty means Validate must pass
	}{
		{"valid config passes", func(c *Config) {}, ""},
		{"max port passes", func(c *Config) { c.Server.Port = 65535 }, ""},
		{"port zero", func(c *Config) { c.Server.Port = 0 }, "server.port"},
		{"port negative", func(c *Config) { c.Server.Port = -1 }, "server.port"},
		{"port above max", func(c *Config) { c.Server.Port = 65536 }, "server.port"},
		{"missing db url", func(c *Config) { c.DB.URL = "" }, "db.url"},
		{"missing issuer", func(c *Config) { c.OIDC.Issuer = "" }, "oidc.issuer"},
		{"missing client id", func(c *Config) { c.OIDC.ClientID = "" }, "oidc.clientId"},
		{"missing client secret", func(c *Config) { c.OIDC.ClientSecret = "" }, "oidc.clientSecret"},
		{"missing redirect url", func(c *Config) { c.OIDC.RedirectURL = "" }, "oidc.redirectUrl"},
		{"blank db url", func(c *Config) { c.DB.URL = "  \t" }, "db.url"},
		{"blank client secret", func(c *Config) { c.OIDC.ClientSecret = " " }, "oidc.clientSecret"},
		{"missing jwt secret", func(c *Config) { c.Auth.JWTSecret = "" }, "auth.jwtSecret is required"},
		{"blank jwt secret", func(c *Config) { c.Auth.JWTSecret = strings.Repeat(" ", 32) }, "auth.jwtSecret is required"},
		{"short jwt secret", func(c *Config) { c.Auth.JWTSecret = "too-short" }, "at least 32 chars"},
		{"zero shutdown timeout", func(c *Config) { c.Server.ShutdownTimeout = 0 }, "server.shutdownTimeout"},
		{"zero max conns", func(c *Config) { c.DB.MaxConns = 0 }, "db.maxConns"},
		{"negative min conns", func(c *Config) { c.DB.MinConns = -1 }, "db.minConns"},
		{"min conns above max", func(c *Config) { c.DB.MinConns = c.DB.MaxConns + 1 }, "db.minConns"},
		{"zero conn max lifetime", func(c *Config) { c.DB.ConnMaxLifetime = 0 }, "db.connMaxLifetime"},
		{"scopes without openid", func(c *Config) { c.OIDC.Scopes = []string{"profile", "email"} }, "oidc.scopes"},
		{"zero session max age", func(c *Config) { c.Auth.SessionMaxAge = 0 }, "auth.sessionMaxAge"},
		{"unknown log level", func(c *Config) { c.Log.Level = "verbose" }, "log.level"},
		{"unknown log format", func(c *Config) { c.Log.Format = "xml" }, "log.format"},
		{"trusted proxies as CIDR ranges", func(c *Config) {
			c.Server.TrustedProxies = []string{"10.0.0.0/8", "2001:db8::/32"}
		}, ""},
		{"trusted proxies lists every bad entry", func(c *Config) {
			c.Server.TrustedProxies = []string{"10.0.0.1", "10.0.0.0/8", "nope"}
		}, `server.trustedProxies must be CIDR ranges (e.g. 10.0.0.0/8), got "10.0.0.1", "nope"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := validConfig()
			tt.mutate(&c)
			err := c.Validate()
			if tt.wantMsg == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantMsg)
		})
	}
}

func TestConfigValidateReportsAllErrors(t *testing.T) {
	c := validConfig()
	c.DB.URL = ""
	c.OIDC.ClientID = ""
	c.Auth.JWTSecret = ""
	err := c.Validate()
	require.Error(t, err)

	tests := []struct {
		msg  string
		want bool
	}{
		{"db.url", true},
		{"oidc.clientId", true},
		{"auth.jwtSecret is required", true},
		// A blank secret reports "required" only, not also "too short".
		{"at least 32 chars", false},
	}
	for _, tt := range tests {
		t.Run(tt.msg, func(t *testing.T) {
			assert.Equal(t, tt.want, strings.Contains(err.Error(), tt.msg))
		})
	}
}
