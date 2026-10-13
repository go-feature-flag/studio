package service

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

// authServiceForJWT builds an AuthService with only the fields IssueJWT/ParseJWT
// need, bypassing the OIDC discovery that NewAuthService performs. Constructing
// the struct literal directly is only possible from within the service package.
func authServiceForJWT(secret string, maxAge time.Duration) *AuthService {
	return &AuthService{
		cfg: config.Config{Auth: config.AuthConfig{JWTSecret: secret, SessionMaxAge: maxAge}},
	}
}

func TestIssueAndParseJWTRoundTrip(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	u := &model.User{ID: "user-1", Email: "a@b.com", Name: "Alice", IsSuperAdmin: true}

	token, err := s.IssueJWT(u)
	require.NoError(t, err)
	require.NotEmpty(t, token)

	claims, err := s.ParseJWT(token)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)
	assert.Equal(t, "a@b.com", claims.Email)
	assert.Equal(t, "Alice", claims.Name)
	assert.False(t, claims.IsSuperAdmin, "super admin is never carried in the token")
	assert.Equal(t, "user-1", claims.Subject)
}

func TestParseJWTWrongSecret(t *testing.T) {
	issuer := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	token, err := issuer.IssueJWT(&model.User{ID: "u1"})
	require.NoError(t, err)

	verifier := authServiceForJWT(strings.Repeat("y", 32), time.Hour)
	_, err = verifier.ParseJWT(token)
	assert.Error(t, err, "token signed with a different secret must be rejected")
}

func TestParseJWTExpired(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), -time.Hour) // already expired
	token, err := s.IssueJWT(&model.User{ID: "u1"})
	require.NoError(t, err)

	_, err = s.ParseJWT(token)
	assert.Error(t, err, "expired token must be rejected")
}

func TestParseJWTMalformed(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	_, err := s.ParseJWT("not.a.valid.jwt")
	assert.Error(t, err)
}

// authExchangeService wires Exchange to a stub token endpoint returning an
// unsigned id_token with the given claims (signature check skipped). The stub
// rejects exchanges without the PKCE code_verifier.
func authExchangeService(t *testing.T, users *repository.UserRepo, idClaims string) *AuthService {
	t.Helper()
	idToken := "e30." + base64.RawURLEncoding.EncodeToString([]byte(idClaims)) + ".sig"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.FormValue("code_verifier") != "verifier" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"at","token_type":"Bearer","id_token":"` + idToken + `"}`))
	}))
	t.Cleanup(srv.Close)
	return &AuthService{
		cfg:   config.Config{Auth: config.AuthConfig{JWTSecret: strings.Repeat("x", 32), SessionMaxAge: time.Hour}},
		users: users,
		oauth: &oauth2.Config{Endpoint: oauth2.Endpoint{TokenURL: srv.URL}},
		verifier: oidc.NewVerifier("", nil, &oidc.Config{
			SkipClientIDCheck: true, SkipExpiryCheck: true, SkipIssuerCheck: true, InsecureSkipSignatureCheck: true,
		}),
	}
}

func TestExchangeEmailVerified(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))

	// Some IdPs (AWS Cognito) send the claim as a string.
	for _, v := range []string{`false`, `"false"`, `null`} {
		t.Run("email_verified="+v+" is rejected", func(t *testing.T) {
			s := authExchangeService(t, users, `{"sub":"s1","email":"unverified@acme.com","email_verified":`+v+`}`)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
			require.Error(t, err)
			u, err := users.GetByEmail(t.Context(), "unverified@acme.com")
			require.NoError(t, err)
			assert.Nil(t, u, "no account is created")
		})
	}

	t.Run("missing email_verified is rejected", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
		require.Error(t, err)
	})

	t.Run("missing email_verified is accepted with AllowUnverifiedEmail", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s2","email":"noclaim@acme.com"}`)
		s.cfg.Auth.AllowUnverifiedEmail = true
		u, token, err := s.Exchange(t.Context(), "code", "verifier", "")
		require.NoError(t, err)
		assert.Equal(t, "noclaim@acme.com", u.Email)
		assert.NotEmpty(t, token)
	})

	for _, v := range []string{`true`, `"true"`} {
		t.Run("email_verified="+v+" is accepted", func(t *testing.T) {
			s := authExchangeService(t, users, `{"sub":"s3","email":"verified@acme.com","email_verified":`+v+`}`)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
			require.NoError(t, err)
		})
	}
}

