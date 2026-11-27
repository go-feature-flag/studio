package service_test

import (
	"context"
	"encoding/json"
	"regexp"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/internal/testutil"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompanyServiceRelayProxySecret(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newCompanyService(db)
	ctx := t.Context()
	acme := testutil.SeedCompany(t, db, "Acme")
	admin := testutil.SeedUser(t, db, "admin@acme.com", "Admin", false)

	got, err := svc.RelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Nil(t, got)

	first, err := svc.RotateRelayProxySecret(ctx, admin.ID, acme.ID, &model.RotateRelayProxySecretRequest{})
	require.NoError(t, err)
	assert.Regexp(t, regexp.MustCompile(`^goff_rp_[0-9a-f]{64}$`), first.Secret)
	got, err = svc.RelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Equal(t, first.Secret, got.Secret)

	second, err := svc.RotateRelayProxySecret(ctx, admin.ID, acme.ID,
		&model.RotateRelayProxySecretRequest{KeepPreviousSeconds: 3600})
	require.NoError(t, err)
	assert.NotEqual(t, first.Secret, second.Secret)
	require.NotNil(t, second.PreviousExpiresAt)
	assert.WithinDuration(t, time.Now().Add(time.Hour), *second.PreviousExpiresAt, time.Minute)

	var after string
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT after::text FROM audit_log
		WHERE target_type = $1 AND target_id = $2 ORDER BY id DESC LIMIT 1`, model.AuditTargetCompany, acme.ID).Scan(&after))
	assert.Contains(t, after, "relayProxySecretCreatedAt")
	assert.Contains(t, after, "relayProxyPreviousSecretExpiresAt")
	assert.NotContains(t, after, second.Secret, "the secret is never audited")
	assert.NotContains(t, after, first.Secret, "the previous secret is never audited")
	assert.Equal(t, 2, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompany))

	for _, keep := range []int{0, 3600} {
		rejected, err := svc.RotateRelayProxySecret(ctx, admin.ID, acme.ID,
			&model.RotateRelayProxySecretRequest{KeepPreviousSeconds: keep})
		assert.ErrorIs(t, err, service.ErrConflict)
		assert.Equal(t, "previous relay proxy secret is still valid; wait for it to expire or revoke it before rotating again",
			service.PublicMessage(err))
		assert.Nil(t, rejected)
	}
	assert.Equal(t, 2, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompany))
	got, err = svc.RelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Equal(t, second, got)

	tests := []struct {
		name    string
		secret  string
		want    string
		wantErr error
	}{
		{"current secret", second.Secret, acme.ID, nil},
		{"previous secret in its grace period", first.Secret, acme.ID, nil},
		{"unknown secret", "goff_rp_nope", "", service.ErrUnauthenticated},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := svc.CompanyIDByRelayProxySecret(ctx, tt.secret)
			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.want, id)
		})
	}

	require.NoError(t, svc.RevokePreviousRelayProxySecret(ctx, admin.ID, acme.ID))
	_, err = svc.CompanyIDByRelayProxySecret(ctx, first.Secret)
	assert.ErrorIs(t, err, service.ErrUnauthenticated, "a revoked previous secret is refused")
	got, err = svc.RelayProxySecret(ctx, acme.ID)
	require.NoError(t, err)
	assert.Nil(t, got.PreviousExpiresAt)
	assert.Equal(t, 3, auditCount(t, db, model.AuditActionUpdate, model.AuditTargetCompany))

	invalid := []struct {
		name string
		keep int
	}{
		{"negative", -1},
		{"over 30 days", model.MaxRelayProxyPreviousSecretSeconds + 1},
	}
	for _, tt := range invalid {
		t.Run("keepPreviousSeconds "+tt.name, func(t *testing.T) {
			_, err := svc.RotateRelayProxySecret(ctx, admin.ID, acme.ID,
				&model.RotateRelayProxySecretRequest{KeepPreviousSeconds: tt.keep})
			var verrs model.ValidationErrors
			require.ErrorAs(t, err, &verrs)
			assert.Equal(t, "keepPreviousSeconds", verrs[0].Field)
			assert.Equal(t, "keepPreviousSeconds must be between 0 and 2592000", verrs[0].Message)
		})
	}

	unknown := "00000000-0000-0000-0000-000000000000"
	_, err = svc.RotateRelayProxySecret(ctx, admin.ID, unknown, &model.RotateRelayProxySecretRequest{})
	assert.ErrorIs(t, err, service.ErrNotFound)
	assert.ErrorIs(t, svc.RevokePreviousRelayProxySecret(ctx, admin.ID, unknown), service.ErrNotFound)

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = svc.CompanyIDByRelayProxySecret(cancelled, second.Secret)
	assert.ErrorIs(t, err, context.Canceled, "a DB failure is not an authentication failure")
	_, err = svc.RotateRelayProxySecret(cancelled, admin.ID, acme.ID, &model.RotateRelayProxySecretRequest{})
	assert.ErrorIs(t, err, context.Canceled)
}

func TestFlagsetServiceRelayProxyFlagSets(t *testing.T) {
	db := testutil.StartPostgres(t)
	svc := newFlagsetService(db)
	repo := repository.NewFlagsetRepo(db)
	ctx := t.Context()
	acme := testutil.SeedCompany(t, db, "Acme")
	empty := testutil.SeedCompany(t, db, "Empty")
	team := testutil.SeedTeam(t, db, acme.ID, "Platform")
	user := testutil.SeedUser(t, db, "u@acme.com", "U", false)
	keyless := testutil.SeedFlagset(t, db, team.ID, "a-keyless")
	plain := testutil.SeedFlagset(t, db, team.ID, "b-plain")
	tuned := testutil.SeedFlagset(t, db, team.ID, "c-tuned")
	for _, k := range []struct{ flagsetID, key string }{{plain.ID, "goff_plain"}, {tuned.ID, "goff_t1"}, {tuned.ID, "goff_t2"}} {
		_, err := repo.InsertAPIKey(ctx, k.flagsetID, "ci", k.key, user.ID)
		require.NoError(t, err)
	}
	_, err := repo.Update(ctx, tuned.ID, &model.UpdateFlagsetRequest{
		PollingInterval: new(5000), StartWithRetrieverError: new(true), EnablePollingJitter: new(true),
		DisableNotifierOnInit: new(true), Environment: new("production"),
		EvaluationContextEnrichment: json.RawMessage(`{"env":"prod"}`),
	})
	require.NoError(t, err)
	require.NoError(t, repo.UpdateNotifiers(ctx, tuned.ID, []model.Notifier{
		{Name: "chat", Kind: model.NotifierSlack, Enabled: true, WebhookURL: "https://hooks.example/s"},
		{Name: "off", Kind: model.NotifierDiscord, Enabled: false, WebhookURL: "https://hooks.example/d"},
		{Name: "hook", Kind: model.NotifierWebhook, Enabled: true, EndpointURL: "https://hooks.example/w",
			Secret: "shh", Headers: map[string]string{"X-Team": "platform"}},
	}))
	flagsURL := func(id string) string { return "http://studio:8080/flagsets/" + id }
	retriever := func(id string) string {
		return `"fileFormat":"json","retrievers":[{"kind":"http","url":"http://studio:8080/flagsets/` + id +
			`","headers":{"Authorization":["Bearer goff_rp_x"]}}]`
	}

	tests := []struct {
		name      string
		companyID string
		want      string
		wantErr   error
	}{
		{"flagsets with API keys, in the relay proxy's shape", acme.ID, `{"flagSets":[
			{"name":"` + plain.ID + `","apiKeys":["goff_plain"],` + retriever(plain.ID) + `,
			 "pollingInterval":60000,"startWithRetrieverError":false,"enablePollingJitter":false,
			 "disableNotifierOnInit":false,"environment":""},
			{"name":"` + tuned.ID + `","apiKeys":["goff_t1","goff_t2"],` + retriever(tuned.ID) + `,
			 "notifiers":[
				{"kind":"slack","webhookUrl":"https://hooks.example/s"},
				{"kind":"webhook","endpointUrl":"https://hooks.example/w","secret":"shh","headers":{"X-Team":["platform"]}}],
			 "evaluationContextEnrichment":{"env":"prod"},
			 "pollingInterval":5000,"startWithRetrieverError":true,"enablePollingJitter":true,
			 "disableNotifierOnInit":true,"environment":"production"}]}`, nil},
		{"company without flagsets", empty.ID, `{"flagSets":[]}`, nil},
		{"unknown company", "00000000-0000-0000-0000-000000000000", "", service.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.RelayProxyFlagSets(ctx, tt.companyID, flagsURL, "Bearer goff_rp_x")
			assert.ErrorIs(t, err, tt.wantErr)
			if tt.want == "" {
				return
			}
			b, err := json.Marshal(got)
			require.NoError(t, err)
			assert.JSONEq(t, tt.want, string(b))
			assert.NotContains(t, string(b), keyless.ID, "a flagset without API keys is left out")
		})
	}

	testutil.SeedFlag(t, db, plain.ID, "my-flag", nil, nil)
	flags, err := svc.RelayProxyFlags(ctx, acme.ID, plain.ID)
	require.NoError(t, err)
	assert.Contains(t, string(flags), `"my-flag"`)
	_, err = svc.RelayProxyFlags(ctx, empty.ID, plain.ID)
	assert.ErrorIs(t, err, service.ErrNotFound, "a flagset of another company is not found")
}
