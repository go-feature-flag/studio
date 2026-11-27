import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
const lastMutate = () => h.mutate.mock.lastCall as [{ url: string; method: string }, MutateCallbacks];

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
    expect(vars).toMatchObject({ url: secretURL, method: "post" });
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

    const buttons = screen.getAllByRole("button", { name: "company.relayProxy.rotate" });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    const [vars, callbacks] = lastMutate();
    expect(vars).toMatchObject({ url: secretURL, method: "post" });

    callbacks.onError(new Error("boom"));
    expect(h.toastError).toHaveBeenCalledWith("company.relayProxy.generateError", { description: "boom" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    callbacks.onSuccess();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
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
