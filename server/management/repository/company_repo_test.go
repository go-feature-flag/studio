package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyRepoCRUD(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	// Create
	created, err := repo.Create(ctx, "Acme", "desc")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "Acme", created.DisplayName)

	// GetByID
	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)

	_, err = repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// List
	_ = testutil.SeedCompany(t, db, "Beta")
	list, err := repo.List(ctx)
	require.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "Acme", list[0].DisplayName) // ordered by display_name

	// Update display name
	updated, err := repo.Update(ctx, created.ID, new("Acme Inc"), nil)
	require.NoError(t, err)
	assert.Equal(t, "Acme Inc", updated.DisplayName)

	// Update missing -> ErrNotFound
	_, err = repo.Update(ctx, "00000000-0000-0000-0000-000000000000", new("x"), nil)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Delete detaches the members first (users.company_id has no ON DELETE).
	member := testutil.SeedUser(t, db, "m@acme.com", "M", false)
	testutil.SetCompanyMember(t, db, created.ID, member.ID, model.CompanyRoleAdmin)
	require.NoError(t, repo.Delete(ctx, created.ID))
	mem, err := repo.Membership(ctx, member.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	assert.ErrorIs(t, repo.Delete(ctx, created.ID), repository.ErrNotFound)
}

func TestCompanyRepoMembership(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()

	company := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Beta")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)

	// SetMember attaches a user with no company and returns the membership.
	m, prev, err := repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRole(""), prev, "newly added")
	assert.Equal(t, "u@acme.com", m.Email)
	assert.Equal(t, model.CompanyRoleMember, m.Role)
	assert.False(t, m.CreatedAt.IsZero())
	_, prev, err = repo.SetMember(ctx, company.ID, user.ID, model.CompanyRoleMember)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleMember, prev, "already a member")

	mem, err := repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, mem)
	assert.Equal(t, company.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)

	// SetMember to a different company conflicts (one company per user).
	stray := testutil.SeedUser(t, db, "stray@x.com", "S", false)
	_, _, err = repo.SetMember(ctx, "00000000-0000-0000-0000-000000000000", stray.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound, "unknown company")
	_, _, err = repo.SetMember(ctx, other.ID, user.ID, model.CompanyRoleMember)
	assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)

	// ListMembers
	members, err := repo.ListMembers(ctx, company.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, "u@acme.com", members[0].Email)

	// UpdateMemberRole
	_, prev, err = repo.UpdateMemberRole(ctx, company.ID, user.ID, model.CompanyRoleAdmin)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleMember, prev)
	mem, _ = repo.Membership(ctx, user.ID)
	assert.Equal(t, model.CompanyRoleAdmin, mem.Role)

	// UpdateMemberRole on a non-member -> ErrNotFound
	stranger := testutil.SeedUser(t, db, "s@x.com", "S", false)
	_, _, err = repo.UpdateMemberRole(ctx, company.ID, stranger.ID, model.CompanyRoleAdmin)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	// Team roles: one on the company's team, one on another company's team.
	var acmeTeam, betaTeam string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO teams (company_id, name) VALUES ($1, 'acme-team') RETURNING id`, company.ID).Scan(&acmeTeam))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO teams (company_id, name) VALUES ($1, 'beta-team') RETURNING id`, other.ID).Scan(&betaTeam))
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $3, 'viewer')`,
		acmeTeam, betaTeam, user.ID)
	require.NoError(t, err)

	// RemoveMember drops the company's team roles only.
	prev, err = repo.RemoveMember(ctx, company.ID, user.ID)
	require.NoError(t, err)
	assert.Equal(t, model.CompanyRoleAdmin, prev)
	mem, err = repo.Membership(ctx, user.ID)
	require.NoError(t, err)
	assert.Nil(t, mem)
	rows, err := db.Pool.Query(ctx, `SELECT team_id::text FROM team_members WHERE user_id = $1`, user.ID)
	require.NoError(t, err)
	teamIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	assert.Equal(t, []string{betaTeam}, teamIDs)
	_, err = repo.RemoveMember(ctx, company.ID, user.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

func TestCompanyRepoFirst(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)

	none, err := repo.First(t.Context())
	require.NoError(t, err)
	assert.Nil(t, none)

	oldest := testutil.SeedCompany(t, db, "Zeta")
	_ = testutil.SeedCompany(t, db, "Alpha")
	first, err := repo.First(t.Context())
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, oldest.ID, first.ID) // oldest, not alphabetical
}

// A dead context makes every query fail: errors must surface, not be read as
// "not found".
func TestCompanyRepoQueryErrors(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	id := "00000000-0000-0000-0000-000000000000"

	_, err := repo.Create(ctx, "x", "")
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.GetByID(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.First(ctx)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.List(ctx)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Update(ctx, id, nil, nil)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, repo.Delete(ctx, id), context.Canceled)
	_, err = repo.ListMembers(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, _, err = repo.SetMember(ctx, id, id, model.CompanyRoleMember)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.RemoveMember(ctx, id, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.Membership(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.SetRelayProxySecret(ctx, id, "s", 0)
	assert.ErrorIs(t, err, context.Canceled)
	assert.ErrorIs(t, repo.RevokePreviousRelayProxySecret(ctx, id), context.Canceled)
	_, err = repo.GetRelayProxySecret(ctx, id)
	assert.ErrorIs(t, err, context.Canceled)
	_, err = repo.IDByRelayProxySecret(ctx, "s")
	assert.ErrorIs(t, err, context.Canceled)
}

func TestCompanyRepoRelayProxySecret(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	acme := testutil.SeedCompany(t, db, "Acme")
	other := testutil.SeedCompany(t, db, "Other")
	unknown := "00000000-0000-0000-0000-000000000000"
	set := func(companyID, secret string, keep time.Duration) *model.RelayProxySecret {
		t.Helper()
		s, err := repo.SetRelayProxySecret(ctx, companyID, secret, keep)
		require.NoError(t, err)
		assert.Equal(t, secret, s.Secret)
		assert.WithinDuration(t, time.Now(), s.CreatedAt, time.Minute)
		return s
	}

	got, err := repo.GetRelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Nil(t, got, "no secret until one is generated")

	first := set(acme.ID, "goff_rp_one", time.Hour)
	assert.Nil(t, first.PreviousExpiresAt, "nothing to keep on the first rotation")
	assert.Nil(t, first.PreviousSecretEnd)
	got, err = repo.GetRelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Equal(t, first, got)

	// goff_rp_one stays valid for an hour next to goff_rp_two.
	second := set(acme.ID, "goff_rp_two", time.Hour)
	require.NotNil(t, second.PreviousExpiresAt)
	assert.WithinDuration(t, time.Now().Add(time.Hour), *second.PreviousExpiresAt, time.Minute)
	require.NotNil(t, second.PreviousSecretEnd)
	assert.Equal(t, "p_one", *second.PreviousSecretEnd, "only the end of goff_rp_one")
	got, err = repo.GetRelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Equal(t, second, got)

	// Explicit revocation permits another rotation.
	require.NoError(t, repo.RevokePreviousRelayProxySecret(ctx, acme.ID))
	set(acme.ID, "goff_rp_three", time.Hour)
	require.NoError(t, repo.RevokePreviousRelayProxySecret(ctx, acme.ID))
	// Without a grace period, goff_rp_three is revoked at once.
	four := set(acme.ID, "goff_rp_four", 0)
	assert.Nil(t, four.PreviousExpiresAt)
	assert.Nil(t, four.PreviousSecretEnd)
	set(acme.ID, "goff_rp_five", time.Hour)
	// goff_rp_four expires; reads ignore it from then on.
	_, err = db.Pool.Exec(ctx, `UPDATE companies
		SET relay_proxy_previous_secret_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, acme.ID)
	require.NoError(t, err)
	got, err = repo.GetRelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Nil(t, got.PreviousExpiresAt, "an expired previous secret is not mentioned")
	assert.Nil(t, got.PreviousSecretEnd)
	set(other.ID, "goff_rp_other", 0)
	set(other.ID, "goff_rp_other_new", time.Hour)
	// The previous secret of Other is revoked early.
	require.NoError(t, repo.RevokePreviousRelayProxySecret(ctx, other.ID))
	got, err = repo.GetRelayProxySecret(ctx, other.ID)
	require.NoError(t, err)
	assert.Nil(t, got.PreviousExpiresAt)

	_, err = repo.SetRelayProxySecret(ctx, other.ID, "goff_rp_five", 0)
	assert.Error(t, err, "a secret identifies one company")

	tests := []struct {
		name    string
		secret  string
		want    string
		wantErr error
	}{
		{"current secret", "goff_rp_five", acme.ID, nil},
		{"replaced by a second rotation", "goff_rp_one", "", repository.ErrNotFound},
		{"rotated without grace period", "goff_rp_three", "", repository.ErrNotFound},
		{"expired previous secret", "goff_rp_four", "", repository.ErrNotFound},
		{"revoked previous secret", "goff_rp_other", "", repository.ErrNotFound},
		{"current secret of another company", "goff_rp_other_new", other.ID, nil},
		{"empty secret", "", "", repository.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := repo.IDByRelayProxySecret(ctx, tt.secret)
			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.want, id)
		})
	}

	// A previous secret still in its grace period is accepted.
	set(acme.ID, "goff_rp_six", time.Hour)
	id, err := repo.IDByRelayProxySecret(ctx, "goff_rp_five")
	require.NoError(t, err)
	assert.Equal(t, acme.ID, id)

	_, err = repo.SetRelayProxySecret(ctx, unknown, "goff_rp_x", 0)
	assert.ErrorIs(t, err, repository.ErrNotFound)
	_, err = repo.GetRelayProxySecret(ctx, unknown)
	assert.ErrorIs(t, err, repository.ErrNotFound)
	assert.ErrorIs(t, repo.RevokePreviousRelayProxySecret(ctx, unknown), repository.ErrNotFound)
}

