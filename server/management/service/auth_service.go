package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

type AuthService struct {
	cfg         config.Config
	users       *repository.UserRepo
	companies   *repository.CompanyRepo
	oauth       *oauth2.Config
	verifier    *oidc.IDTokenVerifier
	adminEmails map[string]struct{}
}

func NewAuthService(
	ctx context.Context, cfg config.Config, users *repository.UserRepo, companies *repository.CompanyRepo,
) (*AuthService, error) {
	provider, err := oidc.NewProvider(ctx, cfg.OIDC.Issuer)
	if err != nil {
		return nil, fmt.Errorf("init oidc provider: %w", err)
	}
	o := &oauth2.Config{
		ClientID:     cfg.OIDC.ClientID,
		ClientSecret: cfg.OIDC.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  cfg.OIDC.RedirectURL,
		Scopes:       cfg.OIDC.Scopes,
	}
	v := provider.Verifier(&oidc.Config{ClientID: cfg.OIDC.ClientID})
	adm := make(map[string]struct{}, len(cfg.Auth.AdminEmails))
	for _, e := range cfg.Auth.AdminEmails {
		adm[strings.ToLower(strings.TrimSpace(e))] = struct{}{}
	}
	return &AuthService{cfg: cfg, users: users, companies: companies, oauth: o, verifier: v, adminEmails: adm}, nil
}

// AuthURL builds the provider redirect. verifier (PKCE, RFC 7636) and nonce
// (OIDC Core) bind the returned code and ID token to this browser's login;
// both are standard, and an IdP without PKCE support ignores the parameters.
func (s *AuthService) AuthURL(state, verifier, nonce string) string {
	return s.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
}

func (s *AuthService) RandomState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	// IsSuperAdmin is never read from the token: Authenticate derives it from
	// the current DB row and adminEmails config on every request, so a
	// demotion takes effect immediately instead of when the session expires.
	IsSuperAdmin bool `json:"-"`
	jwt.RegisteredClaims
}

func (s *AuthService) isAdminEmail(email string) bool {
	_, ok := s.adminEmails[strings.ToLower(email)]
	return ok
}

// Authenticate validates a session token and resolves the caller's current
// privileges. A deleted user is rejected.
func (s *AuthService) Authenticate(ctx context.Context, token string) (*Claims, error) {
	c, err := s.ParseJWT(token)
	if err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, c.UserID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errors.New("user not found")
	}
	c.IsSuperAdmin = u.IsSuperAdmin && s.isAdminEmail(u.Email)
	return c, nil
}

func (s *AuthService) Exchange(ctx context.Context, code, verifier, nonce string) (*model.User, string, error) {
	tok, err := s.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, "", fmt.Errorf("oauth exchange: %w", err)
	}
	rawID, ok := tok.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, "", errors.New("id_token missing from token response")
	}
	idt, err := s.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, "", fmt.Errorf("verify id_token: %w", err)
	}
	if idt.Nonce != nonce {
		return nil, "", errors.New("id_token nonce mismatch")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Sub           string `json:"sub"`
	}
	if err := idt.Claims(&claims); err != nil {
		return nil, "", fmt.Errorf("decode claims: %w", err)
	}
	if claims.Email == "" {
		return nil, "", errors.New("email claim missing")
	}
	// Require an explicit `true` (missing counts as unverified) unless the
	// operator opted out. `any` because some IdPs (AWS Cognito) send a string.
	if v := claims.EmailVerified; v != true && v != "true" && !s.cfg.Auth.AllowUnverifiedEmail {
		return nil, "", errors.New("email not verified")
	}

	u, err := s.users.UpsertFromOIDC(
		ctx, claims.Email, claims.Name, claims.Picture, claims.Sub, s.isAdminEmail(claims.Email))
	if err != nil {
		return nil, "", err
	}

	if u.CompanyID == nil && s.companies != nil {
		// Failing the login beats issuing a session without the company: the
		// join is only attempted here, so a later request wouldn't retry it.
		if err := s.joinDefaultCompany(ctx, u); err != nil {
			return nil, "", fmt.Errorf("join company: %w", err)
		}
	}

	signed, err := s.IssueJWT(u)
	if err != nil {
		return nil, "", err
	}
	return u, signed, nil
}

// joinDefaultCompany attaches a user without a company to the one they join on
// login, and updates u. Mono company mode: the single company, if it exists
// (super admins as admin). Multi company mode: none, a company admin adds
// users by email.
func (s *AuthService) joinDefaultCompany(ctx context.Context, u *model.User) error {
	if s.cfg.Server.MultiCompany {
		return nil
	}
	c, err := s.companies.First(ctx)
	if err != nil || c == nil {
		return err
	}
	role := model.CompanyRoleMember
	if u.IsSuperAdmin {
		role = model.CompanyRoleAdmin
	}
	m, _, err := s.companies.SetMember(ctx, c.ID, u.ID, role)
	if err != nil {
		return err
	}
	u.CompanyID, u.CompanyRole = &m.CompanyID, &m.Role
	return nil
}

func (s *AuthService) IssueJWT(u *model.User) (string, error) {
	now := time.Now()
	c := Claims{
		UserID: u.ID,
		Email:  u.Email,
		Name:   u.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.Auth.SessionMaxAge)),
			Subject:   u.ID,
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return tok.SignedString([]byte(s.cfg.Auth.JWTSecret))
}

func (s *AuthService) ParseJWT(token string) (*Claims, error) {
	c := &Claims{}
	_, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(s.cfg.Auth.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}
