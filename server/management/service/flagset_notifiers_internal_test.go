package service

import (
	"slices"
	"strings"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateNotifiers(t *testing.T) {
	valid := model.Notifier{Name: "d", Kind: model.NotifierDiscord, WebhookURL: "https://discord.example/x"}
	tests := []struct {
		name       string
		notifiers  []model.Notifier
		wantFields []string
		want       []model.Notifier
	}{
		{
			name: "valid chat and webhook notifiers are trimmed and stripped of unused fields",
			notifiers: []model.Notifier{
				{
					Name: " #flags ", Kind: model.NotifierSlack, WebhookURL: " https://hooks.slack.com/x ",
					EndpointURL: "https://ignored", Secret: "ignored", Headers: map[string]string{"A": "b"},
				},
				{
					Name: "Audit", Kind: model.NotifierWebhook, EndpointURL: "http://audit.example/goff",
					WebhookURL: "https://ignored", Secret: "s", Headers: map[string]string{"X-Token": "v"},
				},
			},
			want: []model.Notifier{
				{Name: "#flags", Kind: model.NotifierSlack, WebhookURL: "https://hooks.slack.com/x"},
				{
					Name: "Audit", Kind: model.NotifierWebhook, EndpointURL: "http://audit.example/goff",
					Secret: "s", Headers: map[string]string{"X-Token": "v"},
				},
			},
		},
		{
			name:      "empty list",
			notifiers: []model.Notifier{},
			want:      []model.Notifier{},
		},
		{
			name: "every problem is reported",
			notifiers: []model.Notifier{
				{Name: " ", Kind: model.NotifierDiscord},
				{Name: "teams", Kind: model.NotifierMicrosoftTeams, WebhookURL: "ftp://x"},
				{Name: "log", Kind: "log"},
				{Name: "hook", Kind: model.NotifierWebhook, EndpointURL: "/relative"},
			},
			wantFields: []string{
				"notifiers[0].name", "notifiers[0].webhookUrl", "notifiers[1].webhookUrl",
				"notifiers[2].kind", "notifiers[3].endpointUrl",
			},
		},
		{
			name: "header names must be tokens and values free of control characters",
			notifiers: []model.Notifier{{
				Name: "hook", Kind: model.NotifierWebhook, EndpointURL: "https://x.example",
				Headers: map[string]string{"Bad Name": "v", "X-Ok": "a\r\nInjected: 1"},
			}},
			wantFields: []string{"notifiers[0].headers", "notifiers[0].headers"},
		},
		{
			name: "URL too long",
			notifiers: []model.Notifier{{
				Name: "s", Kind: model.NotifierSlack, WebhookURL: "https://x.example/" + strings.Repeat("a", maxNotifierURLLen),
			}},
			wantFields: []string{"notifiers[0].webhookUrl"},
		},
		{
			name:       "too many notifiers",
			notifiers:  slices.Repeat([]model.Notifier{valid}, maxNotifiers+1),
			wantFields: []string{"notifiers"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateNotifiers(tt.notifiers)
			if tt.wantFields == nil {
				require.NoError(t, err)
				assert.Equal(t, tt.want, tt.notifiers)
				return
			}
			var ve model.ValidationErrors
			require.ErrorAs(t, err, &ve)
			fields := make([]string, len(ve))
			for i, e := range ve {
				fields[i] = e.Field
			}
			assert.Equal(t, tt.wantFields, fields)
		})
	}
}