func TestExchangePKCEAndNonce(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	s := authExchangeService(t, users, `{"sub":"s4","email":"n@acme.com","email_verified":true,"nonce":"n1"}`)

	_, _, err := s.Exchange(t.Context(), "code", "wrong-verifier", "n1")
	require.Error(t, err, "token endpoint must receive the PKCE verifier")

	_, _, err = s.Exchange(t.Context(), "code", "verifier", "n2")
	require.ErrorContains(t, err, "nonce")

	_, _, err = s.Exchange(t.Context(), "code", "verifier", "n1")
	require.NoError(t, err)

	u, err := url.Parse(s.AuthURL("st", "verifier", "n1"))
	require.NoError(t, err)
	q := u.Query()
	assert.Equal(t, "S256", q.Get("code_challenge_method"))
	assert.Equal(t, oauth2.S256ChallengeFromVerifier("verifier"), q.Get("code_challenge"))
	assert.Equal(t, "n1", q.Get("nonce"))
}

func TestJoinDefaultCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	companies := repository.NewCompanyRepo(db)
	ctx := t.Context()
	mono := &AuthService{companies: companies}
	multi := &AuthService{companies: companies, cfg: config.Config{Server: config.ServerConfig{MultiCompany: true}}}

	first := testutil.SeedUser(t, db, "first@acme.com", "F", false)
	require.NoError(t, mono.joinDefaultCompany(ctx, first))
	assert.Nil(t, first.CompanyID, "no company yet: nothing to join")

	acme, err := companies.Create(ctx, "Acme", "")
	require.NoError(t, err)
	tests := []struct {
		name     string
		svc      *AuthService
		user     *model.User
		wantRole model.CompanyRole // "" means no company
	}{
		{"mono: member joins the company", mono, testutil.SeedUser(t, db, "bob@other.io", "B", false),
			model.CompanyRoleMember},
		{"mono: super admin joins as admin", mono, testutil.SeedUser(t, db, "root@other.io", "R", true),
			model.CompanyRoleAdmin},
		{"multi: never auto-joins", multi, testutil.SeedUser(t, db, "eve@acme.com", "E", false), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.NoError(t, tt.svc.joinDefaultCompany(ctx, tt.user))
			if tt.wantRole == "" {
				assert.Nil(t, tt.user.CompanyID)
				return
			}
			require.NotNil(t, tt.user.CompanyID)
			assert.Equal(t, acme.ID, *tt.user.CompanyID)
			assert.Equal(t, tt.wantRole, *tt.user.CompanyRole)
		})
	}

	t.Run("errors are returned, not swallowed", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		assert.ErrorIs(t, mono.joinDefaultCompany(cancelled, first), context.Canceled)
		ghost := &model.User{ID: "00000000-0000-0000-0000-000000000000"}
		assert.ErrorIs(t, mono.joinDefaultCompany(ctx, ghost), repository.ErrConflictOrNotFound)
	})
}

func TestExchangeJoinsCompany(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	acme := testutil.SeedCompany(t, db, "Acme")
	s := authExchangeService(t, users, `{"sub":"s5","email":"joiner@acme.com","email_verified":true}`)
	s.companies = repository.NewCompanyRepo(db)

	u, _, err := s.Exchange(t.Context(), "code", "verifier", "")
	require.NoError(t, err)
	require.NotNil(t, u.CompanyID)
	assert.Equal(t, acme.ID, *u.CompanyID)
}

