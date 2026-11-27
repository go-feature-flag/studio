package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func relayProxyCompanies(db *repository.DB) *service.CompanyService {
	return service.NewCompanyService(repository.NewCompanyRepo(db), nil, repository.NewAuditRepo(db), false)
}

// runRelayProxyAuth sends one request with the given Authorization header ("" sends none) and returns the
// response and the company id next saw ("" when next did not run).
func runRelayProxyAuth(
	t testing.TB, companies *service.CompanyService, authorization string,
) (*httptest.ResponseRecorder, string) {
	t.Helper()
	var got string
	handler := RequireRelayProxySecret(companies)(func(c *echo.Context) error {
		got = MustRelayProxyCompanyID(c)
		return c.NoContent(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if authorization != "" {
		req.Header.Set(echo.HeaderAuthorization, authorization)
	}
	rec := httptest.NewRecorder()
	require.NoError(t, handler(echo.New().NewContext(req, rec)))
	return rec, got
}

// closedDB returns a DB whose queries fail at once, without a database.
func closedDB(t testing.TB) *repository.DB {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), "postgres://nobody@127.0.0.1:1/none")
	require.NoError(t, err)
	pool.Close()
	return &repository.DB{Pool: pool}
}

func TestRequireRelayProxySecret(t *testing.T) {
	db := testutil.StartPostgres(t)
	companies := relayProxyCompanies(db)
	acme := testutil.SeedCompany(t, db, "Acme")
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)
	secret, err := companies.RotateRelayProxySecret(t.Context(), admin.ID, acme.ID,
		&model.RotateRelayProxySecretRequest{})
	require.NoError(t, err)

	tests := []struct {
		name          string
		companies     *service.CompanyService
		authorization string
		wantStatus    int
		wantMessage   string
		wantCompany   string
	}{
		{"valid secret", companies, "Bearer " + secret.Secret, http.StatusOK, "", acme.ID},
		{"no header", companies, "", http.StatusUnauthorized, "unauthenticated", ""},
		{"not a bearer token", companies, "Basic " + secret.Secret, http.StatusUnauthorized, "unauthenticated", ""},
		{"lowercase scheme", companies, "bearer " + secret.Secret, http.StatusUnauthorized, "unauthenticated", ""},
		{"empty token", companies, "Bearer ", http.StatusUnauthorized, "unauthenticated", ""},
		{"unknown secret", companies, "Bearer goff_rp_nope", http.StatusUnauthorized, "unauthenticated", ""},
		{"database failure is a 500", relayProxyCompanies(closedDB(t)), "Bearer " + secret.Secret,
			http.StatusInternalServerError, "failed to authenticate", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, got := runRelayProxyAuth(t, tt.companies, tt.authorization)
			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, tt.wantCompany, got)
			if tt.wantMessage != "" {
				var body model.APIResponse
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
				assert.Equal(t, tt.wantMessage, body.Message)
			}
		})
	}
}

func TestMustRelayProxyCompanyIDPanicsWithoutMiddleware(t *testing.T) {
	c := echo.New().NewContext(httptest.NewRequest(http.MethodGet, "/", nil), httptest.NewRecorder())
	assert.PanicsWithValue(t,
		"middleware.MustRelayProxyCompanyID: no company, route is missing RequireRelayProxySecret",
		func() { MustRelayProxyCompanyID(c) })
}

// FuzzRequireRelayProxySecret: the Authorization header is untrusted. Without
// a database every lookup fails, so a header is rejected with 401 before any
// lookup unless it is a non-empty Bearer token, and next never runs.
func FuzzRequireRelayProxySecret(f *testing.F) {
	companies := relayProxyCompanies(closedDB(f))
	for _, seed := range []string{"Bearer goff_rp_x", "Bearer ", "Basic x", "bearer x", "Bearer  x", "x"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, authorization string) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set(echo.HeaderAuthorization, authorization)
		// The header as net/http would deliver it (e.g. surrounding spaces trimmed).
		sent := req.Header.Get(echo.HeaderAuthorization)
		rec, got := runRelayProxyAuth(t, companies, sent)
		assert.Empty(t, got, "next must not run")
		want := http.StatusUnauthorized
		if token, ok := strings.CutPrefix(sent, "Bearer "); ok && token != "" {
			want = http.StatusInternalServerError
		}
		assert.Equal(t, want, rec.Code)
	})
}
