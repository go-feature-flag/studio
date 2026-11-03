package service

import (
	"encoding/json"
	"testing"
	"unicode/utf8"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

type relayProxyFile struct {
	Server struct {
		Mode string `yaml:"mode"`
		Port int    `yaml:"port"`
	} `yaml:"server"`
	FlagSets []struct {
		Name                        string         `yaml:"name"`
		PollingInterval             int            `yaml:"pollingInterval"`
		StartWithRetrieverError     bool           `yaml:"startWithRetrieverError"`
		EnablePollingJitter         bool           `yaml:"enablePollingJitter"`
		DisableNotifierOnInit       bool           `yaml:"disableNotifierOnInit"`
		Environment                 string         `yaml:"environment"`
		EvaluationContextEnrichment map[string]any `yaml:"evaluationContextEnrichment"`
		APIKeys                     []string       `yaml:"apiKeys"`
		Retrievers                  []struct {
			Kind  string `yaml:"kind"`
			URI   string `yaml:"uri"`
			Table string `yaml:"table"`
		} `yaml:"retrievers"`
		Notifiers []relayProxyNotifier `yaml:"notifiers"`
	} `yaml:"flagSets"`
}

// relayProxyFlagsetOptions are the optional flagSets[] keys a test checks.
type relayProxyFlagsetOptions struct {
	StartWithRetrieverError, EnablePollingJitter, DisableNotifierOnInit bool
	Environment                                                         string
	EvaluationContextEnrichment                                         map[string]any
}

type relayProxyNotifier struct {
	Kind        string              `yaml:"kind"`
	WebhookURL  string              `yaml:"webhookUrl"`
	EndpointURL string              `yaml:"endpointUrl"`
	Secret      string              `yaml:"secret"`
	Headers     map[string][]string `yaml:"headers"`
}

const testDBURI = "postgres://goff_relay:<password>@db.internal:5432/goff_mgmt"

func parseRelayProxyConfig(t testing.TB, flagsets []model.RelayProxyFlagset) (string, relayProxyFile) {
	t.Helper()
	out, err := renderRelayProxyConfig(flagsets, testDBURI)
	require.NoError(t, err)
	var f relayProxyFile
	require.NoError(t, yaml.Unmarshal([]byte(out), &f), out)
	return out, f
}

func TestRenderRelayProxyConfig(t *testing.T) {
	rps := model.RelayProxySettings{PollingInterval: 60000}
	tests := []struct {
		name          string
		flagsets      []model.RelayProxyFlagset
		wantNames     []string
		wantKeys      [][]string
		wantPolling   []int
		wantFlagset   *relayProxyFlagsetOptions // options of the only flagset
		wantContains  []string
		wantMissing   []string
		wantNotifiers [][]relayProxyNotifier
	}{
		{
			name:         "no flagsets",
			wantContains: []string{"# No flagset with an API key in this company yet."},
		},
		{
			name: "several flagsets keep their keys in order",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a", "goff_b"}, RelayProxySettings: model.RelayProxySettings{PollingInterval: 60000}},
				{ID: "id-2", Name: "dev", TeamName: "Web", APIKeys: []string{"goff_c"}, RelayProxySettings: model.RelayProxySettings{PollingInterval: 5000}},
			},
			wantNames:    []string{"id-1", "id-2"},
			wantKeys:     [][]string{{"goff_a", "goff_b"}, {"goff_c"}},
			wantPolling:  []int{60000, 5000},
			wantContains: []string{"# Platform / prod", "# Web / dev"},
		},
		{
			name: "keyless flagset is skipped",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "empty", TeamName: "Platform", APIKeys: []string{}},
				{ID: "id-2", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a"}, RelayProxySettings: model.RelayProxySettings{PollingInterval: 1000}},
			},
			wantNames:    []string{"id-2"},
			wantKeys:     [][]string{{"goff_a"}},
			wantPolling:  []int{1000},
			wantContains: []string{"# Platform / empty\n  # skipped: no API key"},
		},
		{
			name: "every relay proxy option is written",
			flagsets: []model.RelayProxyFlagset{{
				ID: "id-1", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a"},
				EvaluationContextEnrichment: json.RawMessage(`{"env": "prod", "tier": 2, "nested": {"a": [1, "x"]}}`),
				RelayProxySettings: model.RelayProxySettings{
					PollingInterval: 5000, StartWithRetrieverError: true, EnablePollingJitter: true,
					DisableNotifierOnInit: true, Environment: "production",
				},
			}},
			wantNames:   []string{"id-1"},
			wantKeys:    [][]string{{"goff_a"}},
			wantPolling: []int{5000},
			wantFlagset: &relayProxyFlagsetOptions{
				StartWithRetrieverError: true, EnablePollingJitter: true, DisableNotifierOnInit: true,
				Environment:                 "production",
				EvaluationContextEnrichment: map[string]any{"env": "prod", "tier": 2, "nested": map[string]any{"a": []any{1, "x"}}},
			},
			wantContains: []string{`evaluationContextEnrichment: {"env":"prod","nested":{"a":[1,"x"]},"tier":2}`},
		},
		{
			name: "unset options keep the relay proxy defaults",
			flagsets: []model.RelayProxyFlagset{{
				ID: "id-1", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a"},
				EvaluationContextEnrichment: json.RawMessage(`{}`),
				RelayProxySettings:          model.RelayProxySettings{PollingInterval: 60000},
			}},
			wantNames:   []string{"id-1"},
			wantKeys:    [][]string{{"goff_a"}},
			wantPolling: []int{60000},
			wantFlagset: &relayProxyFlagsetOptions{},
			wantMissing: []string{"environment", "evaluationContextEnrichment"},
		},
		{
			name: "only keyless flagsets emit no flagSets key",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "empty", TeamName: "Platform"},
			},
			wantContains: []string{"# No flagset with an API key in this company yet.", "# skipped: no API key"},
		},
		{
			name: "newline in a name stays in the comment",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "a\nflagSets: []\r", TeamName: "T\neam", APIKeys: []string{"goff_a"}, RelayProxySettings: model.RelayProxySettings{PollingInterval: 60000}},
			},
			wantNames:    []string{"id-1"},
			wantKeys:     [][]string{{"goff_a"}},
			wantPolling:  []int{60000},
			wantContains: []string{"# T eam / a flagSets: [] "},
		},
		{
			name: "enabled notifiers are rendered, disabled ones left out",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a"}, RelayProxySettings: rps, Notifiers: []model.Notifier{
					{Name: "#flags\nkind: log", Kind: model.NotifierSlack, Enabled: true, WebhookURL: "https://hooks.slack.com/x"},
					{Name: "Release room", Kind: model.NotifierMicrosoftTeams, WebhookURL: "https://teams.example/y"},
					{
						Name: "Audit", Kind: model.NotifierWebhook, Enabled: true, EndpointURL: "https://audit.example/goff",
						Secret: `s"e: cret`, Headers: map[string]string{"Authorization": "Bearer t", "X-B": "#x"},
					},
				}},
				{ID: "id-2", Name: "dev", TeamName: "Web", APIKeys: []string{"goff_b"}, RelayProxySettings: rps, Notifiers: []model.Notifier{
					{Name: "off", Kind: model.NotifierDiscord, WebhookURL: "https://discord.com/z"},
				}},
			},
			wantNames:    []string{"id-1", "id-2"},
			wantKeys:     [][]string{{"goff_a"}, {"goff_b"}},
			wantPolling:  []int{60000, 60000},
			wantContains: []string{"# #flags kind: log"},
			wantNotifiers: [][]relayProxyNotifier{
				{
					{Kind: "slack", WebhookURL: "https://hooks.slack.com/x"},
					{
						Kind: "webhook", EndpointURL: "https://audit.example/goff", Secret: `s"e: cret`,
						Headers: map[string][]string{"Authorization": {"Bearer t"}, "X-B": {"#x"}},
					},
				},
				nil,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, f := parseRelayProxyConfig(t, tt.flagsets)
			assert.Equal(t, "http", f.Server.Mode)
			assert.Equal(t, 1031, f.Server.Port)
			require.Len(t, f.FlagSets, len(tt.wantNames))
			for i, fs := range f.FlagSets {
				assert.Equal(t, tt.wantNames[i], fs.Name)
				assert.Equal(t, tt.wantPolling[i], fs.PollingInterval)
				assert.Equal(t, tt.wantKeys[i], fs.APIKeys)
				require.Len(t, fs.Retrievers, 1)
				assert.Equal(t, "postgresql", fs.Retrievers[0].Kind)
				assert.Equal(t, "goff_flags", fs.Retrievers[0].Table)
				assert.Equal(t, testDBURI, fs.Retrievers[0].URI)
				if tt.wantNotifiers != nil {
					assert.Equal(t, tt.wantNotifiers[i], fs.Notifiers)
				}
			}
			for _, s := range tt.wantContains {
				assert.Contains(t, out, s)
			}
			for _, s := range tt.wantMissing {
				assert.NotContains(t, out, s)
			}
			if tt.wantFlagset != nil {
				fs := f.FlagSets[0]
				assert.Equal(t, *tt.wantFlagset, relayProxyFlagsetOptions{
					StartWithRetrieverError: fs.StartWithRetrieverError, EnablePollingJitter: fs.EnablePollingJitter,
					DisableNotifierOnInit: fs.DisableNotifierOnInit, Environment: fs.Environment,
					EvaluationContextEnrichment: fs.EvaluationContextEnrichment,
				})
			}
		})
	}
}