// TestAuthenticateRevocation: privileges come from the current user row and
// config, not the session, so a demotion or deletion applies to live sessions.
func TestAuthenticateRevocation(t *testing.T) {
	db := testutil.StartPostgres(t)
	users := repository.NewUserRepo(db)
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	s.users = users
	s.adminEmails = map[string]struct{}{"root@acme.com": {}}
	ctx := t.Context()

	root := testutil.SeedUser(t, db, "root@acme.com", "Root", true)
	token, err := s.IssueJWT(root)
	require.NoError(t, err)
	c, err := s.Authenticate(ctx, token)
	require.NoError(t, err)
	assert.True(t, c.IsSuperAdmin)

	tests := []struct {
		name    string
		revoke  func(t *testing.T)
		wantErr bool
	}{
		{"removed from adminEmails", func(*testing.T) { s.adminEmails = map[string]struct{}{} }, false},
		{"super admin flag cleared", func(t *testing.T) {
			s.adminEmails = map[string]struct{}{"root@acme.com": {}}
			_, err := db.Pool.Exec(ctx, `UPDATE users SET is_super_admin = FALSE WHERE id = $1`, root.ID)
			require.NoError(t, err)
		}, false},
		{"user deleted", func(t *testing.T) {
			_, err := db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, root.ID)
			require.NoError(t, err)
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.revoke(t)
			c, err := s.Authenticate(ctx, token)
			if tt.wantErr {
				assert.ErrorContains(t, err, "user not found")
				return
			}
			require.NoError(t, err)
			assert.False(t, c.IsSuperAdmin)
		})
	}

	_, err = s.Authenticate(ctx, "garbage")
	assert.Error(t, err)
}

func TestNewAuthService(t *testing.T) {
	var issuer string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"issuer":"` + issuer + `","authorization_endpoint":"` + issuer + `/auth",` +
			`"token_endpoint":"` + issuer + `/token","jwks_uri":"` + issuer + `/keys"}`))
	}))
	t.Cleanup(srv.Close)
	issuer = srv.URL

	cfg := config.Config{
		OIDC: config.OIDCConfig{Issuer: issuer, ClientID: "cid", RedirectURL: "http://app/cb", Scopes: []string{"openid"}},
		Auth: config.AuthConfig{AdminEmails: []string{" Root@Acme.com "}},
	}
	s, err := NewAuthService(t.Context(), cfg, nil, nil)
	require.NoError(t, err)
	assert.True(t, s.isAdminEmail("root@acme.com"), "admin emails are trimmed and case-insensitive")
	assert.True(t, strings.HasPrefix(s.AuthURL("st", "v", "n"), issuer+"/auth?"))

	cfg.OIDC.Issuer = "http://127.0.0.1:1"
	_, err = NewAuthService(t.Context(), cfg, nil, nil)
	assert.ErrorContains(t, err, "init oidc provider")
}

func TestRandomState(t *testing.T) {
	s := &AuthService{}
	a, err := s.RandomState()
	require.NoError(t, err)
	b, err := s.RandomState()
	require.NoError(t, err)
	assert.Len(t, a, 32, "24 random bytes, base64url")
	assert.NotEqual(t, a, b)
}

func TestParseJWTRejectsOtherAlgorithms(t *testing.T) {
	s := authServiceForJWT(strings.Repeat("x", 32), time.Hour)
	// {"alg":"none"} with a uid claim and no signature.
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + base64.RawURLEncoding.EncodeToString([]byte(`{"uid":"u1"}`)) + "."
	_, err := s.ParseJWT(none)
	assert.Error(t, err)
}

func TestExchangeErrors(t *testing.T) {
	users := repository.NewUserRepo(testutil.StartPostgres(t))
	tests := []struct {
		name    string
		claims  string
		wantErr string
	}{
		{"email claim missing", `{"sub":"s6","email_verified":true}`, "email claim missing"},
		{"claims of the wrong type", `{"sub":"s8","email":42}`, "decode claims"},
		{"sub missing", `{"email":"nosub@acme.com","email_verified":true}`, repository.ErrMissingIdentity.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := authExchangeService(t, users, tt.claims)
			_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
			assert.ErrorContains(t, err, tt.wantErr)
		})
	}

	t.Run("token response without id_token", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"at","token_type":"Bearer"}`))
		}))
		t.Cleanup(srv.Close)
		s := &AuthService{oauth: &oauth2.Config{Endpoint: oauth2.Endpoint{TokenURL: srv.URL}}}
		_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
		assert.ErrorContains(t, err, "id_token missing")
	})

	t.Run("id_token fails verification", func(t *testing.T) {
		s := authExchangeService(t, users, `{"sub":"s7","email":"v@acme.com","email_verified":true}`)
		s.verifier = oidc.NewVerifier("https://issuer", nil, &oidc.Config{SkipClientIDCheck: true})
		_, _, err := s.Exchange(t.Context(), "code", "verifier", "")
		assert.ErrorContains(t, err, "verify id_token")
	})
}
