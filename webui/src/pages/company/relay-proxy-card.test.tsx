import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type MutateCallbacks = { onSuccess: () => void; onError: (err: unknown) => void };

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  isPending: false,
  url: "",
  refetch: vi.fn(),
  mutate: vi.fn(),
  copyToClipboard: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: (args: { url: string }) => {
    h.url = args.url;
    return {
      query: { data: { data: h.data }, isLoading: h.isLoading, isError: h.isError, refetch: h.refetch },
    };
  },
  useCustomMutation: () => ({ mutate: h.mutate, mutation: { isPending: h.isPending } }),
}));
vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (v: string) => h.copyToClipboard(v),
}));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import { CompanyRelayProxyCard } from "./relay-proxy-card";

const companyId = "11111111-aaaa-bbbb-cccc-000000000001";
const secretURL = `/api/v1/companies/${companyId}/relay-proxy-secret`;
const secret = { secret: "goff_rp_x", createdAt: "2026-11-26T10:00:00Z" };

// lastMutate returns the variables and callbacks of the last mutate call.
const lastMutate = () =>
  h.mutate.mock.lastCall as [{ url: string; method: string; values: unknown }, MutateCallbacks];
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
// The previous-secret messages go through <Trans>, so they render in English.
const alertText = () => screen.queryByText(/stays valid until/);
// The confirm button of the open dialog, named like the button that opened it.
const confirmButton = (name: string) => screen.getAllByRole("button", { name }).at(-1)!;

beforeEach(() => {
  h.data = secret;
  h.isLoading = false;
  h.isError = false;
  h.isPending = false;
  for (const fn of [h.refetch, h.mutate, h.copyToClipboard, h.toastSuccess, h.toastError]) fn.mockReset();
  h.copyToClipboard.mockResolvedValue(true);
});

describe("CompanyRelayProxyCard", () => {
  it("shows the studio snippet with the secret and copies it", async () => {
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(h.url).toBe(secretURL);
    const config =
      "studio:\n" +
      `  url: ${window.location.origin}/api/v1/relay-proxy/flagsets.json\n` +
      "  headers:\n    Authorization:\n      - Bearer goff_rp_x\n";

    await userEvent.click(screen.getByRole("button", { name: "common.copy" }));
    await waitFor(() => expect(h.copyToClipboard).toHaveBeenCalledWith(config));
    expect(screen.getByText("goff-proxy.yaml")).toBeInTheDocument();
    expect(screen.getByText("company.relayProxy.createdAt")).toBeInTheDocument();
  });

  it("generates the first secret without confirmation", async () => {
    h.data = null;
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(screen.getByText("company.relayProxy.noSecret")).toBeInTheDocument();
    expect(screen.queryByText("goff-proxy.yaml")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "company.relayProxy.generate" }));
    const [vars, callbacks] = lastMutate();
    expect(vars).toMatchObject({ url: secretURL, method: "post", values: {} });
    callbacks.onSuccess();
    expect(h.refetch).toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledWith("company.relayProxy.generated");
  });

  it("rotates only after confirming, and keeps the dialog open until the request ends", async () => {
    render(<CompanyRelayProxyCard companyId={companyId} />);
    await userEvent.click(screen.getByRole("button", { name: "company.relayProxy.rotate" }));
    expect(h.mutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("company.relayProxy.rotateDesc");

    // No previous secret: nothing to warn about revoking.
    expect(dialog).not.toHaveTextContent(/is revoked now/);

    await userEvent.click(confirmButton("company.relayProxy.rotate"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    const [vars, callbacks] = lastMutate();
    // 1 day is the default grace period.
    expect(vars).toMatchObject({ url: secretURL, method: "post", values: { keepPreviousSeconds: 86400 } });

    callbacks.onError(new Error("boom"));
    expect(h.toastError).toHaveBeenCalledWith("company.relayProxy.generateError", { description: "boom" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    callbacks.onSuccess();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("rotates with the chosen grace period", async () => {
    render(<CompanyRelayProxyCard companyId={companyId} />);
    await userEvent.click(screen.getByRole("button", { name: "company.relayProxy.rotate" }));
    await userEvent.click(screen.getByRole("combobox", { name: "company.relayProxy.keepPrevious" }));
    await userEvent.click(await screen.findByRole("option", { name: "company.relayProxy.keepOptions.week" }));
    await userEvent.click(confirmButton("company.relayProxy.rotate"));
    expect(lastMutate()[0].values).toEqual({ keepPreviousSeconds: 7 * 24 * 60 * 60 });
  });

  it("shows until when the previous secret is valid, and revokes it after confirming", async () => {
    h.data = { ...secret, previousExpiresAt: inAnHour(), previousSecretEnd: "1d0e3" };
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(alertText()).toBeInTheDocument();
    // Only the end of the previous secret, masked, as inline code.
    expect(screen.getByText("*****1d0e3").tagName).toBe("CODE");

    // Rotating again warns that the previous secret goes away.
    await userEvent.click(screen.getByRole("button", { name: "company.relayProxy.rotate" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/The previous secret \*{5}1d0e3, still valid until .+, is revoked now\./);
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "company.relayProxy.revokePrevious" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("company.relayProxy.revokePreviousDesc");
    await userEvent.click(confirmButton("company.relayProxy.revokePrevious"));
    const [vars, callbacks] = lastMutate();
    expect(vars).toMatchObject({ url: `${secretURL}/previous`, method: "delete" });

    callbacks.onError(new Error("boom"));
    expect(h.toastError).toHaveBeenCalledWith("company.relayProxy.revokePreviousError", { description: "boom" });
    callbacks.onSuccess();
    expect(h.toastSuccess).toHaveBeenCalledWith("company.relayProxy.previousRevoked");
    expect(h.refetch).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("drops the previous secret once it expires", () => {
    vi.useFakeTimers();
    try {
      h.data = { ...secret, previousExpiresAt: new Date(Date.now() + 1000).toISOString() };
      render(<CompanyRelayProxyCard companyId={companyId} />);
      expect(alertText()).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1001));
      expect(alertText()).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mention an already expired previous secret", () => {
    h.data = { ...secret, previousExpiresAt: "2020-01-01T00:00:00Z" };
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(alertText()).not.toBeInTheDocument();
  });

  it("disables the buttons while a request is pending", () => {
    h.data = null;
    h.isPending = true;
    render(<CompanyRelayProxyCard companyId={companyId} />);
    expect(screen.getByRole("button", { name: "company.relayProxy.generating" })).toBeDisabled();
  });

  const states = [
    { name: "loading", isLoading: true, isError: false, want: "common.loading" },
    { name: "error", isLoading: false, isError: true, want: "company.relayProxy.error" },
  ];
  for (const tt of states) {
    it(`shows the ${tt.name} state instead of the snippet`, () => {
      h.data = undefined;
      h.isLoading = tt.isLoading;
      h.isError = tt.isError;
      render(<CompanyRelayProxyCard companyId={companyId} />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      expect(screen.queryByText("goff-proxy.yaml")).not.toBeInTheDocument();
      expect(screen.queryByText("company.relayProxy.generate")).not.toBeInTheDocument();
    });
  }
});
