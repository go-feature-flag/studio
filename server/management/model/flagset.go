package model

import (
	"encoding/json"
	"time"
)

// Flagset groups flags served to relay proxies through its API keys. How a
// relay proxy retrieves and exports is configured in the relay proxy itself;
// its notifiers come from Studio (see Notifier).
type Flagset struct {
	ID          string `db:"id" json:"id"`
	TeamID      string `db:"team_id" json:"teamId"`
	Name        string `db:"name" json:"name"`
	Description string `db:"description" json:"description"`
	// APIKeyCount, FlagCount and EnabledFlagCount are computed by the query;
	// their db tags name the SELECT aliases.
	APIKeyCount      int `db:"api_key_count" json:"apiKeyCount"`
	FlagCount        int `db:"flag_count" json:"flagCount"`
	EnabledFlagCount int `db:"enabled_flag_count" json:"enabledFlagCount"`
	// EvaluationContextEnrichment is a free-form object merged into every
	// evaluation context for flags in this flagset (enrichment value wins on
	// key collision).
	EvaluationContextEnrichment json.RawMessage `db:"evaluation_context_enrichment" json:"evaluationContextEnrichment,omitempty" swaggertype:"object"` //nolint:lll // struct tags cannot be wrapped
	// DefaultTestingEvaluationContext is the evaluation context proposed by
	// default in the UI's flag test/evaluate panel for flags in this flagset.
	DefaultTestingEvaluationContext json.RawMessage `db:"default_testing_evaluation_context" json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"` //nolint:lll // struct tags cannot be wrapped
	RelayProxySettings
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

// RelayProxySettings are the flagset's options in the generated goff-proxy.yaml
// (its flagSets[] entry, same names); the defaults are the relay proxy's.
type RelayProxySettings struct {
	// PollingInterval is how often, in milliseconds, the relay proxy reloads
	// the flagset's flags.
	PollingInterval         int    `db:"polling_interval" json:"pollingInterval" example:"60000"`
	StartWithRetrieverError bool   `db:"start_with_retriever_error" json:"startWithRetrieverError"`
	EnablePollingJitter     bool   `db:"enable_polling_jitter" json:"enablePollingJitter"`
	DisableNotifierOnInit   bool   `db:"disable_notifier_on_init" json:"disableNotifierOnInit"`
	Environment             string `db:"environment" json:"environment" example:"production"`
}

type CreateFlagsetRequest struct {
	Name                            string          `json:"name" validate:"required" example:"production"`
	Description                     string          `json:"description"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
}

// UpdateFlagsetRequest is a partial update: absent fields are left unchanged,
// and null clears a JSON setting.
type UpdateFlagsetRequest struct {
	Name                            *string         `json:"name,omitempty"`
	Description                     *string         `json:"description,omitempty"`
	EvaluationContextEnrichment     json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"`
	DefaultTestingEvaluationContext json.RawMessage `json:"defaultTestingEvaluationContext,omitempty" swaggertype:"object"`
	// PollingInterval is in milliseconds, between MinPollingInterval and
	// MaxPollingInterval.
	PollingInterval         *int    `json:"pollingInterval,omitempty" example:"60000"`
	StartWithRetrieverError *bool   `json:"startWithRetrieverError,omitempty"`
	EnablePollingJitter     *bool   `json:"enablePollingJitter,omitempty"`
	DisableNotifierOnInit   *bool   `json:"disableNotifierOnInit,omitempty"`
	Environment             *string `json:"environment,omitempty" example:"production"`
}

// The relay proxy accepts any interval from 1s, and a negative one to disable
// polling. Studio is stricter: polling is how flag edits reach the relay
// proxy, so it can't be disabled, and a day caps the wait for an edit.
const (
	MinPollingInterval = 1000
	MaxPollingInterval = 24 * 60 * 60 * 1000
)

type FlagsetAPIKey struct {
	ID        string  `db:"id" json:"id"`
	FlagsetID string  `db:"flagset_id" json:"flagsetId"`
	Label     string  `db:"label" json:"label"`
	APIKey    string  `db:"api_key" json:"apiKey"`
	CreatedBy *string `db:"created_by" json:"createdBy,omitempty"`
	// CreatedByName is joined from users; nil once the creator is deleted.
	CreatedByName *string   `db:"created_by_name" json:"createdByName,omitempty"`
	CreatedAt     time.Time `db:"created_at" json:"createdAt"`
}

type CreateAPIKeyRequest struct {
	Label string `json:"label" validate:"required" example:"relay-proxy-prod"`
}

// RelayProxyFlagset is a live flagset with its API keys and notifiers, as
// needed to write a relay proxy configuration.
type RelayProxyFlagset struct {
	ID       string   `db:"id" json:"id"`
	Name     string   `db:"name" json:"name"`
	TeamName string   `db:"team_name" json:"teamName"`
	APIKeys  []string `db:"api_keys" json:"apiKeys"`
	// EvaluationContextEnrichment is a JSON object, or empty when unset.
	EvaluationContextEnrichment json.RawMessage `db:"evaluation_context_enrichment" json:"evaluationContextEnrichment,omitempty"` //nolint:lll // struct tags cannot be wrapped
	Notifiers                   []Notifier      `db:"notifiers" json:"notifiers"`
	RelayProxySettings
}

// NotifierKind values are the relay proxy's notifier kinds. Its "log" notifier
// is not offered: the relay proxy config does not accept it per flagset.
type NotifierKind string

const (
	NotifierSlack          NotifierKind = "slack"
	NotifierDiscord        NotifierKind = "discord"
	NotifierMicrosoftTeams NotifierKind = "microsoftteams"
	NotifierWebhook        NotifierKind = "webhook"
)

// Notifier is a relay proxy notifier of a flagset, called on every flag
// change. Chat kinds use WebhookURL; the webhook kind uses EndpointURL, Secret
// and Headers. A disabled notifier is kept but left out of the relay proxy
// config.
type Notifier struct {
	Name        string            `json:"name" example:"#feature-flags"`
	Kind        NotifierKind      `json:"kind" enums:"slack,discord,microsoftteams,webhook"`
	Enabled     bool              `json:"enabled"`
	WebhookURL  string            `json:"webhookUrl,omitempty"`
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Secret      string            `json:"secret,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

// ReplaceNotifiersRequest sets the whole notifier list of a flagset.
type ReplaceNotifiersRequest struct {
	Notifiers []Notifier `json:"notifiers"`
}