func TestCompanyRepoCreateWithAdmin(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	founder := testutil.SeedUser(t, db, "f@acme.com", "F", false)
	countCompanies := func() int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM companies`).Scan(&n))
		return n
	}

	c, m, err := repo.CreateWithAdmin(ctx, "Acme", "", founder.ID, false)
	require.NoError(t, err)
	assert.Equal(t, c.ID, m.CompanyID)
	assert.Equal(t, model.CompanyRoleAdmin, m.Role)

	tests := []struct {
		name    string
		adminID string
	}{
		{"admin already in a company rolls the company back", founder.ID},
		{"unknown admin rolls the company back", "00000000-0000-0000-0000-000000000000"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := repo.CreateWithAdmin(ctx, "Beta", "", tt.adminID, false)
			assert.ErrorIs(t, err, repository.ErrConflictOrNotFound)
			assert.Equal(t, 1, countCompanies(), "no company left behind")
		})
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, _, err = repo.CreateWithAdmin(cancelled, "Gamma", "", founder.ID, false)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestCompanyRepoCreateWithAdminAttachUnassigned(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	early := testutil.SeedUser(t, db, "early@acme.com", "E", false)

	c, admin, err := repo.CreateWithAdmin(ctx, "Acme", "", "", true)
	require.NoError(t, err)
	assert.Nil(t, admin, "no admin requested")
	mem, err := repo.Membership(ctx, early.ID)
	require.NoError(t, err)
	require.NotNil(t, mem, "a user who logged in before the company existed joins it")
	assert.Equal(t, c.ID, mem.CompanyID)
	assert.Equal(t, model.CompanyRoleMember, mem.Role)
}

func TestCompanyRepoRelayProxyRotationBlocked(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	acme := testutil.SeedCompany(t, db, "Acme")
	_, err := repo.SetRelayProxySecret(ctx, acme.ID, "goff_rp_old", 0)
	require.NoError(t, err)
	before, err := repo.SetRelayProxySecret(ctx, acme.ID, "goff_rp_current", time.Hour)
	require.NoError(t, err)
	tests := []struct {
		name string
		keep time.Duration
	}{
		{"without grace period", 0}, {"with grace period", time.Hour},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := repo.SetRelayProxySecret(ctx, acme.ID, "goff_rp_rejected", tt.keep)
			assert.ErrorIs(t, err, repository.ErrRelayProxyPreviousSecretActive)
			assert.Nil(t, got)
			after, err := repo.GetRelayProxySecret(ctx, acme.ID)
			require.NoError(t, err)
			assert.Equal(t, before, after)
			for _, secret := range []string{"goff_rp_old", "goff_rp_current"} {
				id, err := repo.IDByRelayProxySecret(ctx, secret)
				require.NoError(t, err)
				assert.Equal(t, acme.ID, id)
			}
			_, err = repo.IDByRelayProxySecret(ctx, "goff_rp_rejected")
			assert.ErrorIs(t, err, repository.ErrNotFound)
		})
	}
}

func TestCompanyRepoRelayProxyConcurrentRotation(t *testing.T) {
	db := testutil.StartPostgres(t)
	repo := repository.NewCompanyRepo(db)
	ctx := t.Context()
	acme := testutil.SeedCompany(t, db, "Acme")
	_, err := repo.SetRelayProxySecret(ctx, acme.ID, "goff_rp_original", 0)
	require.NoError(t, err)
	type result struct {
		secret *model.RelayProxySecret
		err    error
	}
	results := make(chan result, 2)
	start := make(chan struct{})
	for _, secret := range []string{"goff_rp_a", "goff_rp_b"} {
		go func() {
			<-start
			s, err := repo.SetRelayProxySecret(ctx, acme.ID, secret, time.Hour)
			results <- result{s, err}
		}()
	}
	close(start)
	successes := 0
	for range 2 {
		r := <-results
		if r.err != nil {
			assert.ErrorIs(t, r.err, repository.ErrRelayProxyPreviousSecretActive)
			assert.Nil(t, r.secret)
		} else {
			successes++
			got, err := repo.GetRelayProxySecret(ctx, acme.ID)
			require.NoError(t, err)
			assert.Equal(t, r.secret, got)
		}
	}
	assert.Equal(t, 1, successes)
	id, err := repo.IDByRelayProxySecret(ctx, "goff_rp_original")
	require.NoError(t, err)
	assert.Equal(t, acme.ID, id)
}
