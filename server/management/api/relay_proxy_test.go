package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// rotateRelayProxySecret generates the company's relay proxy secret as its admin.
func rotateRelayProxySecret(t *testing.T, e *echo.Echo, f routesFixture) string {
	t.Helper()
	rec := f.do(e, "POST", "/api/v1/companies/{company}/relay-proxy-secret", companyAdmin, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Data model.RelayProxySecret `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.Data.Secret
}

// A company admin generates the secret; a relay proxy sending it reads the
// company's flagsets, then follows their retriever to read the flags.
func TestRoutesRelayProxy(t *testing.T) {
	e, auth := routesServer(t)
	f := routesSeed(t, auth)
	other := testutil.SeedFlagset(t, f.db, testutil.SeedTeam(t, f.db, f.ids["otherCompany"], "t").ID, "other")

	asRelayProxy := func(path, secret string) *http.Response {
		req := f.req("GET", path, anon, "")
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+secret)
		return platformServe(e, req).Result()
	}

	rec := f.do(e, "GET", "/api/v1/companies/{company}/relay-proxy-secret", companyAdmin, "")
	assert.JSONEq(t, `{"data":null}`, rec.Body.String(), "no secret yet")
	old := rotateRelayProxySecret(t, e, f)
	secret := rotateRelayProxySecret(t, e, f)
	rec = f.do(e, "GET", "/api/v1/companies/{company}/relay-proxy-secret", companyAdmin, "")
	assert.Contains(t, rec.Body.String(), secret)

	res := asRelayProxy("/api/v1/relay-proxy/flagsets.json", secret)
	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, "no-store", res.Header.Get(echo.HeaderCacheControl))
	var file model.RelayProxyFile
	require.NoError(t, json.NewDecoder(res.Body).Decode(&file), "the body is the relay proxy file, no envelope")
	require.Len(t, file.FlagSets, 1)
	fs := file.FlagSets[0]
	assert.Equal(t, f.ids["flagset"], fs.Name)
	assert.Equal(t, []string{"goff_test"}, fs.APIKeys)
	require.Len(t, fs.Retrievers, 1)
	flagsPath := "/api/v1/relay-proxy/flagsets/" + f.ids["flagset"] + "/flags.json"
	assert.Equal(t, model.RelayProxyRetriever{
		Kind: "http", URL: "http://example.com" + flagsPath,
		Headers: map[string][]string{"Authorization": {"Bearer " + secret}},
	}, fs.Retrievers[0], "the retriever reads from the host the relay proxy called, with the same secret")

	tests := []struct {
		name, path, secret string
		want               int
	}{
		{"flags of the flagset", flagsPath, secret, http.StatusOK},
		{"rotated secret", "/api/v1/relay-proxy/flagsets.json", old, http.StatusUnauthorized},
		{"flagset of another company", "/api/v1/relay-proxy/flagsets/" + other.ID + "/flags.json", secret, http.StatusNotFound},
		{"malformed flagset id", "/api/v1/relay-proxy/flagsets/not-a-uuid/flags.json", secret, http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, asRelayProxy(tt.path, tt.secret).StatusCode)
		})
	}

	var flags map[string]map[string]any
	require.NoError(t, json.NewDecoder(asRelayProxy(flagsPath, secret).Body).Decode(&flags))
	assert.Equal(t, false, flags["flag"]["disable"])
}

// Rotating with a grace period keeps the old secret working, for the
// configuration and the flags, until it is revoked.
func TestRoutesRelayProxyRotationGracePeriod(t *testing.T) {
	e, auth := routesServer(t)
	f := routesSeed(t, auth)
	asRelayProxy := func(path, secret string) int {
		req := f.req("GET", path, anon, "")
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+secret)
		return platformServe(e, req).Code
	}
	flagsPath := "/api/v1/relay-proxy/flagsets/" + f.ids["flagset"] + "/flags.json"

	old := rotateRelayProxySecret(t, e, f)
	rec := f.do(e, "POST", "/api/v1/companies/{company}/relay-proxy-secret", companyAdmin, `{"keepPreviousSeconds":3600}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Data model.RelayProxySecret `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	secret := body.Data.Secret
	require.NotNil(t, body.Data.PreviousExpiresAt)
	assert.NotContains(t, rec.Body.String(), old, "the previous secret is never returned")

	for _, s := range []string{old, secret} {
		assert.Equal(t, http.StatusOK, asRelayProxy("/api/v1/relay-proxy/flagsets.json", s))
		assert.Equal(t, http.StatusOK, asRelayProxy(flagsPath, s))
	}

	rec = f.do(e, "DELETE", "/api/v1/companies/{company}/relay-proxy-secret/previous", companyAdmin, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, http.StatusUnauthorized, asRelayProxy("/api/v1/relay-proxy/flagsets.json", old))
	assert.Equal(t, http.StatusOK, asRelayProxy("/api/v1/relay-proxy/flagsets.json", secret))
}
