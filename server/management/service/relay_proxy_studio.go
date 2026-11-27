package service

import (
	"context"
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

// RelayProxySecret returns the company's relay proxy secret, or nil when none
// was generated yet.
func (s *CompanyService) RelayProxySecret(ctx context.Context, companyID string) (*model.RelayProxySecret, error) {
	return s.companies.GetRelayProxySecret(ctx, companyID)
}

// RotateRelayProxySecret generates a new relay proxy secret for the company.
// Relay proxies still sending the old one stop syncing.
func (s *CompanyService) RotateRelayProxySecret(
	ctx context.Context, actorID, companyID string,
) (*model.RelayProxySecret, error) {
	rs, err := s.companies.SetRelayProxySecret(ctx, companyID, newSecret("goff_rp_"))
	if err != nil {
		return nil, writeError(err)
	}
	// The secret itself is never logged, only when it changed.
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, CompanyID: &companyID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetCompany, TargetID: companyID,
		After: map[string]any{"relayProxySecretCreatedAt": rs.CreatedAt},
	})
	return rs, nil
}

// CompanyIDByRelayProxySecret returns the company a relay proxy secret
// belongs to, or ErrUnauthenticated.
func (s *CompanyService) CompanyIDByRelayProxySecret(ctx context.Context, secret string) (string, error) {
	id, err := s.companies.IDByRelayProxySecret(ctx, secret)
	if errors.Is(err, repository.ErrNotFound) {
		return "", ErrUnauthenticated
	}
	return id, err
}

// RelayProxyFlagSets returns the company's flagsets as the flagSets of a relay
// proxy configuration. Each one reads its flags back from Studio with an http
// retriever: flagsURL gives the URL of a flagset's flags, and authorization is
// the header the relay proxy authenticated with, so Studio never re-reads the
// secret.
func (s *FlagsetService) RelayProxyFlagSets(
	ctx context.Context, companyID string, flagsURL func(flagsetID string) string, authorization string,
) (*model.RelayProxyFile, error) {
	flagsets, err := s.repo.ListForRelayProxy(ctx, companyID)
	if err != nil {
		return nil, err
	}
	file := &model.RelayProxyFile{FlagSets: []model.RelayProxyFlagSet{}}
	for _, fs := range flagsets {
		// The relay proxy rejects the whole document for one flagset without API keys.
		if len(fs.APIKeys) == 0 {
			continue
		}
		file.FlagSets = append(file.FlagSets, model.RelayProxyFlagSet{
			Name:       fs.ID,
			APIKeys:    fs.APIKeys,
			FileFormat: "json",
			Retrievers: []model.RelayProxyRetriever{{
				Kind:    "http",
				URL:     flagsURL(fs.ID),
				Headers: map[string][]string{"Authorization": {authorization}},
			}},
			Notifiers:                   relayProxyNotifiers(fs.Notifiers),
			EvaluationContextEnrichment: fs.EvaluationContextEnrichment,
			RelayProxySettings:          fs.RelayProxySettings,
		})
	}
	return file, nil
}

// RelayProxyFlags returns the flags of a flagset of the company as a GO
// Feature Flag JSON flag file.
func (s *FlagsetService) RelayProxyFlags(ctx context.Context, companyID, flagsetID string) ([]byte, error) {
	return s.repo.FlagsForRelayProxy(ctx, companyID, flagsetID)
}

// relayProxyNotifiers keeps the enabled notifiers, in the relay proxy's shape.
func relayProxyNotifiers(ns []model.Notifier) []model.RelayProxyNotifier {
	var out []model.RelayProxyNotifier
	for _, n := range ns {
		if !n.Enabled {
			continue
		}
		rn := model.RelayProxyNotifier{Kind: n.Kind, WebhookURL: n.WebhookURL, EndpointURL: n.EndpointURL, Secret: n.Secret}
		if len(n.Headers) > 0 {
			rn.Headers = make(map[string][]string, len(n.Headers))
			for k, v := range n.Headers {
				rn.Headers[k] = []string{v}
			}
		}
		out = append(out, rn)
	}
	return out
}
