import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { load as yamlLoad } from "js-yaml";
import { Refine } from "@refinedev/core";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw-server";
import { dataProvider } from "@/providers/data";
import { i18nProvider } from "@/providers/i18n";
import { API_URL } from "@/providers/constants";
import { authProvider, getCachedUser, seedCachedIdentity } from "@/providers/auth";
import { RelayProxyConfigPreview } from "./relay-proxy-config-preview";

const { copy } = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copy }));

const url = `${API_URL}/relay-proxy/flagsets.json`;
const props = { companyId: "acme", secret: "goff_rp_current", secretCreatedAt: "2026-11-26T10:00:00Z" };
const config = {
  flagSets: [{
    name: "production", apiKeys: ["api-key"], fileFormat: "json",
    retrievers: [{ kind: "http", url: "https://studio.example/flags.json", headers: { Authorization: ["Bearer goff_rp_current"] } }],
    notifiers: [{ kind: "webhook", endpointUrl: "https://hooks.example", secret: "notifier-secret" }],
    evaluationContextEnrichment: { region: "eu" }, futureSetting: { preserved: true },
  }],
};
const options = { reactQuery: { clientConfig: { defaultOptions: { queries: { retry: false } } } } };
const preview = (overrides: Partial<typeof props> = {}) => (
  <Refine dataProvider={dataProvider} i18nProvider={i18nProvider} options={options}>
    <RelayProxyConfigPreview {...props} {...overrides} />
  </Refine>
);
const toggle = () => screen.getByRole("button", { name: "See relay proxy flagset configuration" });
const codeRegion = () => screen.getByRole("region", { name: "Flagset configuration YAML" });
const renderedYAML = () => yamlLoad(codeRegion().textContent ?? "");

beforeEach(() => {
  copy.mockReset().mockResolvedValue(true);
  server.use(http.get(url, () => HttpResponse.json(config)));
});

describe("RelayProxyConfigPreview", () => {
  it("starts collapsed without fetching, then loads and copies the complete response as YAML", async () => {
    const requests: (string | null)[] = [];
    server.use(http.get(url, ({ request }) => {
      requests.push(request.headers.get("authorization"));
      return HttpResponse.json(config);
    }));
    render(preview());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(requests).toEqual([]);
    await userEvent.click(toggle());
    await waitFor(() => expect(renderedYAML()).toEqual(config));
    expect(requests).toEqual(["Bearer goff_rp_current"]);
    await userEvent.click(screen.getByRole("button", { name: "Copy flagset configuration" }));
    const displayed = codeRegion().textContent ?? "";
    expect(displayed).toContain("flagSets:\n  - name: production\n");
    expect(copy).toHaveBeenCalledWith(displayed);
  });

  it("fetches fresh data on Refresh and when reopened", async () => {
    let version = 0;
    server.use(http.get(url, () => HttpResponse.json({ flagSets: [], version: ++version })));
    render(preview());
    await userEvent.click(toggle());
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], version: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh configuration" }));
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], version: 2 }));
    await userEvent.click(toggle());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await userEvent.click(toggle());
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], version: 3 }));
  });

  it("shows loading until the response arrives and renders an empty flagset list", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get(url, async () => { await ready; return HttpResponse.json({ flagSets: [] }); }));
    render(preview());
    await userEvent.click(toggle());
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByRole("button", { name: "Copy flagset configuration" })).not.toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [] }));
  });

  it.each([401, 500])("shows a request error (%i) and allows retry", async (status) => {
    server.use(http.get(url, () => HttpResponse.json({ message: "Cannot load configuration" }, { status })));
    render(preview());
    await userEvent.click(toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot load configuration");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    server.use(http.get(url, () => HttpResponse.json(config)));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(renderedYAML()).toEqual(config));
  });

  it.each([
    { name: "company changes", next: { companyId: "other", secret: "goff_rp_other" } },
    { name: "secret rotates", next: { secret: "goff_rp_new", secretCreatedAt: "2026-11-27T10:00:00Z" } },
  ])("replaces old data when $name", async ({ next }) => {
    const requests: (string | null)[] = [];
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get(url, async ({ request }) => {
      const authorization = request.headers.get("authorization");
      requests.push(authorization);
      if (authorization !== "Bearer goff_rp_current") await ready;
      return HttpResponse.json({ flagSets: [], authorization });
    }));
    const { rerender } = render(preview());
    await userEvent.click(toggle());
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], authorization: "Bearer goff_rp_current" }));
    rerender(preview(next));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], authorization: `Bearer ${next.secret}` }));
  });
  it("cancels an old company's in-flight request and never displays its late response", async () => {
    let oldRequest: Request | undefined;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get(url, async ({ request }) => {
      if (request.headers.get("authorization") === "Bearer goff_rp_current") {
        oldRequest = request;
        await ready;
        return HttpResponse.json({ flagSets: [], company: "old" });
      }
      return HttpResponse.json({ flagSets: [], company: "new" });
    }));
    const { rerender } = render(preview());
    await userEvent.click(toggle());
    await waitFor(() => expect(oldRequest).toBeDefined());
    rerender(preview({ companyId: "other", secret: "goff_rp_other" }));
    await waitFor(() => expect(renderedYAML()).toEqual({ flagSets: [], company: "new" }));
    expect(oldRequest!.signal.aborted).toBe(true);
    await act(async () => release());
    expect(renderedYAML()).toEqual({ flagSets: [], company: "new" });
  });

  it("keeps the administrator signed in when the relay credential is rejected", async () => {
    const user = { id: "admin", email: "admin@example.com", name: "Admin", isSuperAdmin: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
    seedCachedIdentity({ user, membership: [] });
    server.use(
      http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ data: { user, membership: [] } })),
      http.post(`${API_URL}/auth/logout`, () => HttpResponse.json({})),
      http.get(url, () => HttpResponse.json({ message: "Relay secret expired" }, { status: 401 })),
    );
    render(
      <Refine dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider} options={options}>
        <RelayProxyConfigPreview {...props} />
      </Refine>,
    );
    await userEvent.click(toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent("Relay secret expired");
    expect(getCachedUser()).toEqual(user);
  });

  it("reports an offline request failure instead of exposing an empty Copy action", async () => {
    let requests = 0;
    server.use(http.get(url, () => { requests++; return HttpResponse.error(); }));
    render(preview());
    act(() => window.dispatchEvent(new Event("offline")));
    try {
      await userEvent.click(toggle());
      expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load flagset configuration");
      expect(requests).toBe(1);
      expect(screen.queryByRole("button", { name: "Copy flagset configuration" })).not.toBeInTheDocument();
    } finally {
      act(() => window.dispatchEvent(new Event("online")));
    }
  });

});
