package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/moby/moby/api/types/container"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// The relay proxy under test. latest on purpose: the test checks Studio
// against what users run today (studio.url needs v1.59.0 or later).
const relayProxyImage = "gofeatureflag/go-feature-flag:latest"

// A real relay proxy loads its flagSets from Studio (studio.url), evaluates
// the flags its http retriever reads back from Studio, and picks up a flag
// change on the next poll.
func TestRelayProxyLoadsFlagSetsFromStudio(t *testing.T) {
	e, auth := routesServer(t) // skips without Docker, like every DB test
	f := routesSeed(t, auth)
	_, err := repository.NewFlagsetRepo(f.db).Update(t.Context(), f.ids["flagset"],
		&model.UpdateFlagsetRequest{PollingInterval: new(1000)})
	require.NoError(t, err)
	secret := rotateRelayProxySecret(t, e, f)

	// On every interface: the relay proxy reaches Studio through the Docker
	// host gateway, not the loopback. (testcontainers' WithHostPortAccess opens
	// its tunnel only once the container is ready, too late for a relay proxy
	// that loads its flagSets at startup.)
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	require.NoError(t, err)
	studio := httptest.NewUnstartedServer(e)
	_ = studio.Listener.Close()
	studio.Listener = listener
	studio.Start()
	t.Cleanup(studio.Close)
	studioPort := listener.Addr().(*net.TCPAddr).Port

	proxyConf := fmt.Sprintf(`server:
  mode: http
  port: 1031
studio:
  url: http://host.docker.internal:%d/api/v1/relay-proxy/flagsets.json
  pollingInterval: 1000
  headers:
    Authorization:
      - Bearer %s
`, studioPort, secret)
	proxy, err := testcontainers.Run(t.Context(), relayProxyImage,
		testcontainers.WithHostConfigModifier(func(hc *container.HostConfig) {
			hc.ExtraHosts = append(hc.ExtraHosts, "host.docker.internal:host-gateway")
		}),
		testcontainers.WithExposedPorts("1031/tcp"),
		testcontainers.WithFiles(testcontainers.ContainerFile{
			Reader: strings.NewReader(proxyConf), ContainerFilePath: "/goff/goff-proxy.yaml", FileMode: 0o644,
		}),
		testcontainers.WithWaitStrategyAndDeadline(time.Minute,
			wait.ForHTTP("/health").WithPort("1031/tcp")),
	)
	testcontainers.CleanupContainer(t, proxy)
	require.NoError(t, err)
	t.Cleanup(func() {
		if t.Failed() {
			logs, err := proxy.Logs(t.Context())
			if err == nil {
				b, _ := io.ReadAll(logs)
				t.Logf("relay proxy logs:\n%s", b)
			}
		}
	})
	endpoint, err := proxy.PortEndpoint(t.Context(), "1031/tcp", "http")
	require.NoError(t, err)

	evaluate := func() map[string]any {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, endpoint+"/ofrep/v1/evaluate/flags/flag",
			bytes.NewBufferString(`{"context":{"targetingKey":"user-1"}}`))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer goff_test") // the flagset's API key, seeded by routesSeed
		res, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		var body map[string]any
		require.NoError(t, json.NewDecoder(res.Body).Decode(&body))
		return body
	}

	got := evaluate()
	assert.Equal(t, true, got["value"], got)
	assert.Equal(t, "on", got["variant"], got)

	rec := f.do(e, "POST", "/api/v1/flags/{flag}/disable", editor, `{"disabled":true}`)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	assert.EventuallyWithT(t, func(c *assert.CollectT) {
		assert.Equal(c, "DISABLED", evaluate()["reason"])
	}, 30*time.Second, 500*time.Millisecond, "the relay proxy polls the flag change from Studio")
}