// Flagset and team names (comments) and the environment (a quoted value) are
// free-form user input: none may break the YAML or
// change which flagsets are served, and valid UTF-8 values round-trip.
func FuzzRenderRelayProxyConfig(f *testing.F) {
	for _, seed := range []string{"prod", "a\nflagSets: []\r", "# x", "\"quoted\"", "key: value", "\u2028", "\x85\x00\xff"} {
		f.Add(seed, seed, seed)
	}
	f.Fuzz(func(t *testing.T, name, team, value string) {
		_, got := parseRelayProxyConfig(t, []model.RelayProxyFlagset{{
			ID: "id-1", Name: name, TeamName: team, APIKeys: []string{"goff_a"},
			RelayProxySettings: model.RelayProxySettings{
				PollingInterval: 60000, Environment: value,
			},
		}})
		require.Len(t, got.FlagSets, 1)
		assert.Equal(t, "id-1", got.FlagSets[0].Name)
		assert.Equal(t, []string{"goff_a"}, got.FlagSets[0].APIKeys)
		if utf8.ValidString(value) {
			assert.Equal(t, value, got.FlagSets[0].Environment)
		}
	})
}

func TestRelayProxyDBURI(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		port     uint16
		database string
		want     string
	}{
		{"host and database", "db.internal", 5432, "goff_mgmt", "postgres://goff_relay:<password>@db.internal:5432/goff_mgmt"},
		{"custom port", "localhost", 6543, "goff", "postgres://goff_relay:<password>@localhost:6543/goff"},
		{"ipv6 host is bracketed", "::1", 5432, "goff", "postgres://goff_relay:<password>@[::1]:5432/goff"},
		{"unix socket host stays a placeholder", "/var/run/postgresql", 5432, "goff", "postgres://goff_relay:<password>@<host>:5432/goff"},
		{"missing host and database", "", 5432, "", "postgres://goff_relay:<password>@<host>:5432/<db>"},
		{"database name is escaped", "db", 5432, "my db/x", "postgres://goff_relay:<password>@db:5432/my%20db%2Fx"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, relayProxyDBURI(tt.host, tt.port, tt.database))
		})
	}
}
