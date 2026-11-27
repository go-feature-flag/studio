package model

import (
	"encoding/json"
	"time"
)

// RelayProxySecret authenticates the relay proxies of a company to Studio
// ("Authorization: Bearer <secret>"), so they can read its flagsets and flags.
type RelayProxySecret struct {
	Secret    string    `json:"secret" example:"goff_rp_4f9c…"`
	CreatedAt time.Time `json:"createdAt"`
}

// RelayProxyFile is the document a relay proxy loads with its studio.url
// option: only flagSets is read, the rest stays in its goff-proxy.yaml.
type RelayProxyFile struct {
	FlagSets []RelayProxyFlagSet `json:"flagSets"`
}

// RelayProxyFlagSet is a flagSets[] entry of the relay proxy configuration,
// with the relay proxy's field names.
type RelayProxyFlagSet struct {
	Name       string                `json:"name"`
	APIKeys    []string              `json:"apiKeys"`
	FileFormat string                `json:"fileFormat"`
	Retrievers []RelayProxyRetriever `json:"retrievers"`
	Notifiers  []RelayProxyNotifier  `json:"notifiers,omitempty"`
	// EvaluationContextEnrichment is a JSON object, or absent when unset.
	EvaluationContextEnrichment json.RawMessage `json:"evaluationContextEnrichment,omitempty" swaggertype:"object"` //nolint:lll // struct tags cannot be wrapped
	RelayProxySettings
}

// RelayProxyRetriever is an http retriever reading a flagset's flags back
// from Studio.
type RelayProxyRetriever struct {
	Kind    string              `json:"kind" example:"http"`
	URL     string              `json:"url"`
	Headers map[string][]string `json:"headers"`
}

// RelayProxyNotifier is a notifier in the relay proxy's shape: unlike
// Notifier, its headers hold a list of values.
type RelayProxyNotifier struct {
	Kind        NotifierKind        `json:"kind"`
	WebhookURL  string              `json:"webhookUrl,omitempty"`
	EndpointURL string              `json:"endpointUrl,omitempty"`
	Secret      string              `json:"secret,omitempty"`
	Headers     map[string][]string `json:"headers,omitempty"`
}
