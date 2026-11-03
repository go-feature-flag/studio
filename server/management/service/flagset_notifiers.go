package service

import (
	"context"
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"unicode"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

const (
	maxNotifiers      = 20
	maxNotifierURLLen = 2048
)

// ListNotifiers returns the notifiers of the flagset, secrets included.
func (s *FlagsetService) ListNotifiers(ctx context.Context, id string) ([]model.Notifier, error) {
	return s.repo.GetNotifiers(ctx, id)
}

// ReplaceNotifiers validates and stores the whole notifier list of the flagset.
// The audit entry records names, kinds and states only: URLs and secrets are
// credentials.
func (s *FlagsetService) ReplaceNotifiers(
	ctx context.Context, actorID, id string, ns []model.Notifier,
) ([]model.Notifier, error) {
	if ns == nil {
		ns = []model.Notifier{}
	}
	if err := validateNotifiers(ns); err != nil {
		return nil, err
	}
	fs, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	before, err := s.repo.GetNotifiers(ctx, id)
	if err != nil {
		return nil, err
	}
	if reflect.DeepEqual(before, ns) {
		return ns, nil
	}
	if err := s.repo.UpdateNotifiers(ctx, id, ns); err != nil {
		return nil, writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &fs.ID,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlagset, TargetID: fs.ID,
		Before: notifiersAudit(before), After: notifiersAudit(ns),
	})
	return ns, nil
}

func notifiersAudit(ns []model.Notifier) map[string]any {
	out := make([]map[string]any, len(ns))
	for i, n := range ns {
		out[i] = map[string]any{"name": n.Name, "kind": n.Kind, "enabled": n.Enabled}
	}
	return map[string]any{"notifiers": out}
}

// validateNotifiers returns every problem at once and normalizes ns in place:
// names and URLs are trimmed, and fields the kind does not use are cleared.
// Studio is stricter than the relay proxy, which only checks that the URL is
// set: it must be an absolute http(s) URL.
func validateNotifiers(ns []model.Notifier) error {
	var errs model.ValidationErrors
	if len(ns) > maxNotifiers {
		errs = append(errs, model.ValidationError{
			Field: "notifiers", Message: fmt.Sprintf("notifiers must have at most %d items", maxNotifiers),
		})
	}
	for i := range ns {
		n := &ns[i]
		p := fmt.Sprintf("notifiers[%d].", i)
		errs = append(errs, validateName(&n.Name, p+"name")...)
		switch n.Kind {
		case model.NotifierSlack, model.NotifierDiscord, model.NotifierMicrosoftTeams:
			n.EndpointURL, n.Secret, n.Headers = "", "", nil
			errs = append(errs, validateHTTPURL(&n.WebhookURL, p+"webhookUrl")...)
		case model.NotifierWebhook:
			n.WebhookURL = ""
			errs = append(errs, validateHTTPURL(&n.EndpointURL, p+"endpointUrl")...)
			errs = append(errs, validateHeaders(n.Headers, p+"headers")...)
		default:
			errs = append(errs, model.ValidationError{
				Field: p + "kind", Message: p + "kind must be one of slack, discord, microsoftteams, webhook",
			})
		}
	}
	return errs.Err()
}

func validateHTTPURL(raw *string, field string) model.ValidationErrors {
	*raw = strings.TrimSpace(*raw)
	if *raw == "" {
		return model.ValidationErrors{{Field: field, Message: field + " is required"}}
	}
	u, err := url.Parse(*raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || len(*raw) > maxNotifierURLLen {
		msg := fmt.Sprintf("%s must be an http(s) URL of at most %d characters", field, maxNotifierURLLen)
		return model.ValidationErrors{{Field: field, Message: msg}}
	}
	return nil
}

// validateHeaders keeps header names to RFC 9110 tokens and values free of
// control characters, so a value cannot inject another header.
func validateHeaders(h map[string]string, field string) model.ValidationErrors {
	var errs model.ValidationErrors
	for k, v := range h {
		if k == "" || strings.IndexFunc(k, func(r rune) bool { return !isTokenRune(r) }) >= 0 {
			msg := fmt.Sprintf("%s: %q is not a valid header name", field, k)
			errs = append(errs, model.ValidationError{Field: field, Message: msg})
		}
		if strings.IndexFunc(v, unicode.IsControl) >= 0 {
			msg := fmt.Sprintf("%s: %q value has control characters", field, k)
			errs = append(errs, model.ValidationError{Field: field, Message: msg})
		}
	}
	return errs
}

func isTokenRune(r rune) bool {
	return r < unicode.MaxASCII &&
		(unicode.IsLetter(r) || unicode.IsDigit(r) || strings.ContainsRune("!#$%&'*+-.^_`|~", r))
}
