package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyHandlerRelayProxySecret(t *testing.T) {
	s := newStack(t)
	h := NewCompanyHandler(s.companySvc, s.teamSvc)
	admin := testutil.SeedUser(t, s.db, "admin@acme.com", "Admin", false)
	acme := testutil.SeedCompany(t, s.db, "Acme")
	call := func(fn func(*echo.Context) error, method, companyID, body string) (int, model.APIResponse) {
		c, rec := reqCtx(method, body)
		params(c, "companyId", companyID)
		withClaims(c, admin.ID, false)
		require.NoError(t, fn(c))
		if rec.Code == http.StatusNoContent {
			return rec.Code, model.APIResponse{}
		}
		return rec.Code, decodeResp(t, rec)
	}

	code, resp := call(h.GetRelayProxySecret, http.MethodGet, acme.ID, "")
	assert.Equal(t, http.StatusOK, code)
	assert.Nil(t, resp.Data, "no secret yet")

	// No body: no grace period, as onboarding does.
	code, resp = call(h.RotateRelayProxySecret, http.MethodPost, acme.ID, "")
	assert.Equal(t, http.StatusOK, code)
	secret := dataMap(t, resp.Data)["secret"]
	assert.NotEmpty(t, secret)
	assert.NotContains(t, dataMap(t, resp.Data), "previousExpiresAt")

	code, resp = call(h.RotateRelayProxySecret, http.MethodPost, acme.ID, `{"keepPreviousSeconds":3600}`)
	assert.Equal(t, http.StatusOK, code)
	assert.NotEqual(t, secret, dataMap(t, resp.Data)["secret"])
	assert.NotEmpty(t, dataMap(t, resp.Data)["previousExpiresAt"])
	_, resp = call(h.GetRelayProxySecret, http.MethodGet, acme.ID, "")
	assert.NotEmpty(t, dataMap(t, resp.Data)["previousExpiresAt"])

	for _, body := range []string{"", `{"keepPreviousSeconds":0}`, `{"keepPreviousSeconds":3600}`} {
		code, blocked := call(h.RotateRelayProxySecret, http.MethodPost, acme.ID, body)
		assert.Equal(t, http.StatusConflict, code)
		assert.Equal(t, "previous relay proxy secret is still valid; wait for it to expire or revoke it before rotating again",
			blocked.Message)
	}

	code, _ = call(h.RevokePreviousRelayProxySecret, http.MethodDelete, acme.ID, "")
	assert.Equal(t, http.StatusNoContent, code)
	_, resp = call(h.GetRelayProxySecret, http.MethodGet, acme.ID, "")
	assert.NotContains(t, dataMap(t, resp.Data), "previousExpiresAt")

	tests := []struct {
		name       string
		fn         func(*echo.Context) error
		verb       string
		companyID  string
		body       string
		wantStatus int
		wantErrors map[string][]string
	}{
		{"get for an unknown company", h.GetRelayProxySecret, http.MethodGet, missingUUID, "", http.StatusNotFound, nil},
		{"rotate for an unknown company", h.RotateRelayProxySecret, http.MethodPost, missingUUID, "", http.StatusNotFound, nil},
		{"revoke for an unknown company", h.RevokePreviousRelayProxySecret, http.MethodDelete, missingUUID, "",
			http.StatusNotFound, nil},
		{"negative grace period", h.RotateRelayProxySecret, http.MethodPost, acme.ID, `{"keepPreviousSeconds":-1}`,
			http.StatusBadRequest, map[string][]string{"keepPreviousSeconds": {"keepPreviousSeconds must be between 0 and 2592000"}}},
		{"grace period over 30 days", h.RotateRelayProxySecret, http.MethodPost, acme.ID, `{"keepPreviousSeconds":2592001}`,
			http.StatusBadRequest, map[string][]string{"keepPreviousSeconds": {"keepPreviousSeconds must be between 0 and 2592000"}}},
		{"grace period not a number", h.RotateRelayProxySecret, http.MethodPost, acme.ID, `{"keepPreviousSeconds":"1h"}`,
			http.StatusBadRequest, map[string][]string{"keepPreviousSeconds": {"must be a number"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, resp := call(tt.fn, tt.verb, tt.companyID, tt.body)
			assert.Equal(t, tt.wantStatus, code)
			if tt.wantErrors != nil {
				assert.Equal(t, tt.wantErrors, resp.Errors)
			}
		})
	}
}

func TestFlagsetHandlerRelayProxy(t *testing.T) {
	s := newStack(t)
	h := NewFlagsetHandler(s.flagsetSvc)
	acme := testutil.SeedCompany(t, s.db, "Acme")
	fs := testutil.SeedFlagset(t, s.db, testutil.SeedTeam(t, s.db, acme.ID, "Platform").ID, "prod")
	user := testutil.SeedUser(t, s.db, "u@acme.com", "U", false)
	_, err := s.flagsetSvc.CreateAPIKey(t.Context(), user.ID, fs.ID, "ci")
	require.NoError(t, err)
	testutil.SeedFlag(t, s.db, fs.ID, "my-flag", nil, nil)
	relayProxyCtx := func(companyID, flagsetID string) (*echo.Context, func() (int, []byte)) {
		c, rec := reqCtx(http.MethodGet, "")
		c.Request().Host = "studio:8080"
		c.Request().Header.Set(echo.HeaderAuthorization, "Bearer goff_rp_x")
		c.Set(middleware.ContextRelayProxyCompanyKey, companyID)
		params(c, "id", flagsetID)
		return c, func() (int, []byte) { return rec.Code, rec.Body.Bytes() }
	}

	t.Run("flagsets", func(t *testing.T) {
		c, res := relayProxyCtx(acme.ID, "")
		require.NoError(t, h.RelayProxyFlagSets(c))
		code, body := res()
		require.Equal(t, http.StatusOK, code)
		var file model.RelayProxyFile
		require.NoError(t, json.Unmarshal(body, &file))
		require.Len(t, file.FlagSets, 1)
		assert.Equal(t, "http://studio:8080/api/v1/relay-proxy/flagsets/"+fs.ID+"/flags.json",
			file.FlagSets[0].Retrievers[0].URL)
		assert.Equal(t, []string{"Bearer goff_rp_x"}, file.FlagSets[0].Retrievers[0].Headers["Authorization"])
	})

	tests := []struct {
		name      string
		call      func(h *FlagsetHandler, c *echo.Context) error
		companyID string
		flagsetID string
		wantCode  int
		wantBody  string
	}{
		{"flags of the flagset", (*FlagsetHandler).RelayProxyFlags, acme.ID, fs.ID, http.StatusOK, `"my-flag"`},
		{"flags of an unknown flagset", (*FlagsetHandler).RelayProxyFlags, acme.ID, missingUUID,
			http.StatusNotFound, "not found"},
		{"flagsets of a deleted company", (*FlagsetHandler).RelayProxyFlagSets, missingUUID, "",
			http.StatusNotFound, "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, res := relayProxyCtx(tt.companyID, tt.flagsetID)
			require.NoError(t, tt.call(h, c))
			code, body := res()
			assert.Equal(t, tt.wantCode, code)
			assert.Contains(t, string(body), tt.wantBody)
		})
	}
}
